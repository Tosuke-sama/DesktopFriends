use crate::command::{CommandOutput, CommandPlan, NativeCommand};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommandRecord {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub program: String,
    pub args: Vec<String>,
    pub working_dir: Option<String>,
    pub status_code: i32,
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub timestamp: DateTime<Utc>,
}

impl CommandRecord {
    pub fn from_execution(
        plan: &CommandPlan,
        native: &NativeCommand,
        output: &CommandOutput,
    ) -> Self {
        Self {
            id: plan.id.to_string(),
            display_name: plan.display_name.to_string(),
            description: plan.description.clone(),
            program: native.program.clone(),
            args: native.args.clone(),
            working_dir: native.working_dir.as_ref().map(|p| p.display().to_string()),
            status_code: output.status_code,
            success: output.success,
            stdout: truncate(&output.stdout, 8000),
            stderr: truncate(&output.stderr, 8000),
            timestamp: Utc::now(),
        }
    }
}

#[derive(Debug, Error)]
pub enum HistoryError {
    #[error("failed to read history: {0}")]
    Io(#[from] std::io::Error),
    #[error("failed to parse history: {0}")]
    Json(#[from] serde_json::Error),
}

pub struct HistoryStore {
    path: PathBuf,
    max_entries: usize,
}

impl HistoryStore {
    pub fn new(path: PathBuf, max_entries: usize) -> Self {
        Self { path, max_entries }
    }

    pub fn append(&self, record: CommandRecord) -> Result<(), HistoryError> {
        let mut history = self.load().unwrap_or_default();
        history.push(record);
        if history.len() > self.max_entries {
            let remove = history.len() - self.max_entries;
            history.drain(0..remove);
        }
        self.save(&history)
    }

    pub fn load(&self) -> Result<Vec<CommandRecord>, HistoryError> {
        if !self.path.exists() {
            return Ok(Vec::new());
        }
        let content = fs::read_to_string(&self.path)?;
        if content.trim().is_empty() {
            return Ok(Vec::new());
        }
        let history = serde_json::from_str(&content)?;
        Ok(history)
    }

    fn save(&self, history: &[CommandRecord]) -> Result<(), HistoryError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let data = serde_json::to_string_pretty(history)?;
        fs::write(&self.path, data)?;
        Ok(())
    }

    pub fn public_path(&self, plugin_id: &str) -> String {
        format!("plugin://localhost/{}/data/{}", plugin_id, self.file_name())
    }

    pub fn file_name(&self) -> String {
        self.path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "command-history.json".to_string())
    }
}

fn truncate(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        value.to_string()
    } else {
        format!("{}…", &value[..limit])
    }
}
