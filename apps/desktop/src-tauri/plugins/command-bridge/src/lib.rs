mod command;
mod config;
mod history;
mod requests;

use command::{CommandError, CommandExecutor, CommandInterceptor, CommandPlan, NativeCommand};
use config::BridgeConfig;
use history::{CommandRecord, HistoryStore};
use requests::{CommandRequest, RequestState, RequestStore};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use tablefri_plugin_api::*;

const HISTORY_FILE: &str = "command-history.json";
pub(crate) const REQUEST_FILE: &str = "command-requests.json";
const TOOL_LIST_DIRECTORY: &str = "list_directory";
const TOOL_STATUS: &str = "bridge_status";
const TOOL_HANDLE_REQUEST: &str = "handle_request";
const TOOL_POLL_UPDATES: &str = "poll_updates";

pub struct CommandBridgePlugin {
    ctx: Option<PluginContext>,
    config: BridgeConfig,
    executor: CommandExecutor,
    history: Option<HistoryStore>,
    requests: Option<RequestStore>,
    change_marker: Arc<(Mutex<u64>, Condvar)>,
}

impl Default for CommandBridgePlugin {
    fn default() -> Self {
        Self {
            ctx: None,
            config: BridgeConfig::default(),
            executor: CommandExecutor::new(),
            history: None,
            requests: None,
            change_marker: Arc::new((Mutex::new(1), Condvar::new())),
        }
    }
}

impl CommandBridgePlugin {
    fn plugin_id(&self) -> String {
        self.ctx
            .as_ref()
            .map(|c| c.plugin_id.clone())
            .unwrap_or_else(|| "command-bridge".to_string())
    }

    fn history_file_url(&self) -> Option<String> {
        self.history
            .as_ref()
            .map(|store| store.public_path(&self.plugin_id()))
    }

    fn request_file_url(&self) -> Option<String> {
        self.requests
            .as_ref()
            .map(|store| store.public_path(&self.plugin_id()))
    }

    fn limited_history(&self, limit: usize) -> Vec<CommandRecord> {
        self.history
            .as_ref()
            .and_then(|store| store.load().ok())
            .map(|mut records| {
                if records.len() > limit {
                    records.drain(0..records.len() - limit);
                }
                records
            })
            .unwrap_or_default()
    }

    fn notify_change(&self) -> u64 {
        let (lock, condvar) = &*self.change_marker;
        let mut version = lock.lock().unwrap();
        *version = version.saturating_add(1);
        let new_version = *version;
        condvar.notify_all();
        new_version
    }

    fn current_version(&self) -> u64 {
        let (lock, _) = &*self.change_marker;
        *lock.lock().unwrap()
    }

    fn resolve_directory(&self, arg: Option<&str>) -> Result<PathBuf, String> {
        if let Some(raw) = arg {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Err("目标目录不能为空".to_string());
            }
            return Ok(expand_path(trimmed));
        }

        if let Some(ctx) = &self.ctx {
            return Ok(ctx.data_dir.clone());
        }

        std::env::current_dir().map_err(|e| e.to_string())
    }

    fn list_directory(&self, args: &Value) -> ToolResult {
        let include_hidden = args
            .get("includeHidden")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let target_dir = match self.resolve_directory(args.get("path").and_then(|v| v.as_str())) {
            Ok(dir) => dir,
            Err(e) => return ToolResult::error(&e),
        };

        if !target_dir.exists() {
            return ToolResult::error("指定的目录不存在");
        }
        if !target_dir.is_dir() {
            return ToolResult::error("目标路径不是目录");
        }
        let normalized = target_dir
            .canonicalize()
            .unwrap_or_else(|_| target_dir.clone());

        if !self.config.is_allowed(&normalized) {
            return ToolResult::error("该目录暂未被授权访问，可在配置中添加");
        }

        let requests = match &self.requests {
            Some(store) => store,
            None => return ToolResult::error("请求存储未初始化"),
        };

        let path_string = normalized.display().to_string();
        let history_file = self.history_file_url();
        let requests_file = self.request_file_url();

        match requests.create_request(TOOL_LIST_DIRECTORY, &path_string, include_hidden) {
            Ok(request) => {
                let mut window_data = json!({
                    "request": request,
                    "requests": requests.list(),
                    "history": self.limited_history(20),
                });
                if let Some(url) = requests_file {
                    window_data["requestsFile"] = json!(url);
                }
                if let Some(url) = history_file {
                    window_data["historyFile"] = json!(url);
                }
                let version = self.notify_change();
                window_data["version"] = json!(version);

                ToolResult::success(json!({
                    "action": "open_window",
                    "window": "console",
                    "title": "Command Bridge Console",
                    "windowData": window_data,
                    "message": "等待用户授权以执行 ls -a/dir"
                }))
            }
            Err(e) => ToolResult::error(&format!("记录请求失败: {e}")),
        }
    }

    fn bridge_status(&self) -> ToolResult {
        let history_file = self.history_file_url();

        let history_entries = self.limited_history(50);
        let request_entries = self
            .requests
            .as_ref()
            .map(|store| store.list())
            .unwrap_or_default();

        ToolResult::success(json!({
            "pluginId": self.plugin_id(),
            "allowedRoots": self.config.allowed_roots(),
            "historyFile": history_file,
            "history": history_entries,
            "requests": request_entries,
            "requestsFile": self.request_file_url(),
            "version": self.current_version(),
        }))
    }

    fn handle_request(&self, args: &Value) -> ToolResult {
        let request_id = match args.get("requestId").and_then(|v| v.as_str()) {
            Some(id) if !id.is_empty() => id,
            _ => return ToolResult::error("缺少 requestId 参数"),
        };

        let decision = args
            .get("decision")
            .and_then(|v| v.as_str())
            .unwrap_or("approve");

        let store = match &self.requests {
            Some(store) => store,
            None => return ToolResult::error("请求存储未初始化"),
        };

        let snapshot = match store.get(request_id) {
            Some(r) => r,
            None => return ToolResult::error("未找到此请求"),
        };

        if snapshot.state != RequestState::Pending {
            return ToolResult::error("该请求已被处理");
        }

        if decision == "reject" {
            match store.update(request_id, |req| {
                req.state = RequestState::Rejected;
                req.message = Some("已被用户拒绝".to_string());
            }) {
                Ok(updated) => {
                    self.notify_change();
                    return ToolResult::success(json!({
                        "requestId": updated.id,
                        "status": format!("{}", updated.state),
                        "message": updated.message,
                        "llmMessage": format!(
                            "【系统提示】主人拒绝了查看目录 {} 的请求。\n\n请用自然的方式告诉主人你已经知道了，可以询问是否需要查看其他目录，或者等待主人的下一步指示。",
                            updated.path
                        ),
                    }));
                }
                Err(e) => return ToolResult::error(&format!("更新请求失败: {e}")),
            }
        }

        self.execute_request(store, &snapshot)
    }

    fn execute_request(&self, store: &RequestStore, request: &CommandRequest) -> ToolResult {
        if let Err(e) = store.update(&request.id, |req| {
            req.state = RequestState::Running;
            req.message = Some("执行中...".to_string());
            req.stdout = None;
            req.stderr = None;
        }) {
            return ToolResult::error(&format!("无法更新请求状态: {e}"));
        }

        let target_path = PathBuf::from(&request.path);
        let plan = build_list_directory_plan(&target_path, request.include_hidden);
        let (output, native) = match self.executor.execute(&plan) {
            Ok(result) => result,
            Err(e) => {
                let _ = store.update(&request.id, |req| {
                    req.state = RequestState::Failed;
                    req.message = Some(format!("命令启动失败: {e}"));
                });
                return ToolResult::error(&format!("命令执行失败: {e}"));
            }
        };

        if let Some(history) = &self.history {
            if let Err(e) = history.append(CommandRecord::from_execution(&plan, &native, &output)) {
                eprintln!("[CommandBridge] 写入历史失败: {}", e);
            }
        }

        let entries: Vec<String> = output
            .stdout
            .lines()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .map(|line| line.to_string())
            .collect();

        let final_state = if output.success {
            RequestState::Completed
        } else {
            RequestState::Failed
        };
        let summary = if output.success {
            format!("执行完成，共 {} 条目", entries.len())
        } else {
            "命令返回非 0 状态".to_string()
        };

        if let Err(e) = store.update(&request.id, |req| {
            req.state = final_state.clone();
            req.message = Some(summary.clone());
            req.stdout = Some(output.stdout.clone());
            req.stderr = if output.stderr.is_empty() {
                None
            } else {
                Some(output.stderr.clone())
            };
        }) {
            eprintln!("[CommandBridge] 更新请求状态失败: {}", e);
        }

        self.notify_change();

        // 生成工具执行结果，格式化为 AI 可以直接使用的格式
        // 这个结果会被作为工具调用的返回值，让 AI 能够基于结果继续对话
        let tool_result_message = if output.success {
            // 限制条目数量，避免消息过长
            let display_entries: Vec<String> = entries
                .iter()
                .take(30) // 最多显示 30 项
                .cloned()
                .collect();

            let entries_text = if entries.len() <= 30 {
                display_entries.join("\n")
            } else {
                format!(
                    "{}\n... (还有 {} 项未显示)",
                    display_entries.join("\n"),
                    entries.len() - 30
                )
            };

            // 格式化为工具执行结果，明确说明这是执行完成的结果
            format!(
                "工具 list_directory 执行成功。\n\n目录路径: {}\n文件/文件夹总数: {}\n\n目录内容:\n{}",
                request.path,
                entries.len(),
                entries_text
            )
        } else {
            format!(
                "工具 list_directory 执行失败。\n\n目录路径: {}\n错误信息: {}",
                request.path,
                if output.stderr.is_empty() {
                    "未知错误"
                } else {
                    &output.stderr
                }
            )
        };

        // 保留 llmMessage 用于系统消息（可选）
        let llm_message = tool_result_message.clone();

        ToolResult::success(json!({
            "requestId": request.id,
            "status": format!("{}", final_state),
            "path": request.path,
            "includeHidden": request.include_hidden,
            "entries": entries,
            "stdout": output.stdout,
            "stderr": output.stderr,
            "success": output.success,
            // toolResult 是给 AI 的工具执行结果，会被作为工具调用的返回值
            "toolResult": tool_result_message,
            // llmMessage 用于系统消息（可选，用于通知）
            "llmMessage": llm_message,
        }))
    }

    fn poll_updates(&self, args: &Value) -> ToolResult {
        let since = args.get("since").and_then(|v| v.as_u64()).unwrap_or(0);
        let timeout_ms = args
            .get("timeoutMs")
            .and_then(|v| v.as_u64())
            .unwrap_or(25_000)
            .clamp(1_000, 60_000);

        let (lock, condvar) = &*self.change_marker;
        let mut version = lock.lock().unwrap();
        if *version <= since {
            let duration = std::time::Duration::from_millis(timeout_ms);
            let (guard, result) = condvar.wait_timeout(version, duration).unwrap();
            version = guard;
            if result.timed_out() && *version <= since {
                return ToolResult::success(json!({
                    "hasUpdate": false,
                    "version": *version,
                }));
            }
        }

        let new_version = *version;
        drop(version);

        ToolResult::success(json!({
            "hasUpdate": true,
            "version": new_version,
            "requests": self
                .requests
                .as_ref()
                .map(|store| store.list())
                .unwrap_or_default(),
            "history": self.limited_history(20),
            "historyFile": self.history_file_url(),
            "requestsFile": self.request_file_url(),
        }))
    }
}

fn build_list_directory_plan(target_dir: &Path, include_hidden: bool) -> CommandPlan {
    let mut unix_args = vec!["-1".to_string()];
    if include_hidden {
        unix_args.insert(0, "-a".to_string());
    }

    let unix = NativeCommand::new("ls")
        .with_args(unix_args)
        .working_dir(target_dir);

    let mut windows_args = vec!["/C".to_string(), "dir".to_string(), "/b".to_string()];
    if include_hidden {
        windows_args.push("/a".to_string());
    }
    let windows = NativeCommand::new("cmd")
        .with_args(windows_args)
        .working_dir(target_dir);

    CommandPlan::new(
        TOOL_LIST_DIRECTORY,
        "List directory",
        format!(
            "List directory {}{}",
            target_dir.display(),
            if include_hidden {
                " (include hidden)"
            } else {
                ""
            }
        ),
        unix,
    )
    .with_windows(windows)
}

fn expand_path(input: &str) -> PathBuf {
    if let Some(rest) = input.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    } else if input == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    PathBuf::from(input)
}

impl Plugin for CommandBridgePlugin {
    fn initialize(&mut self, ctx: &PluginContext) -> Result<(), String> {
        self.ctx = Some(ctx.clone());
        self.config = BridgeConfig::from_value(&ctx.config);
        self.config.ensure_root(&ctx.data_dir);
        self.executor = CommandExecutor::new();
        self.executor.register(Box::new(DirectoryGuard::new(
            self.config.allowed_root_paths(),
        )));
        self.history = Some(HistoryStore::new(
            ctx.data_dir.join(HISTORY_FILE),
            self.config.history_depth(),
        ));
        self.requests = match RequestStore::new(ctx.data_dir.join(REQUEST_FILE)) {
            Ok(store) => Some(store),
            Err(e) => {
                eprintln!("[CommandBridge] 初始化请求存储失败: {}", e);
                None
            }
        };
        println!("[CommandBridge] 已初始化, data_dir: {:?}", ctx.data_dir);
        Ok(())
    }

    fn shutdown(&mut self) -> Result<(), String> {
        println!("[CommandBridge] 已关闭");
        Ok(())
    }

    fn get_tools(&self) -> Vec<ToolDefinition> {
        let plugin_id = self.plugin_id();
        vec![
            ToolDefinition::new(
                &plugin_id,
                TOOL_LIST_DIRECTORY,
                "执行命令列出目录内容（底层执行 ls/dir 命令）。此工具会执行系统命令，需要用户授权。支持 includeHidden (默认 true) 和 path 参数。",
                json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "要列出的目标目录路径，支持 ~ 开头"
                        },
                        "includeHidden": {
                            "type": "boolean",
                            "description": "是否包含隐藏文件。非 Windows 下映射到 ls -a",
                            "default": true
                        }
                    }
                }),
            ),
            ToolDefinition::no_params(
                &plugin_id,
                TOOL_STATUS,
                "获取 Command Bridge 插件状态，包括已授权的目录列表和命令执行历史记录。",
            ),
            ToolDefinition::new(
                &plugin_id,
                TOOL_HANDLE_REQUEST,
                "处理命令请求的审批结果（仅插件窗口调用）",
                json!({
                    "type": "object",
                    "properties": {
                        "requestId": {
                            "type": "string",
                            "description": "待处理请求 ID"
                        },
                        "decision": {
                            "type": "string",
                            "enum": ["approve", "reject"],
                            "description": "操作类型，默认为 approve"
                        }
                    },
                    "required": ["requestId"]
                }),
            ),
            ToolDefinition::new(
                &plugin_id,
                TOOL_POLL_UPDATES,
                "长连接轮询 Command Bridge 更新（窗口内部使用）",
                json!({
                    "type": "object",
                    "properties": {
                        "since": {
                            "type": "number",
                            "description": "已知的最新版本号",
                            "default": 0
                        },
                        "timeoutMs": {
                            "type": "number",
                            "description": "超时时间，默认 25000 毫秒"
                        }
                    }
                }),
            ),
        ]
    }

    fn execute_tool(&self, call: &ToolCall) -> ToolResult {
        match call.name.as_str() {
            TOOL_LIST_DIRECTORY => self.list_directory(&call.arguments),
            TOOL_STATUS => self.bridge_status(),
            TOOL_HANDLE_REQUEST => self.handle_request(&call.arguments),
            TOOL_POLL_UPDATES => self.poll_updates(&call.arguments),
            _ => ToolResult::error(&format!("未知工具: {}", call.name)),
        }
    }

    fn on_hook(&mut self, _hook: &str, _data: &Value) -> Option<Value> {
        None
    }
}

export_plugin!(CommandBridgePlugin, CommandBridgePlugin::default);

struct DirectoryGuard {
    allowed: Vec<PathBuf>,
}

impl DirectoryGuard {
    fn new(allowed: Vec<PathBuf>) -> Self {
        Self { allowed }
    }
}

impl CommandInterceptor for DirectoryGuard {
    fn before_execute(
        &self,
        plan: &CommandPlan,
        native: &NativeCommand,
    ) -> Result<(), CommandError> {
        if let Some(dir) = &native.working_dir {
            let normalized = dir.canonicalize().unwrap_or_else(|_| dir.clone());
            if self.allowed.iter().any(|root| normalized.starts_with(root)) {
                return Ok(());
            }
            return Err(CommandError::Unauthorized {
                command_id: plan.id,
                reason: format!("工作目录 {} 未被授权", normalized.display()),
            });
        }
        Ok(())
    }
}
