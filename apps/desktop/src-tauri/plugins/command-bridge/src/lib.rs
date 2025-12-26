mod command;
mod commands;
mod config;
mod requests;
mod utils;

use command::{CommandError, CommandExecutor, CommandInterceptor, CommandPlan, NativeCommand};
use commands::base::CommandSpec;
use commands::ls::LsCommand;
use config::BridgeConfig;
use requests::{CommandRequest, RequestState, RequestStore};
use serde_json::{json, Value};
use std::path::PathBuf;
use tablefri_plugin_api::*;
use utils::path_utils::PathUtils;

const TOOL_LIST_DIRECTORY: &str = "list_directory";
const TOOL_STATUS: &str = "bridge_status";
const TOOL_HANDLE_REQUEST: &str = "handle_request";

/// 命令桥插件（精简版）：
/// - 仅保留命令封装、审批弹窗与执行结果回传
/// - 不再记录历史文件，不做长轮询
pub struct CommandBridgePlugin {
    ctx: Option<PluginContext>,
    config: BridgeConfig,
    executor: CommandExecutor,
    requests: RequestStore,
}

impl Default for CommandBridgePlugin {
    fn default() -> Self {
        Self {
            ctx: None,
            config: BridgeConfig::default(),
            executor: CommandExecutor::new(),
            requests: RequestStore::new(),
        }
    }
}

impl CommandBridgePlugin {
    /// 将命令结果格式化给 LLM，带状态与截断输出。
    fn format_command_result(
        &self,
        status: &str,
        plan_label: &str,
        stdout: &str,
        stderr: &str,
    ) -> String {
        let stdout_display = truncate(stdout, 1_500);
        let stderr_display = truncate(stderr, 1_500);

        let mut parts = vec![
            format!("status: {}", status),
            format!("command: {}", plan_label),
        ];

        if !stdout_display.is_empty() {
            parts.push(format!("stdout (truncated):\n{}", stdout_display));
        }
        if !stderr_display.is_empty() {
            parts.push(format!("stderr (truncated):\n{}", stderr_display));
        }

        parts.join("\n\n")
    }

    /// 返回插件在宿主中的唯一标识。
    fn plugin_id(&self) -> String {
        self.ctx
            .as_ref()
            .map(|c| c.plugin_id.clone())
            .unwrap_or_else(|| "command-bridge".to_string())
    }

    /// 工具实现：发起“列出目录”请求。
    ///
    /// 若命令需要审批，则创建请求并弹出窗口；否则直接执行。
    fn list_directory(&self, args: &Value) -> ToolResult {
        let include_hidden = args
            .get("includeHidden")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let target_dir =
            match PathUtils::resolve_directory(args.get("path").and_then(|v| v.as_str())) {
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

        let command = LsCommand::new(normalized.clone(), include_hidden, true);
        if !command.requires_approval() {
            return self.execute_command(&command);
        }

        let path_string = normalized.display().to_string();
        match self
            .requests
            .create_request(TOOL_LIST_DIRECTORY, &path_string, include_hidden)
        {
            Ok(request) => {
                let window_data = json!({
                    "request": request.clone(),
                    "requests": self.requests.list(),
                });
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

    /// 工具实现：返回插件状态（仅授权根与请求列表）。
    fn bridge_status(&self) -> ToolResult {
        ToolResult::success(json!({
            "pluginId": self.plugin_id(),
            "allowedRoots": self.config.allowed_roots(),
            "requests": self.requests.list(),
        }))
    }

    /// 工具实现：处理控制台窗口提交的审批结果。
    fn handle_request(&self, args: &Value) -> ToolResult {
        let request_id = match args.get("requestId").and_then(|v| v.as_str()) {
            Some(id) if !id.is_empty() => id,
            _ => return ToolResult::error("缺少 requestId 参数"),
        };

        let decision = args
            .get("decision")
            .and_then(|v| v.as_str())
            .unwrap_or("approve");

        let snapshot = match self.requests.get(request_id) {
            Some(r) => r,
            None => return ToolResult::error("未找到此请求"),
        };

        if snapshot.state != RequestState::Pending {
            return ToolResult::error("该请求已被处理");
        }

        if decision == "reject" {
            match self.requests.update(request_id, |req| {
                req.state = RequestState::Rejected;
                req.message = Some("已被用户拒绝".to_string());
            }) {
                Ok(updated) => {
                    let tool_result = self.format_command_result(
                        "rejected",
                        &updated.command,
                        "",
                        "用户拒绝执行此命令",
                    );
                    return ToolResult::success(json!({
                        "requestId": updated.id,
                        "status": format!("{}", updated.state),
                        "message": updated.message,
                        "toolResult": tool_result,
                        "llmMessage": format!(
                            "【系统提示】用户拒绝了查看目录 {} 的请求。",
                            updated.path
                        ),
                    }));
                }
                Err(e) => return ToolResult::error(&format!("更新请求失败: {e}")),
            }
        }

        self.execute_request(&snapshot)
    }

    /// 执行已审批通过的请求：
    /// 1) 将请求置为运行中；
    /// 2) 基于命令构建计划并执行；
    /// 3) 更新请求状态与输出；
    /// 4) 返回结构化结果给调用方。
    fn execute_request(&self, request: &CommandRequest) -> ToolResult {
        if let Err(e) = self.requests.update(&request.id, |req| {
            req.state = RequestState::Running;
            req.message = Some("执行中...".to_string());
            req.stdout = None;
            req.stderr = None;
        }) {
            return ToolResult::error(&format!("无法更新请求状态: {e}"));
        }

        let command = LsCommand::new(PathBuf::from(&request.path), request.include_hidden, true);
        let plan = command.build_plan();
        let plan_label = format!("{}: {}", plan.display_name, plan.description);

        match self.executor.execute(&plan) {
            Ok((output, _)) => {
                let final_state = if output.success {
                    RequestState::Completed
                } else {
                    RequestState::Failed
                };
                let summary = if output.success {
                    "执行完成".to_string()
                } else {
                    "命令返回非 0 状态".to_string()
                };

                if let Err(e) = self.requests.update(&request.id, |req| {
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

                let status = if output.success {
                    "completed"
                } else {
                    "failed"
                };
                let tool_result_message =
                    self.format_command_result(status, &plan_label, &output.stdout, &output.stderr);

                ToolResult::success(json!({
                    "requestId": request.id,
                    "status": format!("{}", final_state),
                    "path": request.path,
                    "includeHidden": request.include_hidden,
                    "stdout": output.stdout,
                    "stderr": output.stderr,
                    "success": output.success,
                    "toolResult": tool_result_message,
                }))
            }
            Err(e) => {
                let _ = self.requests.update(&request.id, |req| {
                    req.state = RequestState::Failed;
                    req.message = Some(format!("命令启动失败: {e}"));
                });
                ToolResult::error(&format!("命令执行失败: {e}"))
            }
        }
    }

    /// 直接执行命令（跳过审批）。
    fn execute_command(&self, command: &dyn CommandSpec) -> ToolResult {
        let plan = command.build_plan();
        let plan_label = format!("{}: {}", plan.display_name, plan.description);
        match self.executor.execute(&plan) {
            Ok((output, _)) => {
                let status = if output.success {
                    "completed"
                } else {
                    "failed"
                };
                ToolResult::success(json!({
                    "command": plan_label,
                    "stdout": output.stdout,
                    "stderr": output.stderr,
                    "success": output.success,
                    "toolResult": self.format_command_result(
                        status,
                        &plan_label,
                        &output.stdout,
                        &output.stderr,
                    ),
                }))
            }
            Err(e) => ToolResult::error(&format!("命令执行失败: {e}")),
        }
    }
}

impl Plugin for CommandBridgePlugin {
    /// 初始化插件：加载配置、注册目录守卫拦截器。
    fn initialize(&mut self, ctx: &PluginContext) -> Result<(), String> {
        self.ctx = Some(ctx.clone());
        self.config = BridgeConfig::from_value(&ctx.config);
        self.config.ensure_root(&ctx.data_dir);
        self.executor = CommandExecutor::new();
        self.executor.register(Box::new(DirectoryGuard::new(
            self.config.allowed_root_paths(),
        )));
        self.requests = RequestStore::new();
        println!("[CommandBridge] 已初始化, data_dir: {:?}", ctx.data_dir);
        Ok(())
    }

    /// 关闭插件（目前只打印日志）。
    fn shutdown(&mut self) -> Result<(), String> {
        println!("[CommandBridge] 已关闭");
        Ok(())
    }

    /// 返回该插件导出的所有工具定义（schema 供前端/LLM 进行参数校验）。
    fn get_tools(&self) -> Vec<ToolDefinition> {
        let plugin_id = self.plugin_id();
        vec![
            ToolDefinition::new(
                &plugin_id,
                TOOL_LIST_DIRECTORY,
                "执行命令列出目录内容（底层执行 ls/dir 命令）。此工具会执行系统命令，默认需要用户授权。支持 includeHidden (默认 true) 和 path 参数。",
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
                "获取 Command Bridge 插件状态（授权目录与请求列表）。",
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

    /// 工具分发入口，根据名称路由到具体实现。
    fn execute_tool(&self, call: &ToolCall) -> ToolResult {
        match call.name.as_str() {
            TOOL_LIST_DIRECTORY => self.list_directory(&call.arguments),
            TOOL_STATUS => self.bridge_status(),
            TOOL_HANDLE_REQUEST => self.handle_request(&call.arguments),
            _ => ToolResult::error(&format!("未知工具: {}", call.name)),
        }
    }

    /// 可选的钩子回调，当前未使用。
    fn on_hook(&mut self, _hook: &str, _data: &Value) -> Option<Value> {
        None
    }
}

export_plugin!(CommandBridgePlugin, CommandBridgePlugin::default);

/// 目录访问守卫：在命令执行前检查工作目录是否在授权根目录内。
struct DirectoryGuard {
    allowed: Vec<PathBuf>,
}

impl DirectoryGuard {
    /// 创建一个新的目录守卫。
    fn new(allowed: Vec<PathBuf>) -> Self {
        Self { allowed }
    }
}

impl CommandInterceptor for DirectoryGuard {
    /// 在命令执行前进行授权校验：
    /// 若工作目录不在任一授权根目录下，则拒绝执行。
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

/// 截断字符串到指定长度，超出部分添加省略号。
fn truncate(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        value.to_string()
    } else if limit == 0 {
        String::new()
    } else if limit == 1 {
        "…".to_string()
    } else {
        let end = limit.saturating_sub(1);
        format!("{}…", &value[..end])
    }
}
