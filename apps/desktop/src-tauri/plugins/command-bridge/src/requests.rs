use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use thiserror::Error;
use uuid::Uuid;

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
    #[error("request not found: {0}")]
    NotFound(String),
}

pub struct RequestStore {
    entries: Mutex<Vec<CommandRequest>>,
}

impl RequestStore {
    /// 创建请求存储（纯内存实现）。
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(Vec::new()),
        }
    }

    /// 返回当前请求的快照（克隆）。
    pub fn list(&self) -> Vec<CommandRequest> {
        self.entries.lock().unwrap().clone()
    }

    /// 新建一个等待审批的请求并持久化。
    /// `command`/`path`/`include_hidden` 分别为命令名、目标路径、是否包含隐藏项。
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
        Ok(request)
    }

    /// 根据 `id` 更新一条请求，`mutator` 用于原地修改。
    /// 会刷新 `updated_at` 并持久化，返回修改后的快照。
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
        Ok(snapshot)
    }

    /// 按 `id` 获取请求（克隆）。
    pub fn get(&self, id: &str) -> Option<CommandRequest> {
        self.entries
            .lock()
            .unwrap()
            .iter()
            .find(|r| r.id == id)
            .cloned()
    }
}
