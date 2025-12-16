// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
use cocoa::appkit::{NSWindow, NSWindowStyleMask};
#[cfg(target_os = "macos")]
use cocoa::base::id;

use tauri::Manager;

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_cursor_position])
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
