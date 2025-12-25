use serde::Serialize;
use std::path::PathBuf;
use std::process::Command as ProcessCommand;
use thiserror::Error;

#[derive(Clone, Debug)]
pub struct NativeCommand {
    pub program: String,
    pub args: Vec<String>,
    pub working_dir: Option<PathBuf>,
}

impl NativeCommand {
    pub fn new(program: impl Into<String>) -> Self {
        Self {
            program: program.into(),
            args: Vec::new(),
            working_dir: None,
        }
    }

    pub fn with_args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        for arg in args {
            self.args.push(arg.into());
        }
        self
    }

    pub fn working_dir(mut self, dir: impl Into<PathBuf>) -> Self {
        self.working_dir = Some(dir.into());
        self
    }
}

#[derive(Clone, Debug)]
pub struct CommandPlan {
    pub id: &'static str,
    pub display_name: &'static str,
    pub description: String,
    pub unix: NativeCommand,
    pub windows: Option<NativeCommand>,
}

impl CommandPlan {
    pub fn new(
        id: &'static str,
        display_name: &'static str,
        description: impl Into<String>,
        unix: NativeCommand,
    ) -> Self {
        Self {
            id,
            display_name,
            description: description.into(),
            unix,
            windows: None,
        }
    }

    pub fn with_windows(mut self, windows: NativeCommand) -> Self {
        self.windows = Some(windows);
        self
    }

    pub fn resolve(&self) -> Result<NativeCommand, CommandError> {
        if cfg!(target_os = "windows") {
            self.windows
                .clone()
                .or_else(|| Some(self.unix.clone()))
                .ok_or(CommandError::UnsupportedPlatform {
                    command_id: self.id,
                })
        } else {
            Ok(self.unix.clone())
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct CommandOutput {
    pub success: bool,
    pub status_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Error)]
pub enum CommandError {
    #[error("command '{command_id}' is not supported on this platform")]
    UnsupportedPlatform { command_id: &'static str },
    #[error("command '{command_id}' is not authorized: {reason}")]
    Unauthorized {
        command_id: &'static str,
        reason: String,
    },
    #[error("failed to spawn command '{command_id}': {source}")]
    LaunchFailure {
        command_id: &'static str,
        #[source]
        source: std::io::Error,
    },
}

pub trait CommandInterceptor: Send + Sync {
    fn before_execute(
        &self,
        _plan: &CommandPlan,
        _native: &NativeCommand,
    ) -> Result<(), CommandError> {
        Ok(())
    }

    fn after_execute(&self, _plan: &CommandPlan, _native: &NativeCommand, _output: &CommandOutput) {
    }
}

#[derive(Default)]
pub struct CommandExecutor {
    interceptors: Vec<Box<dyn CommandInterceptor>>,
}

impl CommandExecutor {
    pub fn new() -> Self {
        Self {
            interceptors: Vec::new(),
        }
    }

    pub fn register(&mut self, interceptor: Box<dyn CommandInterceptor>) {
        self.interceptors.push(interceptor);
    }

    pub fn execute(
        &self,
        plan: &CommandPlan,
    ) -> Result<(CommandOutput, NativeCommand), CommandError> {
        let native = plan.resolve()?;

        for hook in &self.interceptors {
            hook.before_execute(plan, &native)?;
        }
        let mut command = ProcessCommand::new(&native.program);
        command.args(&native.args);
        if let Some(dir) = &native.working_dir {
            command.current_dir(dir);
        }

        let output = command.output().map_err(|e| CommandError::LaunchFailure {
            command_id: plan.id,
            source: e,
        })?;

        let status_code = output.status.code().unwrap_or(-1);
        let cmd_output = CommandOutput {
            success: output.status.success(),
            status_code,
            stdout: String::from_utf8_lossy(&output.stdout)
                .trim_end()
                .to_string(),
            stderr: String::from_utf8_lossy(&output.stderr)
                .trim_end()
                .to_string(),
        };

        for hook in &self.interceptors {
            hook.after_execute(plan, &native, &cmd_output);
        }

        Ok((cmd_output, native))
    }
}
