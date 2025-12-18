//! 插件注册表
//!
//! 管理已安装插件的元数据和状态持久化

use super::api::{PluginInfo, PluginManifest};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum RegistryError {
    #[error("插件 '{0}' 不存在")]
    PluginNotFound(String),

    #[error("插件 '{0}' 已存在")]
    PluginExists(String),

    #[error("无效的 manifest: {0}")]
    InvalidManifest(String),

    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),

    #[error("JSON 解析错误: {0}")]
    JsonError(#[from] serde_json::Error),
}

/// 插件状态持久化数据
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PluginState {
    enabled: bool,
    config: serde_json::Value,
}

/// 注册表持久化数据
#[derive(Debug, Default, Serialize, Deserialize)]
struct RegistryData {
    /// 插件状态 (plugin_id -> state)
    plugins: HashMap<String, PluginState>,
}

/// 注册的插件条目
#[derive(Debug, Clone)]
pub struct PluginEntry {
    /// 插件清单
    pub manifest: PluginManifest,
    /// 插件目录
    pub dir: PathBuf,
    /// 动态库路径
    pub lib_path: PathBuf,
    /// 是否启用
    pub enabled: bool,
    /// 插件配置
    pub config: serde_json::Value,
}

impl PluginEntry {
    /// 转换为 PluginInfo
    pub fn to_info(&self) -> PluginInfo {
        PluginInfo {
            id: self.manifest.id.clone(),
            name: self.manifest.name.clone(),
            version: self.manifest.version.clone(),
            author: self.manifest.author.clone(),
            description: self.manifest.description.clone(),
            enabled: self.enabled,
            ui: self.manifest.ui.clone(),
            dir: self.dir.clone(),
        }
    }
}

/// 插件注册表
pub struct PluginRegistry {
    /// 插件目录
    plugins_dir: PathBuf,
    /// 状态文件路径
    state_file: PathBuf,
    /// 已注册的插件
    entries: HashMap<String, PluginEntry>,
}

impl PluginRegistry {
    /// 创建新的注册表
    ///
    /// # Arguments
    /// * `plugins_dir` - 插件安装目录
    pub fn new(plugins_dir: PathBuf) -> Result<Self, RegistryError> {
        // 确保目录存在
        fs::create_dir_all(&plugins_dir)?;

        let state_file = plugins_dir.join("registry.json");

        let mut registry = Self {
            plugins_dir,
            state_file,
            entries: HashMap::new(),
        };

        // 加载已安装的插件
        registry.scan_plugins()?;

        Ok(registry)
    }

    /// 扫描插件目录，加载已安装的插件
    fn scan_plugins(&mut self) -> Result<(), RegistryError> {
        // 加载持久化状态
        let registry_data = self.load_state()?;

        // 扫描目录
        if let Ok(entries) = fs::read_dir(&self.plugins_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    // 尝试读取 manifest.json
                    let manifest_path = path.join("manifest.json");
                    if manifest_path.exists() {
                        if let Ok(manifest) = self.read_manifest(&manifest_path) {
                            let plugin_id = manifest.id.clone();

                            // 获取动态库路径
                            let lib_path = path.join(&manifest.main);

                            // 获取保存的状态或使用默认值
                            let state = registry_data
                                .plugins
                                .get(&plugin_id)
                                .cloned()
                                .unwrap_or(PluginState {
                                    enabled: false,
                                    config: serde_json::Value::Object(Default::default()),
                                });

                            self.entries.insert(
                                plugin_id,
                                PluginEntry {
                                    manifest,
                                    dir: path,
                                    lib_path,
                                    enabled: state.enabled,
                                    config: state.config,
                                },
                            );
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// 读取 manifest 文件
    fn read_manifest(&self, path: &Path) -> Result<PluginManifest, RegistryError> {
        let content = fs::read_to_string(path)?;
        let manifest: PluginManifest =
            serde_json::from_str(&content).map_err(|e| RegistryError::InvalidManifest(e.to_string()))?;
        Ok(manifest)
    }

    /// 加载持久化状态
    fn load_state(&self) -> Result<RegistryData, RegistryError> {
        if self.state_file.exists() {
            let content = fs::read_to_string(&self.state_file)?;
            Ok(serde_json::from_str(&content)?)
        } else {
            Ok(RegistryData::default())
        }
    }

    /// 保存持久化状态
    fn save_state(&self) -> Result<(), RegistryError> {
        let data = RegistryData {
            plugins: self
                .entries
                .iter()
                .map(|(id, entry)| {
                    (
                        id.clone(),
                        PluginState {
                            enabled: entry.enabled,
                            config: entry.config.clone(),
                        },
                    )
                })
                .collect(),
        };

        let content = serde_json::to_string_pretty(&data)?;
        fs::write(&self.state_file, content)?;
        Ok(())
    }

    /// 注册新插件
    ///
    /// # Arguments
    /// * `manifest` - 插件清单
    /// * `plugin_dir` - 插件目录
    pub fn register(&mut self, manifest: PluginManifest, plugin_dir: PathBuf) -> Result<PluginInfo, RegistryError> {
        let plugin_id = manifest.id.clone();

        if self.entries.contains_key(&plugin_id) {
            return Err(RegistryError::PluginExists(plugin_id));
        }

        let lib_path = plugin_dir.join(&manifest.main);

        let entry = PluginEntry {
            manifest,
            dir: plugin_dir,
            lib_path,
            enabled: false,
            config: serde_json::Value::Object(Default::default()),
        };

        let info = entry.to_info();
        self.entries.insert(plugin_id, entry);
        self.save_state()?;

        Ok(info)
    }

    /// 注销插件
    pub fn unregister(&mut self, plugin_id: &str) -> Result<(), RegistryError> {
        if self.entries.remove(plugin_id).is_none() {
            return Err(RegistryError::PluginNotFound(plugin_id.to_string()));
        }
        self.save_state()?;
        Ok(())
    }

    /// 获取插件条目
    pub fn get(&self, plugin_id: &str) -> Result<&PluginEntry, RegistryError> {
        self.entries
            .get(plugin_id)
            .ok_or_else(|| RegistryError::PluginNotFound(plugin_id.to_string()))
    }

    /// 获取插件条目（可变）
    pub fn get_mut(&mut self, plugin_id: &str) -> Result<&mut PluginEntry, RegistryError> {
        self.entries
            .get_mut(plugin_id)
            .ok_or_else(|| RegistryError::PluginNotFound(plugin_id.to_string()))
    }

    /// 设置插件启用状态
    pub fn set_enabled(&mut self, plugin_id: &str, enabled: bool) -> Result<(), RegistryError> {
        let entry = self.get_mut(plugin_id)?;
        entry.enabled = enabled;
        self.save_state()?;
        Ok(())
    }

    /// 更新插件配置
    pub fn set_config(&mut self, plugin_id: &str, config: serde_json::Value) -> Result<(), RegistryError> {
        let entry = self.get_mut(plugin_id)?;
        entry.config = config;
        self.save_state()?;
        Ok(())
    }

    /// 获取所有插件信息
    pub fn list(&self) -> Vec<PluginInfo> {
        self.entries.values().map(|e| e.to_info()).collect()
    }

    /// 获取已启用的插件
    pub fn enabled_plugins(&self) -> Vec<&PluginEntry> {
        self.entries.values().filter(|e| e.enabled).collect()
    }

    /// 检查插件是否存在
    pub fn exists(&self, plugin_id: &str) -> bool {
        self.entries.contains_key(plugin_id)
    }

    /// 获取插件目录
    pub fn plugins_dir(&self) -> &Path {
        &self.plugins_dir
    }

    /// 刷新注册表（重新扫描目录）
    pub fn refresh(&mut self) -> Result<(), RegistryError> {
        self.entries.clear();
        self.scan_plugins()
    }
}
