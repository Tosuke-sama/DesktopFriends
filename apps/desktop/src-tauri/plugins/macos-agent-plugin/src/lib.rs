//! macOS Agent 插件
//!
//! 提供访问和控制 macOS 内置应用的功能：
//! - 备忘录（Notes）：读取、创建、编辑、删除
//! - 日历（Calendar）：读取、创建事件（计划中）
//! - 其他内置应用（计划中）

mod applescript;
mod config;
mod notes;

use config::ConfigManager;
use notes::{Note, NotesManager};
use serde_json::Value;
use std::sync::Mutex;
use tablefri_plugin_api::*;

/// macOS Agent 插件
pub struct MacOSAgentPlugin {
    /// 插件上下文
    ctx: Option<PluginContext>,
    /// 配置管理器
    config: Mutex<ConfigManager>,
}

impl Default for MacOSAgentPlugin {
    fn default() -> Self {
        Self {
            ctx: None,
            config: Mutex::new(ConfigManager::new(&Value::Null)),
        }
    }
}

impl MacOSAgentPlugin {
    /// 获取插件 ID
    fn plugin_id(&self) -> String {
        self.ctx
            .as_ref()
            .map(|c| c.plugin_id.clone())
            .unwrap_or_else(|| "macos-agent-plugin".to_string())
    }
}

impl Plugin for MacOSAgentPlugin {
    fn initialize(&mut self, ctx: &PluginContext) -> Result<(), String> {
        self.ctx = Some(ctx.clone());
        
        // 初始化配置管理器
        *self.config.lock().unwrap() = ConfigManager::new(&ctx.config);
        
        println!("[macOS Agent] 插件已初始化，数据目录: {:?}", ctx.data_dir);
        Ok(())
    }

    fn shutdown(&mut self) -> Result<(), String> {
        println!("[macOS Agent] 插件已关闭");
        Ok(())
    }

    fn get_tools(&self) -> Vec<ToolDefinition> {
        let plugin_id = self.plugin_id();
        let config = self.config.lock().unwrap();
        
        let mut tools = Vec::new();
        
        // 配置工具（用于 UI 读取配置）
        tools.push(ToolDefinition::no_params(
            &plugin_id,
            "get_config",
            "获取插件当前配置，包括权限设置。仅供 UI 使用。",
        ));
        
        // 备忘录工具（仅在 macOS 上且权限允许时提供）
        #[cfg(target_os = "macos")]
        {
            if config.can_read_notes() {
                tools.push(ToolDefinition::no_params(
                    &plugin_id,
                    "read_notes",
                    "读取所有备忘录列表。返回备忘录的名称和内容预览。需要插件权限中启用备忘录读取权限。",
                ));
            }
        }
        
        tools
    }

    fn execute_tool(&self, call: &ToolCall) -> ToolResult {
        let config = self.config.lock().unwrap();
        
        match call.name.as_str() {
            "get_config" => {
                // 返回当前配置
                let permissions = config.get_permissions();
                ToolResult::success(json!({
                    "permissions": permissions
                }))
            }
            
            "read_notes" => {
                // 检查权限
                if !config.can_read_notes() {
                    return ToolResult::error("未授予备忘录读取权限。请在插件设置中启用。");
                }
                
                // 仅在 macOS 上执行
                #[cfg(target_os = "macos")]
                {
                    match NotesManager::list_notes() {
                        Ok(notes) => {
                            // 限制返回的备忘录数量，避免数据过大
                            let limited_notes: Vec<Note> = notes
                                .into_iter()
                                .take(50)
                                .map(|note| Note {
                                    // 截断内容预览
                                    body: if note.body.len() > 200 {
                                        format!("{}...", &note.body[..200])
                                    } else {
                                        note.body
                                    },
                                    ..note
                                })
                                .collect();
                            
                            ToolResult::success(json!({
                                "notes": limited_notes,
                                "count": limited_notes.len()
                            }))
                        }
                        Err(e) => ToolResult::error(&format!("读取备忘录失败: {}", e)),
                    }
                }
                
                #[cfg(not(target_os = "macos"))]
                {
                    ToolResult::error("此功能仅在 macOS 上可用")
                }
            }
            
            _ => ToolResult::error(&format!("未知工具: {}", call.name)),
        }
    }

    fn on_hook(&mut self, _hook_name: &str, _data: &Value) -> Option<Value> {
        // 当前版本不处理钩子
        None
    }
}

// 导出插件
export_plugin!(MacOSAgentPlugin, MacOSAgentPlugin::default);
