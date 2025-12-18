//! 插件管理器
//!
//! 统一管理插件的安装、启用、禁用、卸载等生命周期

use super::api::{PluginContext, PluginInfo, PluginManifest, ToolCall, ToolDefinition, ToolResult};
use super::hooks::{HookDispatcher, HookResult};
use super::loader::{LoaderError, PluginLoader};
use super::registry::{PluginRegistry, RegistryError};
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use thiserror::Error;
use zip::ZipArchive;

#[derive(Error, Debug)]
pub enum ManagerError {
    #[error("注册表错误: {0}")]
    Registry(#[from] RegistryError),

    #[error("加载器错误: {0}")]
    Loader(#[from] LoaderError),

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("ZIP 解压错误: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("JSON 解析错误: {0}")]
    Json(#[from] serde_json::Error),

    #[error("无效的插件包: {0}")]
    InvalidPackage(String),

    #[error("插件 '{0}' 未启用")]
    PluginNotEnabled(String),

    #[error("动态库文件不存在: {0}")]
    LibraryNotFound(String),
}

/// 插件管理器
pub struct PluginManager {
    /// 插件加载器
    loader: PluginLoader,
    /// 插件注册表
    registry: PluginRegistry,
    /// 钩子分发器
    hooks: HookDispatcher,
}

impl PluginManager {
    /// 创建新的插件管理器
    ///
    /// # Arguments
    /// * `plugins_dir` - 插件安装目录
    pub fn new(plugins_dir: PathBuf) -> Result<Self, ManagerError> {
        let registry = PluginRegistry::new(plugins_dir)?;
        let loader = PluginLoader::new();
        let hooks = HookDispatcher::new();

        let mut manager = Self {
            loader,
            registry,
            hooks,
        };

        // 自动启用之前启用的插件
        manager.restore_enabled_plugins()?;

        Ok(manager)
    }

    /// 恢复之前启用的插件
    fn restore_enabled_plugins(&mut self) -> Result<(), ManagerError> {
        let enabled_plugins: Vec<_> = self
            .registry
            .enabled_plugins()
            .iter()
            .map(|e| e.manifest.id.clone())
            .collect();

        for plugin_id in enabled_plugins {
            if let Err(e) = self.enable(&plugin_id) {
                eprintln!("警告: 无法恢复插件 '{}': {}", plugin_id, e);
                // 标记为禁用
                let _ = self.registry.set_enabled(&plugin_id, false);
            }
        }

        Ok(())
    }

    /// 安装插件
    ///
    /// 从 zip 文件安装插件，不会自动启用
    ///
    /// # Arguments
    /// * `zip_path` - 插件 zip 包路径
    pub fn install(&mut self, zip_path: &Path) -> Result<PluginInfo, ManagerError> {
        // 打开 zip 文件
        let file = fs::File::open(zip_path)?;
        let mut archive = ZipArchive::new(file)?;

        // 查找并读取 manifest.json
        let manifest = self.read_manifest_from_zip(&mut archive)?;
        let plugin_id = manifest.id.clone();

        // 检查是否已安装
        if self.registry.exists(&plugin_id) {
            // 如果已安装，先卸载
            self.uninstall(&plugin_id)?;
        }

        // 创建插件目录
        let plugin_dir = self.registry.plugins_dir().join(&plugin_id);
        fs::create_dir_all(&plugin_dir)?;

        // 解压文件
        for i in 0..archive.len() {
            let mut file = archive.by_index(i)?;
            let outpath = match file.enclosed_name() {
                Some(path) => plugin_dir.join(path),
                None => continue,
            };

            if file.name().ends_with('/') {
                fs::create_dir_all(&outpath)?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        fs::create_dir_all(p)?;
                    }
                }
                let mut outfile = fs::File::create(&outpath)?;
                let mut buffer = Vec::new();
                file.read_to_end(&mut buffer)?;
                outfile.write_all(&buffer)?;
            }

            // 设置可执行权限（Unix）
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if outpath.extension().map(|e| e == "dylib" || e == "so").unwrap_or(false) {
                    let mut perms = fs::metadata(&outpath)?.permissions();
                    perms.set_mode(0o755);
                    fs::set_permissions(&outpath, perms)?;
                }
            }
        }

        // 注册到注册表
        let info = self.registry.register(manifest, plugin_dir)?;

        Ok(info)
    }

    /// 从 zip 中读取 manifest
    fn read_manifest_from_zip<R: Read + std::io::Seek>(
        &self,
        archive: &mut ZipArchive<R>,
    ) -> Result<PluginManifest, ManagerError> {
        // 尝试查找 manifest.json（可能在根目录或子目录中）
        for i in 0..archive.len() {
            let file = archive.by_index(i)?;
            if file.name().ends_with("manifest.json") {
                let manifest: PluginManifest = serde_json::from_reader(file)?;
                return Ok(manifest);
            }
        }

        Err(ManagerError::InvalidPackage(
            "找不到 manifest.json".to_string(),
        ))
    }

    /// 启用插件
    pub fn enable(&mut self, plugin_id: &str) -> Result<(), ManagerError> {
        let entry = self.registry.get(plugin_id)?;

        // 检查动态库是否存在
        if !entry.lib_path.exists() {
            return Err(ManagerError::LibraryNotFound(
                entry.lib_path.display().to_string(),
            ));
        }

        // 加载动态库
        self.loader.load(plugin_id, &entry.lib_path)?;

        // 创建上下文
        let data_dir = entry.dir.join("data");
        fs::create_dir_all(&data_dir)?;

        let ctx = PluginContext {
            plugin_id: plugin_id.to_string(),
            data_dir,
            config: entry.config.clone(),
        };

        // 初始化插件
        self.loader.initialize(plugin_id, &ctx)?;

        // 注册钩子
        self.hooks
            .register_many(&entry.manifest.hooks, plugin_id);

        // 更新注册表状态
        self.registry.set_enabled(plugin_id, true)?;

        Ok(())
    }

    /// 禁用插件
    pub fn disable(&mut self, plugin_id: &str) -> Result<(), ManagerError> {
        // 注销钩子
        self.hooks.unregister_all(plugin_id);

        // 关闭并卸载
        if self.loader.is_loaded(plugin_id) {
            self.loader.shutdown(plugin_id)?;
            self.loader.unload(plugin_id)?;
        }

        // 更新注册表状态
        self.registry.set_enabled(plugin_id, false)?;

        Ok(())
    }

    /// 卸载插件
    pub fn uninstall(&mut self, plugin_id: &str) -> Result<(), ManagerError> {
        // 先禁用
        let _ = self.disable(plugin_id);

        // 获取插件目录
        let entry = self.registry.get(plugin_id)?;
        let plugin_dir = entry.dir.clone();

        // 从注册表移除
        self.registry.unregister(plugin_id)?;

        // 删除插件目录
        if plugin_dir.exists() {
            fs::remove_dir_all(&plugin_dir)?;
        }

        Ok(())
    }

    /// 获取插件列表
    pub fn list(&self) -> Vec<PluginInfo> {
        self.registry.list()
    }

    /// 获取插件信息
    pub fn get(&self, plugin_id: &str) -> Result<PluginInfo, ManagerError> {
        Ok(self.registry.get(plugin_id)?.to_info())
    }

    /// 获取所有插件提供的工具
    pub fn get_all_tools(&self) -> Vec<ToolDefinition> {
        self.loader.get_all_tools()
    }

    /// 执行工具调用
    pub fn execute_tool(&self, plugin_id: &str, call: &ToolCall) -> Result<ToolResult, ManagerError> {
        if !self.loader.is_loaded(plugin_id) {
            return Err(ManagerError::PluginNotEnabled(plugin_id.to_string()));
        }

        Ok(self.loader.execute_tool(plugin_id, call)?)
    }

    /// 触发钩子
    ///
    /// 返回所有响应的插件结果
    pub fn trigger_hook(&mut self, hook_name: &str, data: &Value) -> Vec<HookResult> {
        let listeners = self.hooks.get_listeners(hook_name);
        let mut results = Vec::new();

        for plugin_id in listeners {
            if let Ok(Some(response)) = self.loader.trigger_hook(&plugin_id, hook_name, data) {
                results.push(HookResult {
                    plugin_id,
                    data: response,
                });
            }
        }

        results
    }

    /// 读取插件 UI 文件
    pub fn read_plugin_ui(&self, plugin_id: &str, ui_path: &str) -> Result<String, ManagerError> {
        let entry = self.registry.get(plugin_id)?;
        let full_path = entry.dir.join(ui_path);
        let content = fs::read_to_string(full_path)?;
        Ok(content)
    }

    /// 更新插件配置
    pub fn set_config(&mut self, plugin_id: &str, config: Value) -> Result<(), ManagerError> {
        self.registry.set_config(plugin_id, config)?;
        Ok(())
    }

    /// 刷新插件列表
    pub fn refresh(&mut self) -> Result<(), ManagerError> {
        self.registry.refresh()?;
        Ok(())
    }

    /// 获取插件窗口配置
    ///
    /// 返回 (插件目录, 窗口配置)
    pub fn get_plugin_window_config(
        &self,
        plugin_id: &str,
        window_name: &str,
    ) -> Result<(PathBuf, serde_json::Value), ManagerError> {
        let entry = self.registry.get(plugin_id)?;

        let ui_config = entry.manifest.ui.as_ref()
            .ok_or_else(|| ManagerError::InvalidPackage(format!("插件 {} 没有 UI 配置", plugin_id)))?;

        let windows_value = ui_config.windows.as_ref()
            .ok_or_else(|| ManagerError::InvalidPackage(format!("插件 {} 没有窗口配置", plugin_id)))?;

        let windows = windows_value.as_object()
            .ok_or_else(|| ManagerError::InvalidPackage(format!("插件 {} 的窗口配置格式无效", plugin_id)))?;

        let window_config = windows.get(window_name)
            .cloned()
            .ok_or_else(|| ManagerError::InvalidPackage(format!("插件 {} 没有名为 {} 的窗口", plugin_id, window_name)))?;

        Ok((entry.dir.clone(), window_config))
    }
}

impl Drop for PluginManager {
    fn drop(&mut self) {
        // 禁用所有已启用的插件
        let enabled: Vec<_> = self
            .registry
            .enabled_plugins()
            .iter()
            .map(|e| e.manifest.id.clone())
            .collect();

        for plugin_id in enabled {
            let _ = self.disable(&plugin_id);
        }
    }
}
