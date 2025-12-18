//! 插件 API 定义
//!
//! 定义插件必须实现的 trait 和相关数据结构

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

/// 插件上下文，在初始化时传递给插件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginContext {
    /// 插件 ID
    pub plugin_id: String,
    /// 插件数据目录
    pub data_dir: PathBuf,
    /// 插件配置
    pub config: Value,
}

/// LLM 工具调用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    /// 工具名称
    pub name: String,
    /// 工具参数
    pub arguments: Value,
}

/// 工具调用结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    /// 是否成功
    pub success: bool,
    /// 返回数据
    pub data: Value,
    /// 错误信息
    pub error: Option<String>,
}

impl ToolResult {
    /// 创建成功结果
    pub fn success(data: Value) -> Self {
        Self {
            success: true,
            data,
            error: None,
        }
    }

    /// 创建错误结果
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
    /// 工具所属插件 ID
    pub plugin_id: String,
    /// 工具名称
    pub name: String,
    /// 工具描述
    pub description: String,
    /// 参数 JSON Schema
    pub parameters: Value,
}

/// 插件 UI 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginUI {
    /// UI 面板路径（相对于插件目录）
    pub panel: String,
    /// UI 位置
    pub position: UIPosition,
    /// 窗口配置（可选）
    #[serde(default)]
    pub windows: Option<Value>,
}

/// UI 显示位置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UIPosition {
    Sidebar,
    Toolbar,
    Floating,
}

/// 插件清单（manifest.json）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    /// 插件 ID
    pub id: String,
    /// 插件名称
    pub name: String,
    /// 版本号
    pub version: String,
    /// 作者
    pub author: String,
    /// 描述
    pub description: String,
    /// 动态库文件名
    pub main: String,
    /// UI 配置（可选）
    pub ui: Option<PluginUI>,
    /// 所需权限
    #[serde(default)]
    pub permissions: Vec<String>,
    /// 工具定义（用于 manifest 中的静态声明）
    #[serde(default)]
    pub tools: Vec<ManifestTool>,
    /// 监听的钩子
    #[serde(default)]
    pub hooks: Vec<String>,
}

/// manifest 中的工具定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestTool {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub parameters: Value,
}

/// 插件信息（运行时状态）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    /// 插件 ID
    pub id: String,
    /// 插件名称
    pub name: String,
    /// 版本号
    pub version: String,
    /// 作者
    pub author: String,
    /// 描述
    pub description: String,
    /// 是否已启用
    pub enabled: bool,
    /// UI 配置
    pub ui: Option<PluginUI>,
    /// 插件目录
    pub dir: PathBuf,
}

/// 钩子返回值
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookResponse {
    /// 动作类型
    pub action: String,
    /// 附加数据
    #[serde(flatten)]
    pub data: Value,
}

// 注意：插件使用 C-stable FFI 接口（通过 JSON 字符串传递数据）
// 插件需要导出以下函数：
// - plugin_initialize(ctx_json: *const c_char) -> i32
// - plugin_shutdown() -> i32
// - plugin_get_tools() -> *mut c_char
// - plugin_execute_tool(call_json: *const c_char) -> *mut c_char
// - plugin_on_hook(hook_name: *const c_char, data_json: *const c_char) -> *mut c_char
// - plugin_free_string(s: *mut c_char)
// - plugin_get_last_error() -> *mut c_char
