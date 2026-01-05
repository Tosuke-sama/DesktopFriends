// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
use cocoa::appkit::{NSWindow, NSWindowStyleMask};
#[cfg(target_os = "macos")]
use cocoa::base::id;

use std::fs;
use std::path::Path;
use tauri::Manager;
use tauri::http::{Request, Response, ResponseBuilder};

#[derive(serde::Serialize)]
struct CursorPosition {
    x: f64,
    y: f64,
    in_window: bool,
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

/// 获取文件的 MIME 类型
fn get_mime_type(path: &str) -> &'static str {
    let extension = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    match extension.to_lowercase().as_str() {
        "json" => "application/json",
        "moc3" | "moc" => "application/octet-stream",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "motion3.json" => "application/json",
        "exp3.json" => "application/json",
        _ => "application/octet-stream",
    }
}

/// 处理自定义 localfile:// 协议请求
fn handle_localfile_protocol(request: &Request) -> Result<Response, Box<dyn std::error::Error>> {
    let url = request.uri();
    // URL 格式: localfile://localhost/path/to/file
    let path = url.replace("localfile://localhost", "");
    // URL 解码路径
    let decoded_path = urlencoding::decode(&path)
        .map(|s| s.into_owned())
        .unwrap_or_else(|_| path.clone());

    println!("[localfile] Requested: {}", decoded_path);

    let file_path = Path::new(&decoded_path);
    if !file_path.exists() {
        println!("[localfile] File not found: {}", decoded_path);
        return ResponseBuilder::new()
            .status(404)
            .header("Access-Control-Allow-Origin", "*")
            .body(b"File not found".to_vec());
    }

    match fs::read(file_path) {
        Ok(contents) => {
            let mime_type = get_mime_type(&decoded_path);
            println!("[localfile] Serving: {} ({}, {} bytes)", decoded_path, mime_type, contents.len());
            ResponseBuilder::new()
                .status(200)
                .header("Access-Control-Allow-Origin", "*")
                .header("Access-Control-Allow-Methods", "GET, OPTIONS")
                .header("Access-Control-Allow-Headers", "*")
                .header("Content-Type", mime_type)
                .body(contents)
        }
        Err(e) => {
            println!("[localfile] Error reading file: {}", e);
            ResponseBuilder::new()
                .status(500)
                .header("Access-Control-Allow-Origin", "*")
                .body(format!("Error reading file: {}", e).into_bytes())
        }
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_cursor_position])
        // 注册自定义 localfile:// 协议，带有 CORS 头
        .register_uri_scheme_protocol("localfile", |_app, request| {
            handle_localfile_protocol(request)
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let window = app.get_window("main").unwrap();

                // 获取 NSWindow 并设置透明背景
                let ns_window = window.ns_window().unwrap() as id;
                unsafe {
                    // 设置窗口背景透明
                    ns_window.setOpaque_(cocoa::base::NO);
                    ns_window.setBackgroundColor_(cocoa::appkit::NSColor::clearColor(cocoa::base::nil));

                    // 移除标题栏但保留窗口控制
                    let mut style_mask = ns_window.styleMask();
                    style_mask |= NSWindowStyleMask::NSFullSizeContentViewWindowMask;
                    ns_window.setStyleMask_(style_mask);
                    ns_window.setTitlebarAppearsTransparent_(cocoa::base::YES);
                    ns_window.setTitleVisibility_(cocoa::appkit::NSWindowTitleVisibility::NSWindowTitleHidden);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
