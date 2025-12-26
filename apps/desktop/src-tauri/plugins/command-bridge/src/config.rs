use dirs::home_dir;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct BridgeConfig {
    allowed_roots: Vec<PathBuf>,
}

impl Default for BridgeConfig {
    fn default() -> Self {
        let mut roots = Vec::new();
        if let Some(home) = home_dir() {
            roots.push(normalize(&home));
        }
        if let Ok(cwd) = std::env::current_dir() {
            let cwd = normalize(&cwd);
            if !roots.iter().any(|r| cwd.starts_with(r)) {
                roots.push(cwd);
            }
        }
        Self {
            allowed_roots: roots,
        }
    }
}

impl BridgeConfig {
    /// 从 JSON 配置构建插件配置。
    ///
    /// 支持字段：
    /// - `allowed_roots: string[]` 允许访问的根目录（可为相对路径，内部会规范化）；
    /// 如果解析失败或未提供 `allowed_roots`，将回退到 [`Default`] 配置。
    pub fn from_value(value: &Value) -> Self {
        #[derive(Debug, Clone, Serialize, Deserialize)]
        struct RawConfig {
            #[serde(default)]
            allowed_roots: Vec<String>,
        }

        if let Ok(raw) = serde_json::from_value::<RawConfig>(value.clone()) {
            let mut cfg = Self {
                allowed_roots: raw
                    .allowed_roots
                    .into_iter()
                    .filter_map(|path| {
                        let trimmed = path.trim();
                        if trimmed.is_empty() {
                            None
                        } else {
                            Some(normalize(Path::new(trimmed)))
                        }
                    })
                    .collect(),
            };

            if cfg.allowed_roots.is_empty() {
                cfg = Self::default();
            }
            cfg
        } else {
            Self::default()
        }
    }

    /// 确保给定路径所在目录被加入授权根目录（若尚未覆盖则追加）。
    pub fn ensure_root(&mut self, path: &Path) {
        let normalized = normalize(path);
        if !self
            .allowed_roots
            .iter()
            .any(|root| normalized.starts_with(root))
        {
            self.allowed_roots.push(normalized);
        }
    }

    /// 判断给定路径是否在任一授权根目录之内。
    pub fn is_allowed(&self, path: &Path) -> bool {
        let normalized = normalize(path);
        self.allowed_roots
            .iter()
            .any(|root| normalized.starts_with(root))
    }

    /// 以字符串形式返回授权根目录列表（供前端展示）。
    pub fn allowed_roots(&self) -> Vec<String> {
        self.allowed_roots
            .iter()
            .map(|p| p.display().to_string())
            .collect()
    }

    /// 以 `PathBuf` 返回授权根目录列表（供内部检查）。
    pub fn allowed_root_paths(&self) -> Vec<PathBuf> {
        self.allowed_roots.clone()
    }
}

/// 规范化路径：
/// - 若为相对路径，则基于当前工作目录拼接；
/// - 返回系统 `canonicalize` 后的绝对路径（失败时返回拼接结果）。
fn normalize(path: &Path) -> PathBuf {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    };
    absolute.canonicalize().unwrap_or(absolute)
}
