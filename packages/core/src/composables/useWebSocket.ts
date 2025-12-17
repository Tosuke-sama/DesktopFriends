import { ref, shallowRef } from 'vue'

export interface WebSocketOptions {
  /** 自动重连 */
  autoReconnect?: boolean
  /** 重连间隔（毫秒） */
  reconnectInterval?: number
  /** 最大重连次数，0 表示无限 */
  maxReconnectAttempts?: number
  /** 心跳间隔（毫秒），0 表示禁用 */
  heartbeatInterval?: number
  /** 心跳消息内容 */
  heartbeatMessage?: string | (() => string)
  /** 连接超时（毫秒） */
  connectionTimeout?: number
  /** 消息序列化方式 */
  serializer?: 'json' | 'text'
}

export interface WebSocketMessage<T = unknown> {
  data: T
  timestamp: number
  raw: string | ArrayBuffer | Blob
}

export type WebSocketStatus = 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED'

const DEFAULT_OPTIONS: Required<WebSocketOptions> = {
  autoReconnect: true,
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
  heartbeatInterval: 30000,
  heartbeatMessage: 'ping',
  connectionTimeout: 10000,
  serializer: 'json',
}

export function useWebSocket<T = unknown>(
  url?: string,
  options: WebSocketOptions = {}
) {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // 状态
  const status = ref<WebSocketStatus>('CLOSED')
  const isConnected = ref(false)
  const error = ref<Error | null>(null)
  const lastMessage = shallowRef<WebSocketMessage<T> | null>(null)

  // WebSocket 实例
  let ws: WebSocket | null = null
  let reconnectCount = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let connectionTimer: ReturnType<typeof setTimeout> | null = null

  // 事件回调
  const messageHandlers: Array<(msg: WebSocketMessage<T>) => void> = []
  const errorHandlers: Array<(err: Error) => void> = []
  const openHandlers: Array<() => void> = []
  const closeHandlers: Array<(code: number, reason: string) => void> = []

  /**
   * 连接 WebSocket
   */
  const connect = (newUrl?: string) => {
    const targetUrl = newUrl || url
    if (!targetUrl) {
      error.value = new Error('WebSocket URL is required')
      return
    }

    // 清理旧连接
    close()

    status.value = 'CONNECTING'
    error.value = null

    try {
      ws = new WebSocket(targetUrl)

      // 连接超时
      connectionTimer = setTimeout(() => {
        if (status.value === 'CONNECTING') {
          error.value = new Error('Connection timeout')
          ws?.close()
        }
      }, opts.connectionTimeout)

      ws.onopen = () => {
        clearTimeout(connectionTimer!)
        status.value = 'OPEN'
        isConnected.value = true
        reconnectCount = 0
        error.value = null

        // 启动心跳
        startHeartbeat()

        // 触发回调
        openHandlers.forEach((handler) => handler())
      }

      ws.onmessage = (event) => {
        const message = parseMessage(event.data)
        lastMessage.value = message

        // 触发回调
        messageHandlers.forEach((handler) => handler(message))
      }

      ws.onerror = (event) => {
        const err = new Error('WebSocket error')
        error.value = err
        errorHandlers.forEach((handler) => handler(err))
      }

      ws.onclose = (event) => {
        clearTimeout(connectionTimer!)
        stopHeartbeat()
        status.value = 'CLOSED'
        isConnected.value = false

        // 触发回调
        closeHandlers.forEach((handler) => handler(event.code, event.reason))

        // 自动重连
        if (opts.autoReconnect && event.code !== 1000) {
          scheduleReconnect(targetUrl)
        }
      }
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
      status.value = 'CLOSED'
    }
  }

  /**
   * 关闭连接
   */
  const close = (code = 1000, reason = 'Normal closure') => {
    // 清理定时器
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (connectionTimer) {
      clearTimeout(connectionTimer)
      connectionTimer = null
    }
    stopHeartbeat()

    // 关闭连接
    if (ws) {
      status.value = 'CLOSING'
      ws.close(code, reason)
      ws = null
    }

    reconnectCount = 0
  }

  /**
   * 发送消息
   */
  const send = (data: T | string): boolean => {
    if (!ws || status.value !== 'OPEN') {
      console.warn('WebSocket is not connected')
      return false
    }

    try {
      const message =
        typeof data === 'string'
          ? data
          : opts.serializer === 'json'
            ? JSON.stringify(data)
            : String(data)

      ws.send(message)
      return true
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
      return false
    }
  }

  /**
   * 发送二进制数据
   */
  const sendBinary = (data: ArrayBuffer | Blob): boolean => {
    if (!ws || status.value !== 'OPEN') {
      console.warn('WebSocket is not connected')
      return false
    }

    try {
      ws.send(data)
      return true
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
      return false
    }
  }

  /**
   * 解析消息
   */
  const parseMessage = (data: string | ArrayBuffer | Blob): WebSocketMessage<T> => {
    let parsed: T

    if (typeof data === 'string') {
      if (opts.serializer === 'json') {
        try {
          parsed = JSON.parse(data)
        } catch {
          parsed = data as unknown as T
        }
      } else {
        parsed = data as unknown as T
      }
    } else {
      parsed = data as unknown as T
    }

    return {
      data: parsed,
      timestamp: Date.now(),
      raw: data,
    }
  }

  /**
   * 调度重连
   */
  const scheduleReconnect = (targetUrl: string) => {
    if (opts.maxReconnectAttempts > 0 && reconnectCount >= opts.maxReconnectAttempts) {
      error.value = new Error(`Max reconnect attempts (${opts.maxReconnectAttempts}) reached`)
      return
    }

    reconnectCount++
    console.log(`WebSocket reconnecting... (${reconnectCount}/${opts.maxReconnectAttempts || '∞'})`)

    reconnectTimer = setTimeout(() => {
      connect(targetUrl)
    }, opts.reconnectInterval)
  }

  /**
   * 启动心跳
   */
  const startHeartbeat = () => {
    if (opts.heartbeatInterval <= 0) return

    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (status.value === 'OPEN') {
        const message =
          typeof opts.heartbeatMessage === 'function'
            ? opts.heartbeatMessage()
            : opts.heartbeatMessage
        send(message as T)
      }
    }, opts.heartbeatInterval)
  }

  /**
   * 停止心跳
   */
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  /**
   * 注册消息处理器
   */
  const onMessage = (handler: (msg: WebSocketMessage<T>) => void) => {
    messageHandlers.push(handler)
    return () => {
      const index = messageHandlers.indexOf(handler)
      if (index > -1) messageHandlers.splice(index, 1)
    }
  }

  /**
   * 注册错误处理器
   */
  const onError = (handler: (err: Error) => void) => {
    errorHandlers.push(handler)
    return () => {
      const index = errorHandlers.indexOf(handler)
      if (index > -1) errorHandlers.splice(index, 1)
    }
  }

  /**
   * 注册连接成功处理器
   */
  const onOpen = (handler: () => void) => {
    openHandlers.push(handler)
    return () => {
      const index = openHandlers.indexOf(handler)
      if (index > -1) openHandlers.splice(index, 1)
    }
  }

  /**
   * 注册连接关闭处理器
   */
  const onClose = (handler: (code: number, reason: string) => void) => {
    closeHandlers.push(handler)
    return () => {
      const index = closeHandlers.indexOf(handler)
      if (index > -1) closeHandlers.splice(index, 1)
    }
  }

  return {
    // 状态
    status,
    isConnected,
    error,
    lastMessage,

    // 方法
    connect,
    close,
    send,
    sendBinary,

    // 事件注册
    onMessage,
    onError,
    onOpen,
    onClose,
  }
}
