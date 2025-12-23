//! test-a
use serde_json::Value;
use tablefri_plugin_api::*;

pub struct TestAPlugin { ctx: Option<PluginContext> }

impl Default for TestAPlugin {
    fn default() -> Self { Self { ctx: None } }
}

impl Plugin for TestAPlugin {
    fn initialize(&mut self, ctx: &PluginContext) -> Result<(), String> {
        self.ctx = Some(ctx.clone());
        println!("[TestAPlugin] initialized: {}", ctx.plugin_id);
        Ok(())
    }
    fn shutdown(&mut self) -> Result<(), String> { println!("[TestAPlugin] shutdown"); Ok(()) }
    fn get_tools(&self) -> Vec<ToolDefinition> {
        let plugin_id = self.ctx.as_ref().map(|c| c.plugin_id.clone()).unwrap_or_else(|| "test-a".into());
        vec![ToolDefinition::no_params(&plugin_id, "hello", "Say hello from test-a")]
    }
    fn execute_tool(&self, call: &ToolCall) -> ToolResult {
        match call.name.as_str() {
            "hello" => ToolResult::success(json!({ "message": "Hello from test-a" })),
            _ => ToolResult::error("Unknown tool"),
        }
    }
    fn on_hook(&mut self, _hook: &str, _data: &Value) -> Option<Value> { None }
}

export_plugin!(TestAPlugin, TestAPlugin::default);
