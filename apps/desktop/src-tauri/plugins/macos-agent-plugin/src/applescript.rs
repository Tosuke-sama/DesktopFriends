//! AppleScript 封装模块
//!
//! 提供执行 AppleScript 的便捷接口

#[cfg(target_os = "macos")]
use std::process::Command;

/// AppleScript 执行错误
#[derive(Debug, thiserror::Error)]
pub enum AppleScriptError {
    #[error("执行 AppleScript 失败: {0}")]
    ExecutionFailed(String),
    #[error("输出解析失败: {0}")]
    ParseFailed(String),
}

/// 执行 AppleScript 脚本
///
/// # Arguments
/// * `script` - AppleScript 代码
///
/// # Returns
/// * `Ok(String)` - 脚本输出
/// * `Err(AppleScriptError)` - 执行错误
#[cfg(target_os = "macos")]
pub fn execute_applescript(script: &str) -> Result<String, AppleScriptError> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| AppleScriptError::ExecutionFailed(e.to_string()))?;

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(AppleScriptError::ExecutionFailed(error.to_string()));
    }

    let result = String::from_utf8(output.stdout)
        .map_err(|e| AppleScriptError::ParseFailed(e.to_string()))?;

    Ok(result.trim().to_string())
}

/// 非 macOS 平台的占位实现
#[cfg(not(target_os = "macos"))]
pub fn execute_applescript(_script: &str) -> Result<String, AppleScriptError> {
    Err(AppleScriptError::ExecutionFailed(
        "AppleScript 仅在 macOS 上可用".to_string(),
    ))
}



