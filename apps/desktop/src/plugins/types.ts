/**
 * 插件系统类型定义
 */

/** UI 显示位置 */
export type UIPosition = 'sidebar' | 'toolbar' | 'floating'

/** 插件窗口配置 */
export interface PluginWindow {
  /** 窗口 HTML 路径（相对于插件目录） */
  path: string
  /** 窗口标题 */
  title: string
  /** 窗口宽度 */
  width?: number
  /** 窗口高度 */
  height?: number
}

/** 插件 UI 配置 */
export interface PluginUI {
  /** UI 面板路径（相对于插件目录） */
  panel?: string
  /** UI 位置 */
  position?: UIPosition
  /** 插件窗口配置 */
  windows?: Record<string, PluginWindow>
}

/** 插件信息 */
export interface PluginInfo {
  /** 插件 ID */
  id: string
  /** 插件名称 */
  name: string
  /** 版本号 */
  version: string
  /** 作者 */
  author: string
  /** 描述 */
  description: string
  /** 是否已启用 */
  enabled: boolean
  /** UI 配置 */
  ui?: PluginUI
  /** 插件目录 */
  dir: string
  /** README 文件路径（相对于插件目录） */
  readme?: string
}

/** LLM 工具定义 */
export interface ToolDefinition {
  /** 工具所属插件 ID */
  pluginId: string
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 参数 JSON Schema */
  parameters: Record<string, unknown>
}

/** 工具调用 */
export interface ToolCall {
  /** 工具名称 */
  name: string
  /** 工具参数 */
  arguments: Record<string, unknown>
}

/** 工具调用结果 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean
  /** 返回数据 */
  data: unknown
  /** 错误信息 */
  error?: string
}

/** 钩子响应 */
export interface HookResult {
  /** 来源插件 ID */
  pluginId: string
  /** 响应数据 */
  data: unknown
}
