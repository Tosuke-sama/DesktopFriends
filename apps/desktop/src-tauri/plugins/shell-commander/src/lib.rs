//! shell-commander
use common::*;
use serde_json::Value;

pub struct ShellCommanderPlugin {
    ctx: Option<PluginContext>,
}

impl Default for ShellCommanderPlugin {
    fn default() -> Self {
        Self { ctx: None }
    }
}

impl Plugin for ShellCommanderPlugin {
    fn initialize(&mut self, ctx: &PluginContext) -> Result<(), String> {
        self.ctx = Some(ctx.clone());
        println!("[ShellCommanderPlugin] initialized: {}", ctx.plugin_id);
        Ok(())
    }
    fn shutdown(&mut self) -> Result<(), String> {
        println!("[ShellCommanderPlugin] shutdown");
        Ok(())
    }
    fn get_tools(&self) -> Vec<ToolDefinition> {
        let plugin_id = self
            .ctx
            .as_ref()
            .map(|c| c.plugin_id.clone())
            .unwrap_or_else(|| "shell-commander".into());

        vec![ToolDefinition::no_params(
            &plugin_id,
            "get_system_info",
            "获取当前操作系统和架构信息",
        )]
    }
    fn execute_tool(&self, call: &ToolCall) -> ToolResult {
        match call.name.as_str() {
            "get_system_info" => {
                let res = json!({
                    "os": std::env::consts::OS,
                    "arch": std::env::consts::ARCH,
                });
                println!("[ShellCommanderPlugin] get_system_info: {}", res);
                ToolResult::success(res)
            }
            _ => ToolResult::error("Unknown tool"),
        }
    }
    fn on_hook(&mut self, _hook: &str, _data: &Value) -> Option<Value> {
        None
    }
}

export_plugin!(ShellCommanderPlugin, ShellCommanderPlugin::default);
