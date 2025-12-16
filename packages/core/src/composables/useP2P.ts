import { ref, computed } from 'vue'
import { io, Socket } from 'socket.io-client'
import type {
  PetInfo,
  PetMessage,
  PetAction,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@desktopfriends/shared'

export interface P2POptions {
  serverUrl?: string
  autoConnect?: boolean
  autoChat?: boolean // 自动回复其他宠物的消息
  onPetMessage?: (message: PetMessage) => void
  onPetAction?: (action: PetAction) => void
  onPetOnline?: (pet: PetInfo) => void
  onPetOffline?: (petId: string) => void
}

// 服务器类型
type ServerType = 'socketio' | 'websocket'

// ============= 全局单例状态 =============
// 这些状态在所有组件间共享，确保状态一致性

let globalSocket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null
let globalWebSocket: WebSocket | null = null
let currentServerType: ServerType = 'socketio'

// 全局响应式状态（所有组件共享）
const globalState = {
  isConnected: ref(false),
  isRegistered: ref(false),
  myPetId: ref<string | null>(null),
  myPetInfo: ref<PetInfo | null>(null),
  onlinePets: ref<PetInfo[]>([]),
  messages: ref<PetMessage[]>([]),
  autoChat: ref(true),
}

// 回调函数存储
let callbacks: {
  onPetMessage?: (message: PetMessage) => void
  onPetAction?: (action: PetAction) => void
  onPetOnline?: (pet: PetInfo) => void
  onPetOffline?: (petId: string) => void
} = {}

// ============= WebSocket 协议处理 =============

// 发送 WebSocket 消息
const wsSend = (event: string, data: any) => {
  if (globalWebSocket?.readyState === WebSocket.OPEN) {
    globalWebSocket.send(JSON.stringify({ event, data }))
  }
}

// 处理 WebSocket 消息
const handleWsMessage = (event: string, data: any) => {
  switch (event) {
    case 'welcome':
      console.log('📡 WebSocket welcome:', data)
      break

    case 'pets:list':
      globalState.onlinePets.value = data || []
      console.log('📋 Online pets:', globalState.onlinePets.value.length)
      break

    case 'pet:online':
      if (!globalState.onlinePets.value.find(p => p.id === data.id)) {
        globalState.onlinePets.value.push(data)
      }
      console.log('🐾 Pet online:', data.name)
      callbacks.onPetOnline?.(data)
      break

    case 'pet:offline':
      const offlinePetId = typeof data === 'string' ? data : data.id
      const pet = globalState.onlinePets.value.find(p => p.id === offlinePetId)
      globalState.onlinePets.value = globalState.onlinePets.value.filter(p => p.id !== offlinePetId)
      console.log('👋 Pet offline:', pet?.name || offlinePetId)
      callbacks.onPetOffline?.(offlinePetId)
      break

    case 'pet:message':
      globalState.messages.value.push(data)
      console.log(`💬 [${data.from}]: ${data.content}`)
      if (data.fromId !== globalState.myPetId.value) {
        callbacks.onPetMessage?.(data)
      }
      break

    case 'pet:action':
      console.log(`🎭 [${data.petName}] ${data.type}: ${data.name}`)
      callbacks.onPetAction?.(data)
      break
  }
}

// ============= Composable =============

export function useP2P(options: P2POptions = {}) {
  // 更新回调（如果提供了新的回调）
  if (options.onPetMessage) callbacks.onPetMessage = options.onPetMessage
  if (options.onPetAction) callbacks.onPetAction = options.onPetAction
  if (options.onPetOnline) callbacks.onPetOnline = options.onPetOnline
  if (options.onPetOffline) callbacks.onPetOffline = options.onPetOffline
  if (options.autoChat !== undefined) globalState.autoChat.value = options.autoChat

  // 其他在线宠物（排除自己）
  const otherPets = computed(() =>
    globalState.onlinePets.value.filter(p => p.id !== globalState.myPetId.value)
  )

  // 创建带超时的 fetch（兼容旧版浏览器）
  const fetchWithTimeout = async (url: string, timeout: number): Promise<Response> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)
      return response
    } catch (e) {
      clearTimeout(timeoutId)
      throw e
    }
  }

  // 检测服务器类型
  const detectServerType = async (url: string): Promise<{ type: ServerType; wsPort?: number }> => {
    try {
      // 尝试获取 /info 端点
      const infoUrl = url.replace(/\/$/, '') + '/info'
      const response = await fetchWithTimeout(infoUrl, 3000)
      if (response.ok) {
        const info = await response.json()
        // 如果返回 wsPort，说明是 Android 原生服务器
        if (info.wsPort) {
          return { type: 'websocket', wsPort: info.wsPort }
        }
      }
    } catch (e) {
      // 获取失败，默认使用 Socket.IO
      console.log('Server detection failed:', e)
    }
    return { type: 'socketio' }
  }

  // 连接服务器
  const connect = async (url: string) => {
    if (globalSocket?.connected || globalWebSocket?.readyState === WebSocket.OPEN) {
      console.log('Already connected, reusing existing connection')
      return
    }

    console.log('Detecting server type for:', url)
    const serverInfo = await detectServerType(url)
    currentServerType = serverInfo.type

    if (currentServerType === 'websocket') {
      // 使用原生 WebSocket 连接 Android 服务器
      const wsPort = serverInfo.wsPort || 3001
      const wsUrl = url.replace(/^http/, 'ws').replace(/:\d+/, `:${wsPort}`)
      console.log('Connecting via WebSocket to:', wsUrl)

      globalWebSocket = new WebSocket(wsUrl)

      globalWebSocket.onopen = () => {
        globalState.isConnected.value = true
        globalState.myPetId.value = `ws_${Date.now()}`
        console.log('✅ WebSocket connected, ID:', globalState.myPetId.value)
      }

      globalWebSocket.onclose = () => {
        globalState.isConnected.value = false
        globalState.isRegistered.value = false
        console.log('❌ WebSocket disconnected')
      }

      globalWebSocket.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      globalWebSocket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          handleWsMessage(msg.event, msg.data)
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e)
        }
      }
    } else {
      // 使用 Socket.IO 连接 Node.js 服务器
      console.log('Connecting via Socket.IO to:', url)
      globalSocket = io(url, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      }) as Socket<ServerToClientEvents, ClientToServerEvents>

      globalSocket.on('connect', () => {
        globalState.isConnected.value = true
        globalState.myPetId.value = globalSocket!.id ?? null
        console.log('✅ Socket.IO connected, ID:', globalState.myPetId.value)
      })

      globalSocket.on('disconnect', () => {
        globalState.isConnected.value = false
        globalState.isRegistered.value = false
        console.log('❌ Socket.IO disconnected')
      })

      globalSocket.on('connect_error', (error) => {
        console.error('Connection error:', error.message)
      })

      globalSocket.on('pets:list', (pets) => {
        globalState.onlinePets.value = pets
        console.log('📋 Online pets:', pets.length)
      })

      globalSocket.on('pet:online', (pet) => {
        if (!globalState.onlinePets.value.find(p => p.id === pet.id)) {
          globalState.onlinePets.value.push(pet)
        }
        console.log('🐾 Pet online:', pet.name)
        callbacks.onPetOnline?.(pet)
      })

      globalSocket.on('pet:offline', (petId) => {
        const pet = globalState.onlinePets.value.find(p => p.id === petId)
        globalState.onlinePets.value = globalState.onlinePets.value.filter((p) => p.id !== petId)
        console.log('👋 Pet offline:', pet?.name || petId)
        callbacks.onPetOffline?.(petId)
      })

      globalSocket.on('pet:message', (message) => {
        globalState.messages.value.push(message)
        console.log(`💬 [${message.from}]: ${message.content}`)
        if (message.fromId !== globalState.myPetId.value) {
          callbacks.onPetMessage?.(message)
        }
      })

      globalSocket.on('pet:action', (action) => {
        console.log(`🎭 [${action.petName}] ${action.type}: ${action.name}`)
        callbacks.onPetAction?.(action)
      })
    }
  }

  // 断开连接
  const disconnect = () => {
    globalSocket?.disconnect()
    globalSocket = null
    globalWebSocket?.close()
    globalWebSocket = null
    globalState.isConnected.value = false
    globalState.isRegistered.value = false
    globalState.myPetId.value = null
    globalState.myPetInfo.value = null
    globalState.onlinePets.value = []
  }

  // 注册宠物
  const register = (petInfo: Omit<PetInfo, 'id' | 'joinedAt'>) => {
    if (!globalState.isConnected.value) {
      console.error('Not connected to server')
      return false
    }

    if (currentServerType === 'websocket') {
      wsSend('pet:register', petInfo)
    } else if (globalSocket?.connected) {
      globalSocket.emit('pet:register', petInfo as PetInfo)
    } else {
      return false
    }

    globalState.myPetInfo.value = { ...petInfo, id: globalState.myPetId.value! } as PetInfo
    globalState.isRegistered.value = true
    console.log('✅ Registered as:', petInfo.name)
    return true
  }

  // 发送消息给其他宠物
  const sendMessage = (
    content: string,
    to?: string,
    options?: {
      toName?: string
      messageType?: 'master_to_pet' | 'pet_to_pet'
    }
  ) => {
    if (!globalState.isConnected.value || !globalState.isRegistered.value) {
      console.error('Not connected or not registered')
      return false
    }

    const messageData = {
      content,
      to,
      toName: options?.toName,
      messageType: options?.messageType,
    }

    if (currentServerType === 'websocket') {
      wsSend('pet:message', messageData)
    } else if (globalSocket?.connected) {
      globalSocket.emit('pet:message', messageData)
    } else {
      return false
    }

    console.log(`📤 Sent message: ${content}`)
    return true
  }

  // 广播动作给其他宠物
  const sendAction = (type: 'motion' | 'expression', name: string) => {
    if (!globalState.isConnected.value || !globalState.isRegistered.value) {
      return false
    }

    if (currentServerType === 'websocket') {
      wsSend('pet:action', { type, name })
    } else if (globalSocket?.connected) {
      globalSocket.emit('pet:action', { type, name })
    } else {
      return false
    }

    return true
  }

  // 设置自动对话回调
  const setMessageCallback = (callback: (message: PetMessage) => void) => {
    callbacks.onPetMessage = callback
  }

  // 清除消息历史
  const clearMessages = () => {
    globalState.messages.value = []
  }

  return {
    // 返回全局状态的引用（所有组件共享同一个 ref）
    isConnected: globalState.isConnected,
    isRegistered: globalState.isRegistered,
    myPetId: globalState.myPetId,
    myPetInfo: globalState.myPetInfo,
    onlinePets: globalState.onlinePets,
    messages: globalState.messages,
    autoChat: globalState.autoChat,
    // computed
    otherPets,
    // methods
    connect,
    disconnect,
    register,
    sendMessage,
    sendAction,
    setMessageCallback,
    clearMessages,
  }
}
