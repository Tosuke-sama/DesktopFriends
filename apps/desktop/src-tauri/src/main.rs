// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod plugins;

#[cfg(target_os = "macos")]
use cocoa::appkit::{NSWindow, NSWindowStyleMask};
#[cfg(target_os = "macos")]
use cocoa::base::id;

use plugins::{PluginManager, ToolCall};
use std::sync::Mutex;
use tauri::{GlobalShortcutManager, Manager};

#[derive(serde::Serialize)]
struct CursorPosition {
    x: f64,
    y: f64,
    in_window: bool,
}

/// 文件打开事件
#[derive(Clone, serde::Serialize)]
struct FileOpenEvent {
    path: String,
    file_type: String,
    file_name: String,
}

/// 文本选择事件
#[derive(Clone, serde::Serialize)]
struct TextSelectEvent {
    text: String,
    source: String,
}

/// 插件发送消息给桌宠事件（通用接口）
#[derive(Clone, serde::Serialize)]
struct PluginSendToPetEvent {
    /// 发送给 LLM 的系统提示词
    message: String,
    /// 显示在气泡中的文字（可选）
    bubble: Option<String>,
    /// 来源标识（如 "pdf:filename.pdf:page1"）
    source: String,
}

#[tauri::command]
fn get_cursor_position(window: tauri::Window) -> CursorPosition {
    #[cfg(target_os = "macos")]
    {
        use cocoa::appkit::NSEvent;
        use cocoa::base::nil;
        use cocoa::foundation::NSPoint;

        unsafe {
            // 获取全局鼠标位置
            let mouse_location: NSPoint = NSEvent::mouseLocation(nil);

            // 获取窗口位置和大小
            let ns_window = window.ns_window().unwrap() as id;
            let frame = NSWindow::frame(ns_window);

            // macOS 坐标系是从屏幕左下角开始的，需要转换
            // 鼠标位置相对于窗口
            let relative_x = mouse_location.x - frame.origin.x;
            let relative_y = mouse_location.y - frame.origin.y;

            // 判断是否在窗口内
            let in_window = relative_x >= 0.0
                && relative_x <= frame.size.width
                && relative_y >= 0.0
                && relative_y <= frame.size.height;

            CursorPosition {
                x: relative_x,
                y: frame.size.height - relative_y, // 转换为从上到下的坐标
                in_window,
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Windows/Linux 暂不支持，返回默认值
        CursorPosition {
            x: 0.0,
            y: 0.0,
            in_window: false,
        }
    }
}

/// 获取剪贴板文本
#[tauri::command]
fn get_clipboard_text() -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.get_text().map_err(|e| e.to_string())
}

/// 前端调试日志输出到终端
#[tauri::command]
fn debug_log(level: String, message: String, data: Option<serde_json::Value>) {
    let timestamp = chrono::Local::now().format("%H:%M:%S%.3f");
    let level_colored = match level.as_str() {
        "error" => format!("\x1b[31m[ERROR]\x1b[0m"),   // 红色
        "warn" => format!("\x1b[33m[WARN]\x1b[0m"),     // 黄色
        "info" => format!("\x1b[36m[INFO]\x1b[0m"),     // 青色
        "debug" => format!("\x1b[90m[DEBUG]\x1b[0m"),   // 灰色
        _ => format!("[{}]", level.to_uppercase()),
    };
    
    if let Some(data_value) = data {
        println!("{} {} \x1b[35m[Frontend]\x1b[0m {} | {}", 
            timestamp, level_colored, message, 
            serde_json::to_string_pretty(&data_value).unwrap_or_else(|_| "{}".to_string())
        );
    } else {
        println!("{} {} \x1b[35m[Frontend]\x1b[0m {}", 
            timestamp, level_colored, message
        );
    }
}

/// 处理文件打开（供外部调用或内部触发）
fn emit_file_open_event(app_handle: &tauri::AppHandle, file_path: &str) {
    let path = std::path::Path::new(file_path);

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let file_type = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("unknown")
        .to_lowercase();

    let event = FileOpenEvent {
        path: file_path.to_string(),
        file_type,
        file_name,
    };

    println!("[FileOpen] 文件打开事件: {:?}", event.path);

    // 发送事件到前端
    if let Err(e) = app_handle.emit_all("file-open", event) {
        eprintln!("[FileOpen] 发送事件失败: {}", e);
    }
}

/// 处理文本选择事件
fn emit_text_select_event(app_handle: &tauri::AppHandle, text: &str, source: &str) {
    let event = TextSelectEvent {
        text: text.to_string(),
        source: source.to_string(),
    };

    println!("[TextSelect] 文本选择事件: {} 字符", text.len());

    // 发送事件到前端
    if let Err(e) = app_handle.emit_all("text-select", event) {
        eprintln!("[TextSelect] 发送事件失败: {}", e);
    }
}

/// 处理插件发送消息给桌宠事件（通用接口）
fn emit_plugin_send_to_pet_event(
    app_handle: &tauri::AppHandle,
    message: &str,
    bubble: Option<&str>,
    source: &str,
) {
    let event = PluginSendToPetEvent {
        message: message.to_string(),
        bubble: bubble.map(|s| s.to_string()),
        source: source.to_string(),
    };

    println!(
        "[PluginSendToPet] 插件消息事件: {} 字符, 来源: {}",
        message.len(),
        source
    );

    // 发送事件到前端
    if let Err(e) = app_handle.emit_all("plugin-send-to-pet", event) {
        eprintln!("[PluginSendToPet] 发送事件失败: {}", e);
    }
}

/// 注册全局快捷键
fn register_global_shortcuts(app_handle: tauri::AppHandle) {
    let mut shortcut_manager = app_handle.global_shortcut_manager();

    // 注册 Option+Q (macOS) / Alt+Q (Windows) 作为划词快捷键
    let app_handle_clone = app_handle.clone();
    let shortcut = if cfg!(target_os = "macos") {
        "Option+Q"
    } else {
        "Alt+Q"
    };

    match shortcut_manager.register(shortcut, move || {
        println!("[Shortcut] 快捷键触发: {}", shortcut);

        // 获取剪贴板内容
        match arboard::Clipboard::new() {
            Ok(mut clipboard) => match clipboard.get_text() {
                Ok(text) if !text.is_empty() => {
                    emit_text_select_event(&app_handle_clone, &text, "clipboard");
                }
                Ok(_) => {
                    println!("[Shortcut] 剪贴板为空");
                }
                Err(e) => {
                    eprintln!("[Shortcut] 读取剪贴板失败: {}", e);
                }
            },
            Err(e) => {
                eprintln!("[Shortcut] 创建剪贴板实例失败: {}", e);
            }
        }
    }) {
        Ok(_) => println!("[Shortcut] 已注册全局快捷键: {}", shortcut),
        Err(e) => eprintln!("[Shortcut] 注册快捷键失败: {}", e),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_cursor_position,
            get_clipboard_text,
            debug_log,
            // 插件系统命令
            plugins::open_plugin_window,
            plugins::plugin_install,
            plugins::plugin_uninstall,
            plugins::plugin_enable,
            plugins::plugin_disable,
            plugins::plugin_list,
            plugins::plugin_get,
            plugins::plugin_get_tools,
            plugins::plugin_execute_tool,
            plugins::plugin_trigger_hook,
            plugins::plugin_read_ui,
            plugins::plugin_set_config,
            plugins::plugin_refresh,
        ])
        // 注册插件文件协议 plugin://
        .register_uri_scheme_protocol("plugin", |app, request| {
            let uri = request.uri();
            // URI 格式: plugin://localhost/{plugin_id}/{path}?query=...
            let full_path = uri.replace("plugin://localhost/", "");

            // 分离路径和查询参数（查询参数由前端 JavaScript 处理）
            let path = full_path.split('?').next().unwrap_or(&full_path);

            // 获取插件目录
            let app_data_dir = app
                .path_resolver()
                .app_data_dir()
                .expect("无法获取应用数据目录");
            let plugins_dir = app_data_dir.join("plugins");

            // 构建完整文件路径
            let file_path = plugins_dir.join(path);

            println!("[PluginProtocol] 请求文件: {} -> {:?}", path, file_path);

            if file_path.exists() {
                match std::fs::read(&file_path) {
                    Ok(content) => {
                        // 根据文件扩展名确定 MIME 类型
                        let mime_type = match file_path.extension().and_then(|e| e.to_str()) {
                            Some("html") | Some("htm") => "text/html",
                            Some("js") | Some("mjs") => "application/javascript",
                            Some("css") => "text/css",
                            Some("json") => "application/json",
                            Some("png") => "image/png",
                            Some("jpg") | Some("jpeg") => "image/jpeg",
                            Some("svg") => "image/svg+xml",
                            Some("woff") => "font/woff",
                            Some("woff2") => "font/woff2",
                            Some("pdf") => "application/pdf",
                            _ => "application/octet-stream",
                        };

                        tauri::http::ResponseBuilder::new()
                            .status(200)
                            .header("Content-Type", mime_type)
                            .header("Access-Control-Allow-Origin", "*")
                            .body(content)
                    }
                    Err(e) => {
                        eprintln!("[PluginProtocol] 读取文件失败: {}", e);
                        tauri::http::ResponseBuilder::new()
                            .status(500)
                            .body(format!("读取文件失败: {}", e).into_bytes())
                    }
                }
            } else {
                eprintln!("[PluginProtocol] 文件不存在: {:?}", file_path);
                tauri::http::ResponseBuilder::new()
                    .status(404)
                    .body(format!("文件不存在: {}", path).into_bytes())
            }
        })
        // 注册本地文件协议 localfile://（用于加载本地 PDF 等文件）
        .register_uri_scheme_protocol("localfile", |_app, request| {
            let uri = request.uri();
            // URI 格式: localfile://localhost/{encoded_path}
            let encoded_path = uri.replace("localfile://localhost/", "");
            // URL 解码路径
            let path = urlencoding::decode(&encoded_path)
                .map(|s| s.into_owned())
                .unwrap_or(encoded_path);

            println!("[LocalFileProtocol] 请求文件: {}", path);

            let file_path = std::path::Path::new(&path);

            if file_path.exists() {
                match std::fs::read(file_path) {
                    Ok(content) => {
                        // 根据文件扩展名确定 MIME 类型
                        let mime_type = match file_path.extension().and_then(|e| e.to_str()) {
                            Some("pdf") => "application/pdf",
                            Some("png") => "image/png",
                            Some("jpg") | Some("jpeg") => "image/jpeg",
                            Some("gif") => "image/gif",
                            Some("txt") => "text/plain",
                            Some("json") => "application/json",
                            _ => "application/octet-stream",
                        };

                        tauri::http::ResponseBuilder::new()
                            .status(200)
                            .header("Content-Type", mime_type)
                            .header("Access-Control-Allow-Origin", "*")
                            .body(content)
                    }
                    Err(e) => {
                        eprintln!("[LocalFileProtocol] 读取文件失败: {}", e);
                        tauri::http::ResponseBuilder::new()
                            .status(500)
                            .body(format!("读取文件失败: {}", e).into_bytes())
                    }
                }
            } else {
                eprintln!("[LocalFileProtocol] 文件不存在: {:?}", file_path);
                tauri::http::ResponseBuilder::new()
                    .status(404)
                    .body(format!("文件不存在: {}", path).into_bytes())
            }
        })
        // 注册插件事件协议 pluginevent://（用于插件窗口发送事件）
        .register_uri_scheme_protocol("pluginevent", |app, request| {
            let uri = request.uri();
            // URI 格式: pluginevent://localhost/{event-type}?param=xxx
            let path = uri.replace("pluginevent://localhost/", "");

            // 分离路径和查询参数
            let parts: Vec<&str> = path.splitn(2, '?').collect();
            let event_type = parts.get(0).unwrap_or(&"");
            let query = parts.get(1).unwrap_or(&"");

            println!("[PluginEvent] 收到事件: {} query={}", event_type, query);

            // 解析查询参数
            let params: std::collections::HashMap<String, String> = query
                .split('&')
                .filter_map(|pair| {
                    let mut iter = pair.splitn(2, '=');
                    let key = iter.next()?;
                    let value = iter.next().unwrap_or("");
                    Some((
                        key.to_string(),
                        urlencoding::decode(value).unwrap_or_default().into_owned(),
                    ))
                })
                .collect();

            match *event_type {
                // 通用的发送消息给桌宠接口（推荐使用）
                "send-to-pet" => {
                    let message = params.get("message").cloned().unwrap_or_default();
                    let bubble = params.get("bubble").cloned();
                    let source = params
                        .get("source")
                        .cloned()
                        .unwrap_or_else(|| "plugin".to_string());

                    if !message.is_empty() {
                        emit_plugin_send_to_pet_event(&app, &message, bubble.as_deref(), &source);
                    }

                    tauri::http::ResponseBuilder::new()
                        .status(200)
                        .header("Content-Type", "application/json")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(r#"{"success":true}"#.as_bytes().to_vec())
                }

                // 文本选择事件（保留向后兼容）
                "text-select" => {
                    let text = params.get("text").cloned().unwrap_or_default();
                    let source = params
                        .get("source")
                        .cloned()
                        .unwrap_or_else(|| "plugin".to_string());

                    if !text.is_empty() {
                        emit_text_select_event(&app, &text, &source);
                    }

                    tauri::http::ResponseBuilder::new()
                        .status(200)
                        .header("Content-Type", "application/json")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(r#"{"success":true}"#.as_bytes().to_vec())
                }

                "plugin-tool" => {
                    let plugin_id = match params.get("plugin") {
                        Some(id) if !id.is_empty() => id.clone(),
                        _ => {
                            return tauri::http::ResponseBuilder::new()
                                .status(400)
                                .header("Access-Control-Allow-Origin", "*")
                                .body(r#"{"error":"missing plugin"}"#.as_bytes().to_vec());
                        }
                    };

                    let tool_name = match params.get("tool") {
                        Some(name) if !name.is_empty() => name.clone(),
                        _ => {
                            return tauri::http::ResponseBuilder::new()
                                .status(400)
                                .header("Access-Control-Allow-Origin", "*")
                                .body(r#"{"error":"missing tool"}"#.as_bytes().to_vec());
                        }
                    };

                    let args_raw = params
                        .get("args")
                        .cloned()
                        .unwrap_or_else(|| "{}".to_string());
                    let decoded = urlencoding::decode(&args_raw)
                        .unwrap_or_else(|_| std::borrow::Cow::Borrowed(args_raw.as_str()));
                    let arguments: serde_json::Value = serde_json::from_str(&decoded)
                        .unwrap_or(serde_json::Value::Object(Default::default()));

                    let manager_mutex = app.state::<Mutex<PluginManager>>();
                    let manager_guard = match manager_mutex.lock() {
                        Ok(guard) => guard,
                        Err(e) => {
                            eprintln!("[PluginEvent] 获取插件管理器失败: {}", e);
                            return tauri::http::ResponseBuilder::new()
                                .status(500)
                                .header("Access-Control-Allow-Origin", "*")
                                .body(r#"{"error":"manager unavailable"}"#.as_bytes().to_vec());
                        }
                    };

                    let call = ToolCall {
                        name: tool_name,
                        arguments,
                    };

                    match manager_guard.execute_tool(&plugin_id, &call) {
                        Ok(result) => {
                            let payload =
                                serde_json::to_vec(&result).unwrap_or_else(|_| b"{}".to_vec());
                            tauri::http::ResponseBuilder::new()
                                .status(200)
                                .header("Content-Type", "application/json")
                                .header("Access-Control-Allow-Origin", "*")
                                .body(payload)
                        }
                        Err(e) => {
                            eprintln!("[PluginEvent] 执行工具失败: {}", e);
                            tauri::http::ResponseBuilder::new()
                                .status(500)
                                .header("Access-Control-Allow-Origin", "*")
                                .body(format!("{{\"error\":\"{}\"}}", e).into_bytes())
                        }
                    }
                }

                _ => tauri::http::ResponseBuilder::new()
                    .status(400)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(r#"{"error":"unknown event type"}"#.as_bytes().to_vec()),
            }
        })
        .setup(|app| {
            // 初始化插件系统
            let app_data_dir = app
                .path_resolver()
                .app_data_dir()
                .expect("无法获取应用数据目录");
            let plugins_dir = app_data_dir.join("plugins");

            match PluginManager::new(plugins_dir) {
                Ok(manager) => {
                    app.manage(Mutex::new(manager));
                    println!("插件系统初始化成功");
                }
                Err(e) => {
                    eprintln!("插件系统初始化失败: {}", e);
                }
            }

            // 注册全局快捷键
            register_global_shortcuts(app.handle());

            // 处理启动时传入的文件参数
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                // 第一个参数是程序路径，从第二个开始是文件路径
                for arg in args.iter().skip(1) {
                    // 跳过以 - 开头的参数（命令行选项）
                    if !arg.starts_with('-') {
                        let path = std::path::Path::new(arg);
                        if path.exists() && path.is_file() {
                            emit_file_open_event(&app.handle(), arg);
                        }
                    }
                }
            }

            #[cfg(target_os = "macos")]
            {
                let window = app.get_window("main").unwrap();

                // 获取 NSWindow 并设置透明背景
                let ns_window = window.ns_window().unwrap() as id;
                unsafe {
                    // 设置窗口背景透明
                    ns_window.setOpaque_(cocoa::base::NO);
                    ns_window
                        .setBackgroundColor_(cocoa::appkit::NSColor::clearColor(cocoa::base::nil));

                    // 移除标题栏但保留窗口控制
                    let mut style_mask = ns_window.styleMask();
                    style_mask |= NSWindowStyleMask::NSFullSizeContentViewWindowMask;
                    ns_window.setStyleMask_(style_mask);
                    ns_window.setTitlebarAppearsTransparent_(cocoa::base::YES);
                    ns_window.setTitleVisibility_(
                        cocoa::appkit::NSWindowTitleVisibility::NSWindowTitleHidden,
                    );
                }
            }
            Ok(())
        })
        // 处理文件拖拽到应用图标打开
        .on_window_event(|event| {
            if let tauri::WindowEvent::FileDrop(tauri::FileDropEvent::Dropped(paths)) =
                event.event()
            {
                let app_handle = event.window().app_handle();
                for path in paths {
                    if let Some(path_str) = path.to_str() {
                        emit_file_open_event(&app_handle, path_str);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
