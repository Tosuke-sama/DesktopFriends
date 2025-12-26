use std::path::PathBuf;

use crate::command::{CommandPlan, NativeCommand};

use super::base::CommandSpec;

pub struct LsCommand {
    target_dir: PathBuf,
    include_hidden: bool,
    requires_approval: bool,
}

impl LsCommand {
    pub fn new(target_dir: PathBuf, include_hidden: bool, requires_approval: bool) -> Self {
        Self {
            target_dir,
            include_hidden,
            requires_approval,
        }
    }
}

impl CommandSpec for LsCommand {
    fn name(&self) -> &'static str {
        "ls"
    }

    fn display_name(&self) -> &'static str {
        "List directory"
    }

    fn description(&self) -> String {
        format!(
            "List directory {}{}",
            self.target_dir.display(),
            if self.include_hidden {
                " (include hidden)"
            } else {
                ""
            }
        )
    }

    fn requires_approval(&self) -> bool {
        self.requires_approval
    }

    fn build_plan(&self) -> CommandPlan {
        let mut unix_args = vec!["-1".to_string()];
        if self.include_hidden {
            unix_args.insert(0, "-a".to_string());
        }

        let unix = NativeCommand::new("ls")
            .with_args(unix_args)
            .working_dir(self.target_dir.clone());

        let mut windows_args = vec!["/C".to_string(), "dir".to_string(), "/b".to_string()];
        if self.include_hidden {
            windows_args.push("/a".to_string());
        }
        let windows = NativeCommand::new("cmd")
            .with_args(windows_args)
            .working_dir(self.target_dir.clone());

        CommandPlan::new(self.name(), self.display_name(), self.description(), unix)
            .with_windows(windows)
    }
}
