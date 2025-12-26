//! shell-commander
use serde_json::Value;
use tablefri_plugin_api::*;

pub struct ShellCommanderPlugin { ctx: Option<PluginContext> }

impl Default for ShellCommanderPlugin {
    fn default() -> Self { Self { ctx: None } }
}

impl Plugin for ShellCommanderPlugin {
    fn initialize(&mut self, ctx: &PluginContext) -> Result<(), String> {
        self.ctx = Some(ctx.clone());
        println!("[ShellCommanderPlugin] initialized: {}", ctx.plugin_id);
        Ok(())
    }
    fn shutdown(&mut self) -> Result<(), String> { println!("[ShellCommanderPlugin] shutdown"); Ok(()) }
    fn get_tools(&self) -> Vec<ToolDefinition> {
        let plugin_id = self.ctx.as_ref().map(|c| c.plugin_id.clone()).unwrap_or_else(|| "shell-commander".into());
        vec![ToolDefinition::no_params(&plugin_id, "hello", "Say hello from shell-commander")]
    }
    fn execute_tool(&self, call: &ToolCall) -> ToolResult {
        match call.name.as_str() {
            "hello" => ToolResult::success(json!({ "message": "Hello from shell-commander" })),
            _ => ToolResult::error("Unknown tool"),
        }
    }
    fn on_hook(&mut self, _hook: &str, _data: &Value) -> Option<Value> { None }
}

export_plugin!(ShellCommanderPlugin, ShellCommanderPlugin::default);
