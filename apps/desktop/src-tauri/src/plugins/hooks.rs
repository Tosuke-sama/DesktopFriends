//! 钩子分发器
//!
//! 管理插件钩子的注册和分发

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// 钩子响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookResult {
    /// 来源插件 ID
    pub plugin_id: String,
    /// 响应数据
    pub data: serde_json::Value,
}

/// 钩子分发器
///
/// 管理钩子的注册和分发
pub struct HookDispatcher {
    /// 钩子到插件的映射 (hook_name -> [plugin_id])
    hooks: HashMap<String, HashSet<String>>,
    /// 插件到钩子的反向映射 (plugin_id -> [hook_name])
    plugin_hooks: HashMap<String, HashSet<String>>,
}

impl HookDispatcher {
    /// 创建新的分发器
    pub fn new() -> Self {
        Self {
            hooks: HashMap::new(),
            plugin_hooks: HashMap::new(),
        }
    }

    /// 注册插件的钩子
    ///
    /// # Arguments
    /// * `hook_name` - 钩子名称
    /// * `plugin_id` - 插件 ID
    pub fn register(&mut self, hook_name: &str, plugin_id: &str) {
        // 添加到钩子映射
        self.hooks
            .entry(hook_name.to_string())
            .or_default()
            .insert(plugin_id.to_string());

        // 添加到反向映射
        self.plugin_hooks
            .entry(plugin_id.to_string())
            .or_default()
            .insert(hook_name.to_string());
    }

    /// 批量注册插件的钩子
    pub fn register_many(&mut self, hooks: &[String], plugin_id: &str) {
        for hook in hooks {
            self.register(hook, plugin_id);
        }
    }

    /// 注销插件的单个钩子
    pub fn unregister(&mut self, hook_name: &str, plugin_id: &str) {
        if let Some(plugins) = self.hooks.get_mut(hook_name) {
            plugins.remove(plugin_id);
            if plugins.is_empty() {
                self.hooks.remove(hook_name);
            }
        }

        if let Some(hooks) = self.plugin_hooks.get_mut(plugin_id) {
            hooks.remove(hook_name);
            if hooks.is_empty() {
                self.plugin_hooks.remove(plugin_id);
            }
        }
    }

    /// 注销插件的所有钩子
    pub fn unregister_all(&mut self, plugin_id: &str) {
        // 获取该插件注册的所有钩子
        if let Some(hooks) = self.plugin_hooks.remove(plugin_id) {
            // 从每个钩子中移除该插件
            for hook_name in hooks {
                if let Some(plugins) = self.hooks.get_mut(&hook_name) {
                    plugins.remove(plugin_id);
                    if plugins.is_empty() {
                        self.hooks.remove(&hook_name);
                    }
                }
            }
        }
    }

    /// 获取监听指定钩子的所有插件 ID
    pub fn get_listeners(&self, hook_name: &str) -> Vec<String> {
        self.hooks
            .get(hook_name)
            .map(|plugins| plugins.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// 检查是否有插件监听指定钩子
    pub fn has_listeners(&self, hook_name: &str) -> bool {
        self.hooks
            .get(hook_name)
            .map(|plugins| !plugins.is_empty())
            .unwrap_or(false)
    }

    /// 获取插件注册的所有钩子
    pub fn get_plugin_hooks(&self, plugin_id: &str) -> Vec<String> {
        self.plugin_hooks
            .get(plugin_id)
            .map(|hooks| hooks.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// 获取所有已注册的钩子名称
    pub fn list_hooks(&self) -> Vec<String> {
        self.hooks.keys().cloned().collect()
    }

    /// 清空所有注册
    pub fn clear(&mut self) {
        self.hooks.clear();
        self.plugin_hooks.clear();
    }
}

impl Default for HookDispatcher {
    fn default() -> Self {
        Self::new()
    }
}

/// 预定义的钩子名称
pub mod hooks {
    /// 文件打开事件
    pub const ON_FILE_OPEN: &str = "on_file_open";
    /// 文本选择事件
    pub const ON_TEXT_SELECT: &str = "on_text_select";
    /// 应用启动事件
    pub const ON_APP_START: &str = "on_app_start";
    /// 应用关闭事件
    pub const ON_APP_CLOSE: &str = "on_app_close";
    /// 消息发送前
    pub const BEFORE_MESSAGE_SEND: &str = "before_message_send";
    /// 消息接收后
    pub const AFTER_MESSAGE_RECEIVE: &str = "after_message_receive";
    /// Live2D 动作触发
    pub const ON_LIVE2D_ACTION: &str = "on_live2d_action";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_and_unregister() {
        let mut dispatcher = HookDispatcher::new();

        // 注册
        dispatcher.register("on_file_open", "pdf-reader");
        dispatcher.register("on_file_open", "image-viewer");
        dispatcher.register("on_text_select", "pdf-reader");

        // 验证
        assert_eq!(dispatcher.get_listeners("on_file_open").len(), 2);
        assert_eq!(dispatcher.get_listeners("on_text_select").len(), 1);

        // 注销单个
        dispatcher.unregister("on_file_open", "image-viewer");
        assert_eq!(dispatcher.get_listeners("on_file_open").len(), 1);

        // 注销所有
        dispatcher.unregister_all("pdf-reader");
        assert!(dispatcher.get_listeners("on_file_open").is_empty());
        assert!(dispatcher.get_listeners("on_text_select").is_empty());
    }
}
