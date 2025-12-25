use dirs::home_dir;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RawConfig {
    #[serde(default)]
    allowed_roots: Vec<String>,
    #[serde(default = "RawConfig::default_history_depth")]
    history_depth: usize,
}

impl RawConfig {
    fn default_history_depth() -> usize {
        20
    }
}

#[derive(Debug, Clone)]
pub struct BridgeConfig {
    allowed_roots: Vec<PathBuf>,
    history_depth: usize,
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
            history_depth: RawConfig::default_history_depth(),
        }
    }
}

impl BridgeConfig {
    pub fn from_value(value: &Value) -> Self {
        if let Ok(raw) = serde_json::from_value::<RawConfig>(value.clone()) {
            let mut cfg = Self {
                allowed_roots: raw
                    .allowed_roots
                    .into_iter()
                    .filter_map(|path| {
                        if path.trim().is_empty() {
                            None
                        } else {
                            Some(normalize(Path::new(&path)))
                        }
                    })
                    .collect(),
                history_depth: raw.history_depth,
            };

            if cfg.allowed_roots.is_empty() {
                cfg = Self::default();
            }
            cfg
        } else {
            Self::default()
        }
    }

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

    pub fn is_allowed(&self, path: &Path) -> bool {
        let normalized = normalize(path);
        self.allowed_roots
            .iter()
            .any(|root| normalized.starts_with(root))
    }

    pub fn history_depth(&self) -> usize {
        self.history_depth
    }

    pub fn allowed_roots(&self) -> Vec<String> {
        self.allowed_roots
            .iter()
            .map(|p| p.display().to_string())
            .collect()
    }

    pub fn allowed_root_paths(&self) -> Vec<PathBuf> {
        self.allowed_roots.clone()
    }
}

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
