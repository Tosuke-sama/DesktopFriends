/**
 * 聊天历史记录管理
 */
import { ref, computed } from 'vue'
import type { ChatMessage } from '../types'

// 全局单例
const chatHistory = ref<ChatMessage[]>([])
const maxHistoryLength = ref(100) // 最大保存条数

// 生成唯一 ID
const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function useChatHistory() {
  // 添加消息
  const addMessage = (
    speaker: 'user' | 'pet' | 'other',
    name: string,
    content: string,
    avatar?: string
  ) => {
    const message: ChatMessage = {
      id: generateId(),
      speaker,
      name,
      content,
      timestamp: Date.now(),
      avatar,
    }

    chatHistory.value.push(message)

    // 限制最大条数
    if (chatHistory.value.length > maxHistoryLength.value) {
      chatHistory.value = chatHistory.value.slice(-maxHistoryLength.value)
    }

    return message
  }

  // 添加用户消息
  const addUserMessage = (name: string, content: string) => {
    return addMessage('user', name, content)
  }

  // 添加宠物消息
  const addPetMessage = (name: string, content: string) => {
    return addMessage('pet', name, content)
  }

  // 添加其他宠物消息
  const addOtherPetMessage = (name: string, content: string) => {
    return addMessage('other', name, content)
  }

  // 清空历史记录
  const clearHistory = () => {
    chatHistory.value = []
  }

  // 导出为 JSON
  const exportAsJSON = () => {
    const data = {
      exportTime: new Date().toISOString(),
      messageCount: chatHistory.value.length,
      messages: chatHistory.value.map(msg => ({
        speaker: msg.speaker,
        name: msg.name,
        content: msg.content,
        time: new Date(msg.timestamp).toLocaleString(),
      })),
    }
    return JSON.stringify(data, null, 2)
  }

  // 导出为文本
  const exportAsText = () => {
    const lines = [
      `聊天记录导出时间: ${new Date().toLocaleString()}`,
      `共 ${chatHistory.value.length} 条消息`,
      '---',
      '',
    ]

    for (const msg of chatHistory.value) {
      const time = new Date(msg.timestamp).toLocaleTimeString()
      lines.push(`[${time}] ${msg.name}: ${msg.content}`)
    }

    return lines.join('\n')
  }

  // 下载文件
  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 导出聊天记录
  const exportHistory = (format: 'json' | 'text' = 'json') => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

    if (format === 'json') {
      const content = exportAsJSON()
      downloadFile(content, `chat-history-${timestamp}.json`, 'application/json')
    } else {
      const content = exportAsText()
      downloadFile(content, `chat-history-${timestamp}.txt`, 'text/plain')
    }
  }

  // 获取统计信息
  const stats = computed(() => {
    const userCount = chatHistory.value.filter(m => m.speaker === 'user').length
    const petCount = chatHistory.value.filter(m => m.speaker === 'pet').length
    const otherCount = chatHistory.value.filter(m => m.speaker === 'other').length

    return {
      total: chatHistory.value.length,
      userCount,
      petCount,
      otherCount,
    }
  })

  return {
    // 状态
    chatHistory,
    stats,

    // 方法
    addMessage,
    addUserMessage,
    addPetMessage,
    addOtherPetMessage,
    clearHistory,
    exportHistory,
    exportAsJSON,
    exportAsText,
  }
}
