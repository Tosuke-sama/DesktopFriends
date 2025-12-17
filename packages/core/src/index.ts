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

// 类型导出
export type { ChatMessage } from './types'
export type { Live2DTransform } from './composables/useSettings'
export type { WebSocketOptions, WebSocketMessage, WebSocketStatus } from './composables/useWebSocket'
export type { ChatResponse } from './composables/useChat'
export type { ToolCall } from './composables/useLive2DTools'
export type { DiscoveredServer } from './composables/useServerDiscovery'

// 共享类型重新导出
export type {
  PetInfo,
  PetMessage,
  LLMConfig,
} from '@desktopfriends/shared'
