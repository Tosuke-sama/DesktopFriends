use std::path::PathBuf;

pub struct PathUtils;

impl PathUtils {
    /// 展开路径字符串：
    /// - 支持 `~` 或 `~/xxx` 展开到用户家目录；
    /// - 其余情况原样转换为 `PathBuf`。
    fn expand_path(input: &str) -> PathBuf {
        if let Some(rest) = input.strip_prefix("~/") {
            if let Some(home) = dirs::home_dir() {
                return home.join(rest);
            }
        } else if input == "~" {
            if let Some(home) = dirs::home_dir() {
                return home;
            }
        }
        PathBuf::from(input)
    }

    /// 解析目标目录参数：
    /// - 若传入了 `path` 字符串，则支持 `~` 展开；
    /// - 否则优先使用插件数据目录，其次使用进程当前目录。
    /// 出错时返回错误描述字符串。
    pub fn resolve_directory(arg: Option<&str>) -> Result<PathBuf, String> {
        if let Some(raw) = arg {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Err("目标目录不能为空".to_string());
            }
            return Ok(Self::expand_path(trimmed));
        }
        std::env::current_dir().map_err(|e| e.to_string())
    }
}
