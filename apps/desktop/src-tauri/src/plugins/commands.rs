//! Tauri 插件命令
//!
//! 提供前端调用的插件管理 API

use super::api::{PluginInfo, ToolCall, ToolDefinition, ToolResult};
use super::hooks::HookResult;
use super::manager::PluginManager;
use serde_json::Value;
use std::sync::Mutex;
use tauri::State;

/// 安装插件
#[tauri::command]
pub fn plugin_install(
    manager: State<'_, Mutex<PluginManager>>,
    zip_path: String,
) -> Result<PluginInfo, String> {
    let mut manager = manager.lock().map_err(|e| e.to_string())?;
    manager
        .install(std::path::Path::new(&zip_path))
        .map_err(|e| e.to_string())
}

/// 卸载插件
#[tauri::command]
pub fn plugin_uninstall(
    manager: State<'_, Mutex<PluginManager>>,
    plugin_id: String,
) -> Result<(), String> {
    let mut manager = manager.lock().map_err(|e| e.to_string())?;
    manager.uninstall(&plugin_id).map_err(|e| e.to_string())
}

/// 启用插件
#[tauri::command]
pub fn plugin_enable(
    manager: State<'_, Mutex<PluginManager>>,
    plugin_id: String,
) -> Result<(), String> {
    let mut manager = manager.lock().map_err(|e| e.to_string())?;
    manager.enable(&plugin_id).map_err(|e| e.to_string())
}

/// 禁用插件
#[tauri::command]
pub fn plugin_disable(
    manager: State<'_, Mutex<PluginManager>>,
    plugin_id: String,
) -> Result<(), String> {
    let mut manager = manager.lock().map_err(|e| e.to_string())?;
    manager.disable(&plugin_id).map_err(|e| e.to_string())
}

/// 获取插件列表
#[tauri::command]
pub fn plugin_list(manager: State<'_, Mutex<PluginManager>>) -> Result<Vec<PluginInfo>, String> {
    let manager = manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.list())
}

/// 获取单个插件信息
#[tauri::command]
pub fn plugin_get(
    manager: State<'_, Mutex<PluginManager>>,
    plugin_id: String,
) -> Result<PluginInfo, String> {
    let manager = manager.lock().map_err(|e| e.to_string())?;
    manager.get(&plugin_id).map_err(|e| e.to_string())
}

/// 获取所有插件提供的工具
#[tauri::command]
pub fn plugin_get_tools(
    manager: State<'_, Mutex<PluginManager>>,
) -> Result<Vec<ToolDefinition>, String> {
    let manager = manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.get_all_tools())
}

/// 执行插件工具
#[tauri::command]
pub async fn plugin_execute_tool(
    app: tauri::AppHandle,
    manager: State<'_, Mutex<PluginManager>>,
    plugin_id: String,
    tool_name: String,
    arguments: Value,
) -> Result<ToolResult, String> {
    let call = ToolCall {
        name: tool_name,
        arguments,
    };

    // 在 await 之前释放锁
    let result = {
        let manager = manager.lock().map_err(|e| e.to_string())?;
        manager
            .execute_tool(&plugin_id, &call)
            .map_err(|e| e.to_string())?
    };

    if let Err(e) = handle_tool_side_effects(&app, &plugin_id, &result).await {
        eprintln!(
            "[PluginCommands] 处理工具副作用失败: plugin={} err={}",
            plugin_id, e
        );
    }

    Ok(result)
}

async fn handle_tool_side_effects(
    app: &tauri::AppHandle,
    plugin_id: &str,
    result: &ToolResult,
) -> Result<(), String> {
    let data = match &result.data {
        Value::Object(map) => map,
        _ => return Ok(()),
    };

    let action = data.get("action").and_then(|v| v.as_str()).unwrap_or("");

    match action {
        "open_window" => {
            let window_name = data
                .get("window")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "缺少 window 字段".to_string())?;
            let title = data
                .get("title")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let window_data = data.get("windowData").cloned();

            super::window::open_plugin_window_internal(
                app.clone(),
                plugin_id.to_string(),
                window_name.to_string(),
                title,
                window_data,
            )
            .await
            .map(|_| ())
        }
        _ => Ok(()),
    }
}

/// 触发钩子
#[tauri::command]
pub fn plugin_trigger_hook(
    manager: State<'_, Mutex<PluginManager>>,
    hook_name: String,
    data: Value,
) -> Result<Vec<HookResult>, String> {
    let mut manager = manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.trigger_hook(&hook_name, &data))
}

/// 读取插件 UI 文件
#[tauri::command]
pub fn plugin_read_ui(
    manager: State<'_, Mutex<PluginManager>>,
    plugin_id: String,
    path: String,
) -> Result<String, String> {
    let manager = manager.lock().map_err(|e| e.to_string())?;
    manager
        .read_plugin_ui(&plugin_id, &path)
        .map_err(|e| e.to_string())
}

/// 更新插件配置
#[tauri::command]
pub fn plugin_set_config(
    manager: State<'_, Mutex<PluginManager>>,
    plugin_id: String,
    config: Value,
) -> Result<(), String> {
    let mut manager = manager.lock().map_err(|e| e.to_string())?;
    manager
        .set_config(&plugin_id, config)
        .map_err(|e| e.to_string())
}

/// 刷新插件列表
#[tauri::command]
pub fn plugin_refresh(manager: State<'_, Mutex<PluginManager>>) -> Result<(), String> {
    let mut manager = manager.lock().map_err(|e| e.to_string())?;
    manager.refresh().map_err(|e| e.to_string())
}

/// 打开插件窗口
///
/// 参数:
/// - plugin_id: 插件 ID
/// - window_name: 窗口名称（对应 manifest 中的 ui.windows 配置）
/// - title: 窗口标题
/// - data: 传递给窗口的初始数据
#[tauri::command]
pub async fn open_plugin_window(
    app: tauri::AppHandle,
    plugin_id: String,
    window_name: String,
    title: Option<String>,
    data: Option<serde_json::Value>,
) -> Result<String, String> {
    super::window::open_plugin_window_internal(app, plugin_id, window_name, title, data).await
}
