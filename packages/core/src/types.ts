/**
 * 聊天消息类型
 */
export interface ChatMessage {
  id: string
  speaker: 'user' | 'pet' | 'other'
  name: string
  content: string
  timestamp: number
  avatar?: string
}
