/**
 * @Description LangChain 工具导出
 * 浏览器兼容版本
 */
import type { StructuredToolInterface } from '@langchain/core/tools'

// 统一的工具类型
export type LangChainTool = StructuredToolInterface

// 模型分析器
export {
  parseModelConfig,
  parseModelConfigWithLLM,
  getMotionNames,
  getExpressionNames,
  createEmotionToMotionMap,
  analyzeMotionsWithLLM,
} from './modelAnalyzer'
export type {
  Live2DModelConfig,
  ParsedMotion,
  ParsedExpression,
  ModelAnalysisResult,
  LLMAnalyzerConfig,
} from './modelAnalyzer'

// Live2D 工具
export { createLive2DTools, suggestMotionByEmotion } from './live2d.tools'
export type { Live2DToolCallbacks, CreateLive2DToolsOptions, ExpressionState } from './live2d.tools'

// 小组件工具
export { createWidgetTools } from './widget.tools'

// 认知工具
export { createCognitiveTools } from './cognitive.tools'

// 通信工具
export { createCommunicationTools } from './communication.tools'

// 插件工具适配层
export { createPluginTools } from './plugin.tools'
export type { PluginToolDefinition, PluginManifest, PluginToolExecutor } from './plugin.tools'