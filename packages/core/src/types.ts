/**
 * 聊天消息类型
 */
export interface ChatMessage {
  id: string
  speaker: 'user' | 'pet' | 'other' | 'thinking'
  name: string
  content: string
  timestamp: number
  avatar?: string
}
