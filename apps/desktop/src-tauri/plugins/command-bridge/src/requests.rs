use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use thiserror::Error;
use uuid::Uuid;

use crate::REQUEST_FILE;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RequestState {
    Pending,
    Running,
    Completed,
    Rejected,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandRequest {
    pub id: String,
    pub command: String,
    pub path: String,
    pub include_hidden: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub state: RequestState,
    pub message: Option<String>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
}

impl std::fmt::Display for RequestState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RequestState::Pending => write!(f, "pending"),
            RequestState::Running => write!(f, "running"),
            RequestState::Completed => write!(f, "completed"),
            RequestState::Rejected => write!(f, "rejected"),
            RequestState::Failed => write!(f, "failed"),
        }
    }
}

#[derive(Debug, Error)]
pub enum RequestError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("request not found: {0}")]
    NotFound(String),
}

pub struct RequestStore {
    path: PathBuf,
    entries: Mutex<Vec<CommandRequest>>,
}

impl RequestStore {
    pub fn new(path: PathBuf) -> Result<Self, RequestError> {
        let entries = if path.exists() {
            let data = fs::read_to_string(&path)?;
            if data.trim().is_empty() {
                Vec::new()
            } else {
                serde_json::from_str(&data)?
            }
        } else {
            Vec::new()
        };
        Ok(Self {
            path,
            entries: Mutex::new(entries),
        })
    }

    fn persist(&self, entries: &[CommandRequest]) -> Result<(), RequestError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let data = serde_json::to_string_pretty(entries)?;
        fs::write(&self.path, data)?;
        Ok(())
    }

    pub fn list(&self) -> Vec<CommandRequest> {
        self.entries.lock().unwrap().clone()
    }

    pub fn create_request(
        &self,
        command: &str,
        path: &str,
        include_hidden: bool,
    ) -> Result<CommandRequest, RequestError> {
        let mut entries = self.entries.lock().unwrap();
        let now = Utc::now();
        let request = CommandRequest {
            id: Uuid::new_v4().to_string(),
            command: command.to_string(),
            path: path.to_string(),
            include_hidden,
            created_at: now,
            updated_at: now,
            state: RequestState::Pending,
            message: Some("等待用户授权".to_string()),
            stdout: None,
            stderr: None,
        };
        entries.push(request.clone());
        self.persist(&entries)?;
        Ok(request)
    }

    pub fn update<F>(&self, id: &str, mutator: F) -> Result<CommandRequest, RequestError>
    where
        F: FnOnce(&mut CommandRequest),
    {
        let mut entries = self.entries.lock().unwrap();
        let request = entries
            .iter_mut()
            .find(|r| r.id == id)
            .ok_or_else(|| RequestError::NotFound(id.to_string()))?;
        mutator(request);
        request.updated_at = Utc::now();
        let snapshot = request.clone();
        self.persist(&entries)?;
        Ok(snapshot)
    }

    pub fn get(&self, id: &str) -> Option<CommandRequest> {
        self.entries
            .lock()
            .unwrap()
            .iter()
            .find(|r| r.id == id)
            .cloned()
    }

    pub fn public_path(&self, plugin_id: &str) -> String {
        format!("plugin://localhost/{}/data/{}", plugin_id, self.file_name())
    }

    pub fn file_name(&self) -> String {
        self.path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| REQUEST_FILE.to_string())
    }
}
