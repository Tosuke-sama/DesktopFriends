//! 插件窗口工具函数

use super::manager::PluginManager;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// 打开插件窗口（内部实现）
pub async fn open_plugin_window_internal(
    app: AppHandle,
    plugin_id: String,
    window_name: String,
    title: Option<String>,
    data: Option<Value>,
) -> Result<String, String> {
    // 获取插件管理器
    let manager_state = app.state::<Mutex<PluginManager>>();
    let manager = manager_state
        .lock()
        .map_err(|e| format!("锁定插件管理器失败: {}", e))?;

    // 获取窗口配置
    let (plugin_dir, window_config): (PathBuf, Value) = manager
        .get_plugin_window_config(&plugin_id, &window_name)
        .map_err(|e: super::manager::ManagerError| e.to_string())?;

    // 获取 HTML 路径
    let html_path = window_config
        .get("path")
        .and_then(|p| p.as_str())
        .ok_or_else(|| "窗口配置缺少 path 字段".to_string())?;

    // 构建完整的 HTML 文件路径
    let full_html_path = plugin_dir.join(html_path);
    if !full_html_path.exists() {
        return Err(format!("窗口 HTML 文件不存在: {:?}", full_html_path));
    }

    // 获取窗口尺寸配置
    let width = window_config
        .get("width")
        .and_then(|w| w.as_f64())
        .unwrap_or(900.0);
    let height = window_config
        .get("height")
        .and_then(|h| h.as_f64())
        .unwrap_or(700.0);

    // 获取默认窗口标题
    let default_title = window_config
        .get("title")
        .and_then(|t| t.as_str())
        .unwrap_or("插件窗口")
        .to_string();

    drop(manager); // 释放锁

    // 生成唯一的窗口标签
    let window_label = format!(
        "plugin-{}-{}-{}",
        plugin_id,
        window_name,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );

    // 窗口标题
    let window_title = title.unwrap_or(default_title);

    // 使用自定义 plugin:// 协议加载插件的 HTML
    let mut plugin_url = format!("plugin://localhost/{}/{}", plugin_id, html_path);

    // 构建查询参数
    let mut query_pairs = Vec::new();
    if let Some(ref init_data) = data {
        if let Some(path) = init_data.get("path").and_then(|p| p.as_str()) {
            let encoded_path = urlencoding::encode(path);
            query_pairs.push(format!("path={}", encoded_path));
        }
        if let Ok(json) = serde_json::to_string(init_data) {
            let encoded = URL_SAFE_NO_PAD.encode(json);
            query_pairs.push(format!("state={}", encoded));
        }
    }

    if !query_pairs.is_empty() {
        let joiner = if plugin_url.contains('?') { '&' } else { '?' };
        plugin_url = format!("{}{}{}", plugin_url, joiner, query_pairs.join("&"));
    }

    println!(
        "[PluginWindow] 创建窗口: {} -> {}",
        window_label, plugin_url
    );

    // 创建窗口
    let _window = tauri::WindowBuilder::new(
        &app,
        &window_label,
        tauri::WindowUrl::External(
            plugin_url
                .parse()
                .map_err(|e| format!("无效的 URL: {}", e))?,
        ),
    )
    .title(window_title)
    .inner_size(width, height)
    .min_inner_size(400.0, 300.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|e| format!("创建窗口失败: {}", e))?;

    // 同时也尝试发送初始数据给窗口（作为后备）
    if let Some(init_data) = data {
        let app_clone = app.clone();
        let window_label_clone = window_label.clone();
        tauri::async_runtime::spawn(async move {
            // 等待窗口加载
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;

            // 发送初始化数据
            if let Err(e) = app_clone.emit_to(&window_label_clone, "plugin-window-init", init_data)
            {
                eprintln!("[PluginWindow] 发送初始化数据失败: {}", e);
            } else {
                println!(
                    "[PluginWindow] 已发送初始化数据到窗口: {}",
                    window_label_clone
                );
            }
        });
    }

    println!(
        "[PluginWindow] 已创建插件窗口: {} ({})",
        window_label, plugin_id
    );
    Ok(window_label)
}
