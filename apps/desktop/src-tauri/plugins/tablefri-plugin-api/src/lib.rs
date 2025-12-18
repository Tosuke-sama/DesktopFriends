//! TableFri 插件开发 API
//!
//! 本 crate 提供开发 TableFri 插件所需的所有类型和 trait 定义。
//! 使用 C-stable ABI，通过 JSON 字符串传递复杂数据类型。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::PathBuf;

/// 插件上下文
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginContext {
    pub plugin_id: String,
    pub data_dir: PathBuf,
    pub config: Value,
}

/// 工具调用请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub arguments: Value,
}

/// 工具调用结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub data: Value,
    pub error: Option<String>,
}

impl ToolResult {
    pub fn success(data: Value) -> Self {
        Self {
            success: true,
            data,
            error: None,
        }
    }

    pub fn error(message: &str) -> Self {
        Self {
            success: false,
            data: Value::Null,
            error: Some(message.to_string()),
        }
    }
}

/// LLM 工具定义
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDefinition {
    pub plugin_id: String,
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

impl ToolDefinition {
    pub fn new(plugin_id: &str, name: &str, description: &str, parameters: Value) -> Self {
        Self {
            plugin_id: plugin_id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            parameters,
        }
    }

    pub fn no_params(plugin_id: &str, name: &str, description: &str) -> Self {
        Self::new(
            plugin_id,
            name,
            description,
            serde_json::json!({
                "type": "object",
                "properties": {}
            }),
        )
    }
}

/// 插件核心 trait（内部使用）
pub trait Plugin: Send + Sync {
    fn initialize(&mut self, ctx: &PluginContext) -> Result<(), String>;
    fn shutdown(&mut self) -> Result<(), String>;
    fn get_tools(&self) -> Vec<ToolDefinition>;
    fn execute_tool(&self, call: &ToolCall) -> ToolResult;
    fn on_hook(&mut self, hook_name: &str, data: &Value) -> Option<Value>;
}

// ============================================================================
// C-stable FFI 函数类型
// ============================================================================

/// FFI: 初始化插件
/// 参数: ctx_json - JSON 格式的 PluginContext
/// 返回: 0 成功，非 0 失败；失败时通过 plugin_get_last_error 获取错误信息
pub type PluginInitializeFn = unsafe extern "C" fn(ctx_json: *const c_char) -> i32;

/// FFI: 关闭插件
pub type PluginShutdownFn = unsafe extern "C" fn() -> i32;

/// FFI: 获取工具列表
/// 返回: JSON 格式的工具列表，调用者需要调用 plugin_free_string 释放
pub type PluginGetToolsFn = unsafe extern "C" fn() -> *mut c_char;

/// FFI: 执行工具
/// 参数: call_json - JSON 格式的 ToolCall
/// 返回: JSON 格式的 ToolResult，调用者需要调用 plugin_free_string 释放
pub type PluginExecuteToolFn = unsafe extern "C" fn(call_json: *const c_char) -> *mut c_char;

/// FFI: 处理钩子
/// 参数: hook_name, data_json
/// 返回: JSON 格式的响应（可能为 null），调用者需要调用 plugin_free_string 释放
pub type PluginOnHookFn = unsafe extern "C" fn(hook_name: *const c_char, data_json: *const c_char) -> *mut c_char;

/// FFI: 释放字符串内存
pub type PluginFreeStringFn = unsafe extern "C" fn(s: *mut c_char);

/// FFI: 获取最后一个错误信息
pub type PluginGetLastErrorFn = unsafe extern "C" fn() -> *mut c_char;

// ============================================================================
// 辅助函数
// ============================================================================

/// 将 Rust 字符串转换为 C 字符串（堆分配）
pub fn string_to_c(s: &str) -> *mut c_char {
    match CString::new(s) {
        Ok(cs) => cs.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// 将 C 字符串转换为 Rust 字符串
pub unsafe fn c_to_string(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    CStr::from_ptr(ptr).to_str().ok().map(|s| s.to_string())
}

/// 释放 C 字符串
pub unsafe fn free_c_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        drop(CString::from_raw(ptr));
    }
}

// ============================================================================
// 插件导出宏
// ============================================================================

/// 插件导出宏 - 生成 C-stable FFI 函数
#[macro_export]
macro_rules! export_plugin {
    ($plugin_type:ty, $constructor:expr) => {
        use std::cell::RefCell;

        static PLUGIN: std::sync::OnceLock<std::sync::Mutex<$plugin_type>> = std::sync::OnceLock::new();

        thread_local! {
            static LAST_ERROR: RefCell<String> = RefCell::new(String::new());
        }

        fn set_error(msg: &str) {
            LAST_ERROR.with(|e| {
                *e.borrow_mut() = msg.to_string();
            });
        }

        fn get_plugin() -> &'static std::sync::Mutex<$plugin_type> {
            PLUGIN.get_or_init(|| std::sync::Mutex::new($constructor()))
        }

        #[no_mangle]
        pub unsafe extern "C" fn plugin_initialize(ctx_json: *const std::os::raw::c_char) -> i32 {
            let ctx_str = match $crate::c_to_string(ctx_json) {
                Some(s) => s,
                None => {
                    set_error("Invalid context JSON pointer");
                    return -1;
                }
            };

            let ctx: $crate::PluginContext = match serde_json::from_str(&ctx_str) {
                Ok(c) => c,
                Err(e) => {
                    set_error(&format!("Failed to parse context: {}", e));
                    return -2;
                }
            };

            match get_plugin().lock() {
                Ok(mut plugin) => {
                    match plugin.initialize(&ctx) {
                        Ok(()) => 0,
                        Err(e) => {
                            set_error(&e);
                            -3
                        }
                    }
                }
                Err(e) => {
                    set_error(&format!("Failed to lock plugin: {}", e));
                    -4
                }
            }
        }

        #[no_mangle]
        pub unsafe extern "C" fn plugin_shutdown() -> i32 {
            match get_plugin().lock() {
                Ok(mut plugin) => {
                    match plugin.shutdown() {
                        Ok(()) => 0,
                        Err(e) => {
                            set_error(&e);
                            -1
                        }
                    }
                }
                Err(e) => {
                    set_error(&format!("Failed to lock plugin: {}", e));
                    -2
                }
            }
        }

        #[no_mangle]
        pub unsafe extern "C" fn plugin_get_tools() -> *mut std::os::raw::c_char {
            match get_plugin().lock() {
                Ok(plugin) => {
                    let tools = plugin.get_tools();
                    match serde_json::to_string(&tools) {
                        Ok(json) => $crate::string_to_c(&json),
                        Err(e) => {
                            set_error(&format!("Failed to serialize tools: {}", e));
                            std::ptr::null_mut()
                        }
                    }
                }
                Err(e) => {
                    set_error(&format!("Failed to lock plugin: {}", e));
                    std::ptr::null_mut()
                }
            }
        }

        #[no_mangle]
        pub unsafe extern "C" fn plugin_execute_tool(call_json: *const std::os::raw::c_char) -> *mut std::os::raw::c_char {
            let call_str = match $crate::c_to_string(call_json) {
                Some(s) => s,
                None => {
                    let err = $crate::ToolResult::error("Invalid call JSON pointer");
                    return $crate::string_to_c(&serde_json::to_string(&err).unwrap_or_default());
                }
            };

            let call: $crate::ToolCall = match serde_json::from_str(&call_str) {
                Ok(c) => c,
                Err(e) => {
                    let err = $crate::ToolResult::error(&format!("Failed to parse call: {}", e));
                    return $crate::string_to_c(&serde_json::to_string(&err).unwrap_or_default());
                }
            };

            match get_plugin().lock() {
                Ok(plugin) => {
                    let result = plugin.execute_tool(&call);
                    match serde_json::to_string(&result) {
                        Ok(json) => $crate::string_to_c(&json),
                        Err(e) => {
                            let err = $crate::ToolResult::error(&format!("Failed to serialize result: {}", e));
                            $crate::string_to_c(&serde_json::to_string(&err).unwrap_or_default())
                        }
                    }
                }
                Err(e) => {
                    let err = $crate::ToolResult::error(&format!("Failed to lock plugin: {}", e));
                    $crate::string_to_c(&serde_json::to_string(&err).unwrap_or_default())
                }
            }
        }

        #[no_mangle]
        pub unsafe extern "C" fn plugin_on_hook(
            hook_name: *const std::os::raw::c_char,
            data_json: *const std::os::raw::c_char
        ) -> *mut std::os::raw::c_char {
            let hook = match $crate::c_to_string(hook_name) {
                Some(s) => s,
                None => return std::ptr::null_mut(),
            };

            let data_str = match $crate::c_to_string(data_json) {
                Some(s) => s,
                None => return std::ptr::null_mut(),
            };

            let data: serde_json::Value = match serde_json::from_str(&data_str) {
                Ok(d) => d,
                Err(_) => return std::ptr::null_mut(),
            };

            match get_plugin().lock() {
                Ok(mut plugin) => {
                    match plugin.on_hook(&hook, &data) {
                        Some(response) => {
                            match serde_json::to_string(&response) {
                                Ok(json) => $crate::string_to_c(&json),
                                Err(_) => std::ptr::null_mut(),
                            }
                        }
                        None => std::ptr::null_mut(),
                    }
                }
                Err(_) => std::ptr::null_mut(),
            }
        }

        #[no_mangle]
        pub unsafe extern "C" fn plugin_free_string(s: *mut std::os::raw::c_char) {
            $crate::free_c_string(s);
        }

        #[no_mangle]
        pub unsafe extern "C" fn plugin_get_last_error() -> *mut std::os::raw::c_char {
            LAST_ERROR.with(|e| {
                let err = e.borrow();
                if err.is_empty() {
                    std::ptr::null_mut()
                } else {
                    $crate::string_to_c(&err)
                }
            })
        }
    };
}

/// 预定义的钩子名称常量
pub mod hooks {
    pub const ON_FILE_OPEN: &str = "on_file_open";
    pub const ON_TEXT_SELECT: &str = "on_text_select";
    pub const ON_APP_START: &str = "on_app_start";
    pub const ON_APP_CLOSE: &str = "on_app_close";
    pub const BEFORE_MESSAGE_SEND: &str = "before_message_send";
    pub const AFTER_MESSAGE_RECEIVE: &str = "after_message_receive";
    pub const ON_LIVE2D_ACTION: &str = "on_live2d_action";
}

pub use serde_json::json;
