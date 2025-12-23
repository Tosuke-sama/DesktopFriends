//! 插件配置管理模块
//!
//! 管理插件的权限配置和设置

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;

/// 权限配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Permissions {
    /// 备忘录权限
    pub notes: NotesPermissions,
}

impl Default for Permissions {
    fn default() -> Self {
        Self {
            notes: NotesPermissions::default(),
        }
    }
}

/// 备忘录权限
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotesPermissions {
    /// 是否允许读取备忘录
    pub read: bool,
    /// 是否允许创建备忘录
    pub create: bool,
    /// 是否允许编辑备忘录
    pub edit: bool,
    /// 是否允许删除备忘录
    pub delete: bool,
}

impl Default for NotesPermissions {
    fn default() -> Self {
        Self {
            read: false,   // 默认关闭，需要用户授权
            create: false,
            edit: false,
            delete: false,
        }
    }
}

/// 配置管理器
pub struct ConfigManager {
    permissions: Mutex<Permissions>,
}

impl ConfigManager {
    /// 创建新的配置管理器
    pub fn new(config: &Value) -> Self {
        let permissions = config
            .get("permissions")
            .and_then(|p| serde_json::from_value::<Permissions>(p.clone()).ok())
            .unwrap_or_default();

        Self {
            permissions: Mutex::new(permissions),
        }
    }

    /// 获取权限配置
    pub fn get_permissions(&self) -> Permissions {
        self.permissions.lock().unwrap().clone()
    }

    /// 更新权限配置
    pub fn update_permissions(&self, permissions: Permissions) -> Result<(), String> {
        *self.permissions.lock().unwrap() = permissions;
        Ok(())
    }

    /// 检查备忘录读取权限
    pub fn can_read_notes(&self) -> bool {
        self.permissions.lock().unwrap().notes.read
    }

    /// 检查备忘录创建权限
    pub fn can_create_notes(&self) -> bool {
        self.permissions.lock().unwrap().notes.create
    }

    /// 检查备忘录编辑权限
    pub fn can_edit_notes(&self) -> bool {
        self.permissions.lock().unwrap().notes.edit
    }

    /// 检查备忘录删除权限
    pub fn can_delete_notes(&self) -> bool {
        self.permissions.lock().unwrap().notes.delete
    }
}



