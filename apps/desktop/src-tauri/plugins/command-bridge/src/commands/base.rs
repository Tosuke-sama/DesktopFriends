use crate::command::CommandPlan;

/// 命令基类，封装执行计划与审批需求。
pub trait CommandSpec {
    /// 命令唯一名称（对应系统命令名）。
    fn name(&self) -> &'static str;

    /// 展示用名称。
    fn display_name(&self) -> &'static str;

    /// 描述当前命令的作用。
    fn description(&self) -> String;

    /// 是否需要人工审批。
    fn requires_approval(&self) -> bool {
        true
    }

    /// 构建跨平台命令计划（当前优先支持 macOS/unix）。
    fn build_plan(&self) -> CommandPlan;
}
