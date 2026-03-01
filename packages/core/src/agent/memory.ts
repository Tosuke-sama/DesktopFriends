/**
 * @Description Agent 记忆管理模块
 * 使用简单消息对象，不依赖 LangChain
 */
import type { ChatMessage } from '@desktopfriends/shared'

/** Agent 内部使用的消息格式 */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/**
 * 创建 Agent 记忆管理器
 * 使用简单数组管理消息历史，支持 localStorage 持久化
 */
export function createAgentMemory(options?: {
  maxMessages?: number
  persistKey?: string
}) {
  const { maxMessages = 50, persistKey } = options || {}

  let messageHistory: AgentMessage[] = []

  // 从 localStorage 恢复
  if (persistKey && typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(persistKey)
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[]
        initFromChatMessages(parsed)
      }
    } catch {
      // 忽略解析错误
    }
  }

  const persist = () => {
    if (persistKey && typeof localStorage !== 'undefined') {
      const chatMessages = toChatMessages()
      localStorage.setItem(persistKey, JSON.stringify(chatMessages))
    }
  }

  function initFromChatMessages(messages: ChatMessage[]) {
    messageHistory = []
    const recentMessages = messages.slice(-maxMessages)
    for (const msg of recentMessages) {
      if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') {
        messageHistory.push({ role: msg.role, content: msg.content })
      }
    }
  }

  const initFromHistory = (messages: ChatMessage[]) => {
    initFromChatMessages(messages)
    persist()
  }

  const addUserMessage = (content: string) => {
    messageHistory.push({ role: 'user', content })
    trimHistory()
    persist()
  }

  const addAIMessage = (content: string) => {
    messageHistory.push({ role: 'assistant', content })
    trimHistory()
    persist()
  }

  const addSystemMessage = (content: string) => {
    messageHistory.push({ role: 'system', content })
    trimHistory()
    persist()
  }

  const trimHistory = () => {
    if (messageHistory.length > maxMessages) {
      messageHistory = messageHistory.slice(-maxMessages)
    }
  }

  const clearHistory = () => {
    messageHistory = []
    if (persistKey && typeof localStorage !== 'undefined') {
      localStorage.removeItem(persistKey)
    }
  }

  /** 获取消息列表（简单对象格式） */
  const getMessages = (): AgentMessage[] => {
    return [...messageHistory]
  }

  /** 转换为 ChatMessage 格式 */
  const toChatMessages = (): ChatMessage[] => {
    return messageHistory
      .filter(msg => msg.role !== 'tool')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      }))
  }

  return {
    initFromHistory,
    addUserMessage,
    addAIMessage,
    addSystemMessage,
    clearHistory,
    getMessages,
    toChatMessages,
  }
}

/**
 * 生成唯一的会话 ID
 */
export function generateSessionId(): string {
  return `pet-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
