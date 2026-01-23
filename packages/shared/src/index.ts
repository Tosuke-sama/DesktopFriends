


/**
 * 宠物信息
 */
export interface PetInfo {
  id: string
  name: string
  avatar?: string
  modelPath?: string
  joinedAt?: string
}

/**
 * 宠物间的消息
 */
export interface PetMessage {
  from: string       // 发送者名称（宠物名）
  fromId: string     // 发送者 ID
  to?: string        // 目标 ID，为空则广播
  toName?: string    // 目标名称（宠物名）
  content: string
  timestamp: string
  type?: 'text' | 'action' | 'emotion'
  /**
   * 消息类型说明:
   * - master_to_pet: 主人对自己的宠物说话（聊天）
   * - pet_to_pet: 宠物对另一个宠物说话（打招呼/自动回复）
   */
  messageType?: 'master_to_pet' | 'pet_to_pet'
  /**
   * 是否是直接目标（接收者是消息的直接对象）
   * - true: 接收者是消息的直接目标，只显示原始内容
   * - false: 接收者是旁观者，显示格式化内容 [发送者] 对 [目标] 说: 内容
   */
  isDirectTarget?: boolean
}

/**
 * 宠物动作
 */
export interface PetAction {
  petId: string
  petName: string
  type: 'motion' | 'expression'
  name: string
}

/**
 * 对话消息 (与大模型交互)
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * LLM 配置
 */
export interface LLMConfig {
  provider: 'openai' | 'claude' | 'deepseek' | 'custom'
  apiKey: string
  baseUrl?: string
  model?: string
}

/**
 * Socket.io 事件类型定义
 */
export interface ServerToClientEvents {
  'pet:online': (pet: PetInfo) => void
  'pet:offline': (petId: string) => void
  'pet:message': (message: PetMessage) => void
  'pet:action': (action: PetAction) => void
  'pets:list': (pets: PetInfo[]) => void
}

export interface ClientToServerEvents {
  'pet:register': (info: Omit<PetInfo, 'id' | 'joinedAt'>) => void
  'pet:message': (message: Pick<PetMessage, 'content' | 'to' | 'toName' | 'messageType'>) => void
  'pet:action': (action: Omit<PetAction, 'petId' | 'petName'>) => void
}

// Widget types
export * from './widget'
