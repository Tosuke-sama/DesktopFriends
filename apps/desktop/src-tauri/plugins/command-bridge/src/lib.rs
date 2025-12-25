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
use tablefri_plugin_api::*;

const HISTORY_FILE: &str = "command-history.json";
const REQUEST_FILE: &str = "command-requests.json";
const TOOL_LIST_DIRECTORY: &str = "list_directory";
const TOOL_STATUS: &str = "bridge_status";
const TOOL_HANDLE_REQUEST: &str = "handle_request";

pub struct CommandBridgePlugin {
    ctx: Option<PluginContext>,
    config: BridgeConfig,
    executor: CommandExecutor,
    history: Option<HistoryStore>,
    requests: Option<RequestStore>,
}

impl Default for CommandBridgePlugin {
    fn default() -> Self {
        Self {
            ctx: None,
            config: BridgeConfig::default(),
            executor: CommandExecutor::new(),
            history: None,
            requests: None,
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
        match requests.create_request(TOOL_LIST_DIRECTORY, &path_string, include_hidden) {
            Ok(request) => ToolResult::success(json!({
                "action": "open_window",
                "window": "console",
                "title": "Command Bridge Console",
                "request": request,
                "message": "等待用户授权以执行 ls -a/dir"
            })),
            Err(e) => ToolResult::error(&format!("记录请求失败: {e}")),
        }
    }

    fn bridge_status(&self) -> ToolResult {
        let history_file = self
            .history
            .as_ref()
            .map(|store| store.public_path(&self.plugin_id()));

        let history_entries = match &self.history {
            Some(store) => match store.load() {
                Ok(records) => records,
                Err(e) => {
                    eprintln!("[CommandBridge] 读取历史失败: {}", e);
                    Vec::new()
                }
            },
            None => Vec::new(),
        };

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
                    return ToolResult::success(json!({
                        "requestId": updated.id,
                        "status": format!("{}", updated.state),
                        "message": updated.message,
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

        ToolResult::success(json!({
            "requestId": request.id,
            "status": format!("{}", final_state),
            "path": request.path,
            "includeHidden": request.include_hidden,
            "entries": entries,
            "stdout": output.stdout,
            "stderr": output.stderr,
            "success": output.success,
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
                "列出目录内容（底层使用 ls/dir）。支持 includeHidden (默认 true) 和 path 参数。",
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
                "获取 Command Bridge 的授权目录和命令历史。",
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
        ]
    }

    fn execute_tool(&self, call: &ToolCall) -> ToolResult {
        match call.name.as_str() {
            TOOL_LIST_DIRECTORY => self.list_directory(&call.arguments),
            TOOL_STATUS => self.bridge_status(),
            TOOL_HANDLE_REQUEST => self.handle_request(&call.arguments),
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
