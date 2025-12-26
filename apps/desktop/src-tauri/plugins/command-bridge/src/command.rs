use serde::Serialize;
use std::path::PathBuf;
use std::process::Command as ProcessCommand;
use thiserror::Error;

/// 具体到某个平台的可执行命令及其参数/工作目录。
#[derive(Clone, Debug)]
pub struct NativeCommand {
    pub program: String,
    pub args: Vec<String>,
    pub working_dir: Option<PathBuf>,
}

impl NativeCommand {
    /// 创建一个新的原生命令（不包含任何参数）。
    ///
    /// 参数 `program` 是要调用的可执行程序名称或路径。
    pub fn new(program: impl Into<String>) -> Self {
        Self {
            program: program.into(),
            args: Vec::new(),
            working_dir: None,
        }
    }

    /// 追加一组命令行参数，返回自身以便链式调用。
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

    /// 设置命令的工作目录，返回自身以便链式调用。
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
    /// 创建一个跨平台命令计划，指定通用 `id/显示名/说明` 与 Unix 实现。
    /// 如需 Windows 实现，可继续调用 [`with_windows`] 指定。
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

    /// 为命令计划提供 Windows 下的实现。
    pub fn with_windows(mut self, windows: NativeCommand) -> Self {
        self.windows = Some(windows);
        self
    }

    /// 按当前平台解析出最终要执行的原生命令。
    /// 在 Windows 上优先使用 `windows`，否则回退到 `unix` 实现。
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
    /// 在命令启动前拦截，可执行安全校验或审计。
    /// 返回 `Err` 可中止命令执行。
    fn before_execute(
        &self,
        _plan: &CommandPlan,
        _native: &NativeCommand,
    ) -> Result<(), CommandError> {
        Ok(())
    }

    /// 在命令结束后拦截，可执行日志记录或统计。
    fn after_execute(&self, _plan: &CommandPlan, _native: &NativeCommand, _output: &CommandOutput) {
    }
}

#[derive(Default)]
pub struct CommandExecutor {
    interceptors: Vec<Box<dyn CommandInterceptor>>,
}

impl CommandExecutor {
    /// 创建一个新的命令执行器。
    pub fn new() -> Self {
        Self {
            interceptors: Vec::new(),
        }
    }

    /// 注册一个拦截器，按注册顺序依次调用。
    pub fn register(&mut self, interceptor: Box<dyn CommandInterceptor>) {
        self.interceptors.push(interceptor);
    }

    /// 执行给定的命令计划：
    /// 1) 解析平台命令；2) 运行 `before_execute`；3) 启动并收集输出；
    /// 4) 调用 `after_execute`；5) 返回标准输出结果与实际命令。
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
