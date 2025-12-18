//! 插件动态库加载器
//!
//! 使用 C-stable ABI 加载和管理插件

use super::api::{PluginContext, ToolCall, ToolDefinition, ToolResult};
use libloading::{Library, Symbol};
use std::collections::HashMap;
use std::ffi::CString;
use std::os::raw::c_char;
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LoaderError {
    #[error("加载动态库失败: {0}")]
    LibraryLoad(String),

    #[error("找不到导出函数 '{0}': {1}")]
    SymbolNotFound(String, String),

    #[error("插件 '{0}' 未加载")]
    PluginNotLoaded(String),

    #[error("插件初始化失败: {0}")]
    InitializeFailed(String),

    #[error("插件关闭失败: {0}")]
    ShutdownFailed(String),

    #[error("JSON 序列化失败: {0}")]
    JsonError(String),
}

// FFI 函数类型定义
type PluginInitializeFn = unsafe extern "C" fn(*const c_char) -> i32;
type PluginShutdownFn = unsafe extern "C" fn() -> i32;
type PluginGetToolsFn = unsafe extern "C" fn() -> *mut c_char;
type PluginExecuteToolFn = unsafe extern "C" fn(*const c_char) -> *mut c_char;
type PluginOnHookFn = unsafe extern "C" fn(*const c_char, *const c_char) -> *mut c_char;
type PluginFreeStringFn = unsafe extern "C" fn(*mut c_char);
type PluginGetLastErrorFn = unsafe extern "C" fn() -> *mut c_char;

/// 插件 FFI 接口
struct PluginFFI {
    initialize: PluginInitializeFn,
    shutdown: PluginShutdownFn,
    get_tools: PluginGetToolsFn,
    execute_tool: PluginExecuteToolFn,
    on_hook: PluginOnHookFn,
    free_string: PluginFreeStringFn,
    get_last_error: PluginGetLastErrorFn,
}

/// 已加载的插件
struct LoadedPlugin {
    _library: Library, // 保持库加载状态
    ffi: PluginFFI,
}

/// 插件加载器
pub struct PluginLoader {
    plugins: HashMap<String, LoadedPlugin>,
}

impl PluginLoader {
    pub fn new() -> Self {
        Self {
            plugins: HashMap::new(),
        }
    }

    /// 加载插件动态库
    pub fn load(&mut self, plugin_id: &str, lib_path: &Path) -> Result<(), LoaderError> {
        // 如果已加载，先卸载
        if self.plugins.contains_key(plugin_id) {
            self.unload(plugin_id)?;
        }

        unsafe {
            let lib = Library::new(lib_path)
                .map_err(|e| LoaderError::LibraryLoad(format!("{}: {}", lib_path.display(), e)))?;

            // 获取所有 FFI 函数
            let initialize: Symbol<PluginInitializeFn> = lib
                .get(b"plugin_initialize")
                .map_err(|e| LoaderError::SymbolNotFound("plugin_initialize".to_string(), e.to_string()))?;

            let shutdown: Symbol<PluginShutdownFn> = lib
                .get(b"plugin_shutdown")
                .map_err(|e| LoaderError::SymbolNotFound("plugin_shutdown".to_string(), e.to_string()))?;

            let get_tools: Symbol<PluginGetToolsFn> = lib
                .get(b"plugin_get_tools")
                .map_err(|e| LoaderError::SymbolNotFound("plugin_get_tools".to_string(), e.to_string()))?;

            let execute_tool: Symbol<PluginExecuteToolFn> = lib
                .get(b"plugin_execute_tool")
                .map_err(|e| LoaderError::SymbolNotFound("plugin_execute_tool".to_string(), e.to_string()))?;

            let on_hook: Symbol<PluginOnHookFn> = lib
                .get(b"plugin_on_hook")
                .map_err(|e| LoaderError::SymbolNotFound("plugin_on_hook".to_string(), e.to_string()))?;

            let free_string: Symbol<PluginFreeStringFn> = lib
                .get(b"plugin_free_string")
                .map_err(|e| LoaderError::SymbolNotFound("plugin_free_string".to_string(), e.to_string()))?;

            let get_last_error: Symbol<PluginGetLastErrorFn> = lib
                .get(b"plugin_get_last_error")
                .map_err(|e| LoaderError::SymbolNotFound("plugin_get_last_error".to_string(), e.to_string()))?;

            let ffi = PluginFFI {
                initialize: *initialize,
                shutdown: *shutdown,
                get_tools: *get_tools,
                execute_tool: *execute_tool,
                on_hook: *on_hook,
                free_string: *free_string,
                get_last_error: *get_last_error,
            };

            self.plugins.insert(
                plugin_id.to_string(),
                LoadedPlugin {
                    _library: lib,
                    ffi,
                },
            );

            Ok(())
        }
    }

    /// 卸载插件
    pub fn unload(&mut self, plugin_id: &str) -> Result<(), LoaderError> {
        if self.plugins.remove(plugin_id).is_some() {
            Ok(())
        } else {
            Err(LoaderError::PluginNotLoaded(plugin_id.to_string()))
        }
    }

    /// 初始化插件
    pub fn initialize(&mut self, plugin_id: &str, ctx: &PluginContext) -> Result<(), LoaderError> {
        let plugin = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| LoaderError::PluginNotLoaded(plugin_id.to_string()))?;

        let ctx_json = serde_json::to_string(ctx)
            .map_err(|e| LoaderError::JsonError(e.to_string()))?;

        let ctx_cstr = CString::new(ctx_json)
            .map_err(|e| LoaderError::JsonError(e.to_string()))?;

        unsafe {
            let result = (plugin.ffi.initialize)(ctx_cstr.as_ptr());
            if result != 0 {
                // 获取错误信息
                let error_ptr = (plugin.ffi.get_last_error)();
                let error_msg = if !error_ptr.is_null() {
                    let msg = std::ffi::CStr::from_ptr(error_ptr)
                        .to_string_lossy()
                        .into_owned();
                    (plugin.ffi.free_string)(error_ptr);
                    msg
                } else {
                    format!("Unknown error (code: {})", result)
                };
                return Err(LoaderError::InitializeFailed(error_msg));
            }
        }

        Ok(())
    }

    /// 关闭插件
    pub fn shutdown(&mut self, plugin_id: &str) -> Result<(), LoaderError> {
        let plugin = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| LoaderError::PluginNotLoaded(plugin_id.to_string()))?;

        unsafe {
            let result = (plugin.ffi.shutdown)();
            if result != 0 {
                let error_ptr = (plugin.ffi.get_last_error)();
                let error_msg = if !error_ptr.is_null() {
                    let msg = std::ffi::CStr::from_ptr(error_ptr)
                        .to_string_lossy()
                        .into_owned();
                    (plugin.ffi.free_string)(error_ptr);
                    msg
                } else {
                    format!("Unknown error (code: {})", result)
                };
                return Err(LoaderError::ShutdownFailed(error_msg));
            }
        }

        Ok(())
    }

    /// 检查插件是否已加载
    pub fn is_loaded(&self, plugin_id: &str) -> bool {
        self.plugins.contains_key(plugin_id)
    }

    /// 获取插件提供的工具
    pub fn get_tools(&self, plugin_id: &str) -> Result<Vec<ToolDefinition>, LoaderError> {
        let plugin = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| LoaderError::PluginNotLoaded(plugin_id.to_string()))?;

        unsafe {
            let json_ptr = (plugin.ffi.get_tools)();
            if json_ptr.is_null() {
                return Ok(vec![]);
            }

            let json_str = std::ffi::CStr::from_ptr(json_ptr)
                .to_string_lossy()
                .into_owned();
            (plugin.ffi.free_string)(json_ptr);

            let tools: Vec<ToolDefinition> = serde_json::from_str(&json_str)
                .map_err(|e| LoaderError::JsonError(e.to_string()))?;

            Ok(tools)
        }
    }

    /// 获取所有插件的工具
    pub fn get_all_tools(&self) -> Vec<ToolDefinition> {
        self.plugins
            .keys()
            .flat_map(|id| self.get_tools(id).unwrap_or_default())
            .collect()
    }

    /// 执行工具调用
    pub fn execute_tool(&self, plugin_id: &str, call: &ToolCall) -> Result<ToolResult, LoaderError> {
        let plugin = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| LoaderError::PluginNotLoaded(plugin_id.to_string()))?;

        let call_json = serde_json::to_string(call)
            .map_err(|e| LoaderError::JsonError(e.to_string()))?;

        let call_cstr = CString::new(call_json)
            .map_err(|e| LoaderError::JsonError(e.to_string()))?;

        unsafe {
            let result_ptr = (plugin.ffi.execute_tool)(call_cstr.as_ptr());
            if result_ptr.is_null() {
                return Ok(ToolResult {
                    success: false,
                    data: serde_json::Value::Null,
                    error: Some("Plugin returned null".to_string()),
                });
            }

            let result_str = std::ffi::CStr::from_ptr(result_ptr)
                .to_string_lossy()
                .into_owned();
            (plugin.ffi.free_string)(result_ptr);

            let result: ToolResult = serde_json::from_str(&result_str)
                .map_err(|e| LoaderError::JsonError(e.to_string()))?;

            Ok(result)
        }
    }

    /// 触发钩子
    pub fn trigger_hook(
        &mut self,
        plugin_id: &str,
        hook_name: &str,
        data: &serde_json::Value,
    ) -> Result<Option<serde_json::Value>, LoaderError> {
        let plugin = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| LoaderError::PluginNotLoaded(plugin_id.to_string()))?;

        let hook_cstr = CString::new(hook_name)
            .map_err(|e| LoaderError::JsonError(e.to_string()))?;

        let data_json = serde_json::to_string(data)
            .map_err(|e| LoaderError::JsonError(e.to_string()))?;

        let data_cstr = CString::new(data_json)
            .map_err(|e| LoaderError::JsonError(e.to_string()))?;

        unsafe {
            let result_ptr = (plugin.ffi.on_hook)(hook_cstr.as_ptr(), data_cstr.as_ptr());
            if result_ptr.is_null() {
                return Ok(None);
            }

            let result_str = std::ffi::CStr::from_ptr(result_ptr)
                .to_string_lossy()
                .into_owned();
            (plugin.ffi.free_string)(result_ptr);

            let result: serde_json::Value = serde_json::from_str(&result_str)
                .map_err(|e| LoaderError::JsonError(e.to_string()))?;

            Ok(Some(result))
        }
    }

    /// 获取已加载的插件 ID 列表
    pub fn loaded_plugins(&self) -> Vec<String> {
        self.plugins.keys().cloned().collect()
    }
}

impl Default for PluginLoader {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for PluginLoader {
    fn drop(&mut self) {
        // 关闭所有插件
        for plugin_id in self.loaded_plugins() {
            let _ = self.shutdown(&plugin_id);
        }
    }
}
