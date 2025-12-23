//! 备忘录功能模块
//!
//! 提供读取、创建、编辑、删除备忘录的功能

use crate::applescript::execute_applescript;
use serde::{Deserialize, Serialize};

/// 备忘录条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    /// 备忘录名称（标题）
    pub name: String,
    /// 备忘录内容
    pub body: String,
    /// 创建日期（ISO 8601 格式）
    pub creation_date: Option<String>,
    /// 修改日期（ISO 8601 格式）
    pub modification_date: Option<String>,
}

/// 备忘录管理器
pub struct NotesManager;

impl NotesManager {
    /// 获取所有备忘录
    ///
    /// # Returns
    /// * `Ok(Vec<Note>)` - 备忘录列表
    /// * `Err(String)` - 错误信息
    pub fn list_notes() -> Result<Vec<Note>, String> {
        // AppleScript 脚本：获取所有备忘录
        let script = r#"
            tell application "Notes"
                set noteList to {}
                repeat with aNote in notes
                    set noteName to name of aNote
                    set noteBody to body of aNote
                    set noteInfo to noteName & "|" & noteBody
                    set end of noteList to noteInfo
                end repeat
                return noteList
            end tell
        "#;

        let output = execute_applescript(script)
            .map_err(|e| format!("执行 AppleScript 失败: {}", e))?;

        // 解析输出
        let notes = Self::parse_notes_output(&output)?;

        Ok(notes)
    }

    /// 解析 AppleScript 输出
    fn parse_notes_output(output: &str) -> Result<Vec<Note>, String> {
        // AppleScript 返回的格式可能是：
        // "note1|body1, note2|body2, ..."
        // 或者每行一个
        
        let mut notes = Vec::new();
        
        // 按逗号分割（AppleScript list 的默认格式）
        let parts: Vec<&str> = output.split(',').collect();
        
        for part in parts {
            let trimmed = part.trim();
            if trimmed.is_empty() {
                continue;
            }
            
            // 移除可能的引号和空格
            let cleaned = trimmed.trim_matches(|c: char| c == '"' || c == ' ' || c == '\'');
            
            // 按 | 分割名称和内容
            let parts: Vec<&str> = cleaned.split('|').collect();
            if parts.len() >= 2 {
                notes.push(Note {
                    name: parts[0].to_string(),
                    body: parts[1..].join("|"), // 内容中可能包含 |，所以重新拼接
                    creation_date: None,
                    modification_date: None,
                });
            } else if !parts.is_empty() {
                // 只有名称，没有内容
                notes.push(Note {
                    name: parts[0].to_string(),
                    body: String::new(),
                    creation_date: None,
                    modification_date: None,
                });
            }
        }
        
        Ok(notes)
    }

    /// 读取指定备忘录的内容
    ///
    /// # Arguments
    /// * `note_name` - 备忘录名称
    ///
    /// # Returns
    /// * `Ok(Note)` - 备忘录信息
    /// * `Err(String)` - 错误信息
    pub fn read_note(note_name: &str) -> Result<Note, String> {
        // 转义单引号
        let escaped_name = note_name.replace('\'', "\\'");
        
        let script = format!(
            r#"
                tell application "Notes"
                    set targetNote to note "{}"
                    set noteName to name of targetNote
                    set noteBody to body of targetNote
                    return noteName & "|" & noteBody
                end tell
            "#,
            escaped_name
        );

        let output = execute_applescript(&script)
            .map_err(|e| format!("执行 AppleScript 失败: {}", e))?;

        // 解析输出
        let parts: Vec<&str> = output.split('|').collect();
        if parts.len() >= 2 {
            Ok(Note {
                name: parts[0].to_string(),
                body: parts[1..].join("|"),
                creation_date: None,
                modification_date: None,
            })
        } else {
            Err("无法解析备忘录内容".to_string())
        }
    }
}

