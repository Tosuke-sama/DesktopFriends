//! 插件系统
//!
//! TableFri 桌面端插件系统，支持动态库加载、完整生命周期管理和 LLM 工具扩展
//! 使用 C-stable ABI，通过 JSON 字符串传递复杂数据类型

pub mod api;
pub mod commands;
pub mod hooks;
pub mod loader;
pub mod manager;
pub mod registry;

// 重新导出常用类型
pub use api::{PluginContext, PluginInfo, PluginManifest, ToolCall, ToolDefinition, ToolResult};
pub use manager::PluginManager;

// 重新导出命令（用于 Tauri invoke_handler）
pub use commands::*;
