// Composables 导出
export { useChat } from './composables/useChat'
export { useSettings, DEFAULT_PET_PROMPT, PRESET_BACKGROUNDS } from './composables/useSettings'
export { useP2P } from './composables/useP2P'
export {
  generateOpenAITools,
  generateClaudeTools,
  generateToolUsagePrompt,
} from './composables/useLive2DTools'
export { useChatHistory } from './composables/useChatHistory'
export { useServerDiscovery } from './composables/useServerDiscovery'
export { useWebSocket } from './composables/useWebSocket'
export { useXiaoZhi } from './composables/useXiaoZhi'

// Opus 编解码工具导出
export {
  XiaoZhiOpusDecoder,
  XiaoZhiOpusEncoder,
  createXiaoZhiDecoder,
  createXiaoZhiEncoder,
  XIAOZHI_AUDIO_CONFIG,
} from './utils/opusCodec'

// 类型导出
export type { ChatMessage } from './types'
export type { Live2DTransform } from './composables/useSettings'
export type { WebSocketOptions, WebSocketMessage, WebSocketStatus } from './composables/useWebSocket'
export type { ChatResponse } from './composables/useChat'
export type { ToolCall } from './composables/useLive2DTools'
export type { DiscoveredServer } from './composables/useServerDiscovery'
export type {
  XiaoZhiConfig,
  XiaoZhiOtaResponse,
  XiaoZhiConnectResult,
  XiaoZhiMessage,
  XiaoZhiStatus,
  MCPPayload,
  MCPTool,
  TTSState,
} from './composables/useXiaoZhi'

// 共享类型重新导出
export type {
  PetInfo,
  PetMessage,
  LLMConfig,
} from '@desktopfriends/shared'
// Widget types
export type {
  WidgetType,
  WidgetConfig,
  WidgetSettings,
  ClockWidgetSettings,
  PhotoWidgetSettings,
  WeatherWidgetSettings,
  TodoWidgetSettings,
  PhotoItem,
} from '@desktopfriends/shared'

// Widget 相关 Composable 导出
export { useWidgets } from './composables/useWidgets'
export { useWidgetEvents } from './composables/useWidgetEvents'
