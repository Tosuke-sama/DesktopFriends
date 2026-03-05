import type { Server, Socket } from 'socket.io'
import type {
  PetInfo,
  PetMessage,
  PetAction,
  ServerToClientEvents,
  ClientToServerEvents,
  OpenClawMessage,
} from '@desktopfriends/shared'
import { sessionRegistry } from './auth.js'
import { getDatabase } from './database.js'
import { randomUUID } from 'crypto'

/**
 * 离线消息队列限制
 */
const OFFLINE_QUEUE_LIMIT = 100 // 每个会话最多缓存 100 条消息
const DEFAULT_TTL = 300 // 默认 5 分钟过期

/**
 * 验证 OpenClaw 消息格式
 */
function validateOpenClawMessage(msg: Partial<OpenClawMessage>): boolean {
  if (!msg.sessionKey) return false
  if (!msg.content) return false
  if (!msg.type) return false
  if (!['text', 'command', 'status', 'heartbeat'].includes(msg.type)) return false
  return true
}

/**
 * 将消息加入离线队列（持久化到数据库）
 */
function queueOfflineMessage(msg: OpenClawMessage) {
  const targetSession = msg.targetSession || msg.sessionKey
  const db = getDatabase()
  
  // 检查 TTL，过期的消息不加入队列
  const ttl = msg.ttl ?? DEFAULT_TTL
  const expiresAt = msg.timestamp + (ttl * 1000)
  if (expiresAt < Date.now()) {
    console.log(`⏰ Message expired: ${msg.messageId}`)
    return
  }
  
  // 检查队列大小限制
  const pendingCount = db.getPendingCount(targetSession)
  if (pendingCount >= OFFLINE_QUEUE_LIMIT) {
    // 移除最旧的消息（数据库会自动处理，这里只记录日志）
    console.log(`⚠️ Queue limit reached for ${targetSession}, oldest messages will be cleaned`)
  }
  
  // 持久化到数据库
  db.queueMessage({
    messageId: msg.messageId,
    sessionKey: targetSession,
    sourceSession: msg.sourceSession,
    type: msg.type,
    content: msg.content,
    metadata: msg.metadata,
    ttl,
    timestamp: msg.timestamp,
  })
}

/**
 * 推送离线消息给刚上线的会话（从数据库读取）
 */
function flushOfflineMessages(sessionKey: string, socket: Socket) {
  const db = getDatabase()
  const messages = db.getPendingMessages(sessionKey)
  
  if (messages.length === 0) return
  
  console.log(`📤 Flushing ${messages.length} offline messages for ${sessionKey}`)
  
  const deliveredIds: string[] = []
  
  for (const msg of messages) {
    // 再次检查 TTL
    const expiresAt = msg.timestamp + (msg.ttl * 1000)
    if (expiresAt >= Date.now()) {
      socket.emit('oc:message', {
        messageId: msg.messageId,
        timestamp: msg.timestamp,
        sessionKey: msg.sessionKey,
        sourceSession: msg.sourceSession,
        type: msg.type,
        content: msg.content,
        metadata: msg.metadata,
        ttl: msg.ttl,
      })
      deliveredIds.push(msg.messageId)
    }
  }
  
  // 批量标记为已投递
  if (deliveredIds.length > 0) {
    db.markBatchAsDelivered(deliveredIds)
  }
}

export function setupSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  onlinePets: Map<string, PetInfo>
) {
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    // 记录连接信息（包括认证信息）
    const sessionKey = socket.data.sessionKey || 'anonymous'
    const authenticated = socket.data.authenticated || false
    const connectedAt = socket.data.connectedAt || new Date().toISOString()
    
    console.log(`🐾 Connection: ${socket.id} | sessionKey=${sessionKey} | auth=${authenticated}`)

    // 注册 OpenClaw 会话
    if (authenticated && sessionKey) {
      sessionRegistry.register(sessionKey, socket.id)
      console.log('')
      console.log('╔════════════════════════════════════════════════════════╗')
      console.log('║                  🟢 新会话连接 🟢                      ║')
      console.log('╚════════════════════════════════════════════════════════╝')
      console.log(`   Socket ID: ${socket.id}`)
      console.log(`   SessionKey: ${sessionKey}`)
      console.log(`   认证状态：${authenticated ? '✅ 已认证' : '❌ 未认证'}`)
      console.log(`   连接时间：${connectedAt}`)
      console.log('')
    }

    // 宠物注册
    socket.on('pet:register', (info: Omit<PetInfo, 'id' | 'joinedAt'>) => {
      const petInfo: PetInfo = {
        ...info,
        id: socket.id,
        joinedAt: new Date().toISOString(),
      }
      onlinePets.set(socket.id, petInfo)

      // 通知所有人新宠物上线
      io.emit('pet:online', petInfo)

      // 发送当前在线宠物列表给新加入的宠物
      socket.emit('pets:list', Array.from(onlinePets.values()))

      console.log(`✅ Pet registered: ${info.name} (${socket.id})`)
    })

    // 宠物间消息
    socket.on('pet:message', (message: Pick<PetMessage, 'content' | 'to' | 'toName' | 'messageType'>) => {
      const sender = onlinePets.get(socket.id)
      if (!sender) return

      // 获取目标宠物名称
      let toName = message.toName
      if (message.to && !toName) {
        const targetPet = onlinePets.get(message.to)
        if (targetPet) {
          toName = targetPet.name
        }
      }

      const baseMessage: PetMessage = {
        content: message.content,
        to: message.to,
        toName,
        messageType: message.messageType,
        from: sender.name,
        fromId: socket.id,
        timestamp: new Date().toISOString(),
      }

      // 发送给目标宠物（只收到原始消息内容）
      // 添加 isDirectTarget 标记，让客户端知道自己是直接目标
      if (message.to) {
        const targetSocket = io.sockets.sockets.get(message.to)
        if (targetSocket) {
          targetSocket.emit('pet:message', {
            ...baseMessage,
            isDirectTarget: true,  // 标记为直接目标
          })
        }
      }

      // 广播给其他宠物（不包括发送者和目标）
      // 其他宠物收到的消息不带 isDirectTarget 标记
      for (const [socketId, pet] of onlinePets) {
        // 跳过发送者
        if (socketId === socket.id) continue
        // 跳过目标（已单独发送）
        if (message.to && socketId === message.to) continue

        const otherSocket = io.sockets.sockets.get(socketId)
        if (otherSocket) {
          otherSocket.emit('pet:message', {
            ...baseMessage,
            isDirectTarget: false,  // 标记为非直接目标（旁观者）
          })
        }
      }

      console.log(`💬 ${sender.name}: ${message.content}`)
    })

    // 宠物动作同步（可选）
    socket.on('pet:action', (action: Omit<PetAction, 'petId' | 'petName'>) => {
      const sender = onlinePets.get(socket.id)
      if (!sender) return

      // 广播动作给其他宠物
      socket.broadcast.emit('pet:action', {
        ...action,
        petId: socket.id,
        petName: sender.name,
      })
    })

    // OpenClaw 心跳
    socket.on('oc:heartbeat', () => {
      const sessionKey = socket.data.sessionKey
      if (sessionKey) {
        sessionRegistry.heartbeat(sessionKey)
        socket.emit('oc:heartbeat:ack', { timestamp: Date.now() })
      }
    })

    // OpenClaw 单播消息
    socket.on('oc:send', (msg: Omit<OpenClawMessage, 'messageId' | 'timestamp' | 'sourceSession'>) => {
      if (!authenticated) {
        socket.emit('oc:error', { code: 'AUTH_FAILED', message: 'Authentication required' })
        return
      }

      // 验证消息格式
      const fullMsg: OpenClawMessage = {
        ...msg,
        messageId: randomUUID(),
        timestamp: Date.now(),
        sourceSession: sessionKey,
      }

      if (!validateOpenClawMessage(fullMsg)) {
        socket.emit('oc:error', { code: 'INVALID_MESSAGE', message: 'Invalid message format' })
        return
      }

      const targetSession = msg.targetSession || msg.sessionKey
      const targetSocketId = sessionRegistry.getSessionSocket(targetSession)

      if (targetSocketId) {
        const targetSocket = io.sockets.sockets.get(targetSocketId)
        if (targetSocket) {
          targetSocket.emit('oc:message', fullMsg)
          console.log('')
          console.log('╔════════════════════════════════════════════════════════╗')
          console.log('║              📤 消息路由 - 单播消息 📤                 ║')
          console.log('╚════════════════════════════════════════════════════════╝')
          console.log(`   发送者：${sessionKey}`)
          console.log(`   接收者：${targetSession}`)
          console.log(`   消息 ID: ${fullMsg.messageId}`)
          console.log(`   类型：${fullMsg.type}`)
          console.log(`   内容：${fullMsg.content}`)
          console.log(`   时间：${new Date(fullMsg.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
          console.log('   状态：✅ 已送达')
          console.log('')
          // 发送确认给发送者
          socket.emit('oc:ack', { messageId: fullMsg.messageId, status: 'delivered' })
          return
        }
      }

      // 目标不在线，加入离线队列
      queueOfflineMessage(fullMsg)
      console.log('')
      console.log('╔════════════════════════════════════════════════════════╗')
      console.log('║              📤 消息路由 - 离线消息 📤                 ║')
      console.log('╚════════════════════════════════════════════════════════╝')
      console.log(`   发送者：${sessionKey}`)
      console.log(`   接收者：${targetSession} (离线)`);
      console.log(`   消息 ID: ${fullMsg.messageId}`)
      console.log(`   类型：${fullMsg.type}`)
      console.log(`   内容：${fullMsg.content}`)
      console.log(`   时间：${new Date(fullMsg.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
      console.log('   状态：📭 已加入离线队列')
      console.log('')
      socket.emit('oc:ack', { messageId: fullMsg.messageId, status: 'queued' })
    })

    // OpenClaw 广播消息
    socket.on('oc:broadcast', (msg: Omit<OpenClawMessage, 'messageId' | 'timestamp' | 'sourceSession' | 'targetSession'>) => {
      if (!authenticated) {
        socket.emit('oc:error', { code: 'AUTH_FAILED', message: 'Authentication required' })
        return
      }

      const fullMsg: OpenClawMessage = {
        ...msg,
        messageId: randomUUID(),
        timestamp: Date.now(),
        sourceSession: sessionKey,
        broadcast: true,
      }

      if (!validateOpenClawMessage(fullMsg)) {
        socket.emit('oc:error', { code: 'INVALID_MESSAGE', message: 'Invalid message format' })
        return
      }

      // 广播给所有在线会话（除了发送者）
      let deliveredCount = 0
      sessionRegistry.forEachSession((sk, socketId) => {
        if (sk === sessionKey) return // 跳过发送者
        
        const targetSocket = io.sockets.sockets.get(socketId)
        if (targetSocket) {
          targetSocket.emit('oc:message', fullMsg)
          deliveredCount++
        }
      })

      console.log('')
      console.log('╔════════════════════════════════════════════════════════╗')
      console.log('║              📤 消息路由 - 广播消息 📤                 ║')
      console.log('╚════════════════════════════════════════════════════════╝')
      console.log(`   发送者：${sessionKey}`)
      console.log(`   消息 ID: ${fullMsg.messageId}`)
      console.log(`   类型：${fullMsg.type}`)
      console.log(`   内容：${fullMsg.content}`)
      console.log(`   时间：${new Date(fullMsg.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
      console.log(`   送达：${deliveredCount} 个会话`)
      console.log('   状态：📢 广播完成')
      console.log('')
      socket.emit('oc:ack', { messageId: fullMsg.messageId, status: 'broadcast', deliveredCount })
    })

    // OpenClaw 订阅/取消订阅（用于群组消息）
    socket.on('oc:subscribe', (channel: string) => {
      if (!authenticated) return
      
      socket.join(`channel:${channel}`)
      console.log(`📌 ${sessionKey} subscribed to channel: ${channel}`)
    })

    socket.on('oc:unsubscribe', (channel: string) => {
      if (!authenticated) return
      
      socket.leave(`channel:${channel}`)
      console.log(`📍 ${sessionKey} unsubscribed from channel: ${channel}`)
    })

    // OpenClaw 频道消息
    socket.on('oc:channel', (data: { channel: string; content: string; type?: OpenClawMessage['type'] }) => {
      if (!authenticated) return

      const fullMsg: OpenClawMessage = {
        messageId: randomUUID(),
        timestamp: Date.now(),
        sessionKey: `channel:${data.channel}`,
        sourceSession: sessionKey,
        type: data.type || 'text',
        content: data.content,
        metadata: { channel: data.channel },
      }

      // 发送给频道内的所有客户端
      io.to(`channel:${data.channel}`).emit('oc:message', fullMsg)
      console.log(`📣 Channel message to ${data.channel} from ${sessionKey}: ${fullMsg.messageId}`)
    })

    // 断开连接（带原因）
    socket.on('disconnect', (reason) => {
      const pet = onlinePets.get(socket.id)
      if (pet) {
        onlinePets.delete(socket.id)
        io.emit('pet:offline', socket.id)
        console.log(`👋 Pet disconnected: ${pet.name} (${socket.id}) | reason=${reason}`)
      }
      
      // 注销 OpenClaw 会话
      const sessionKey = socket.data.sessionKey
      if (sessionKey) {
        console.log('')
        console.log('╔════════════════════════════════════════════════════════╗')
        console.log('║                  🔴 会话断开 🔴                        ║')
        console.log('╚════════════════════════════════════════════════════════╝')
        console.log(`   Socket ID: ${socket.id}`)
        console.log(`   SessionKey: ${sessionKey}`)
        console.log(`   断开原因：${reason}`)
        console.log(`   断开时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
        console.log('')
        sessionRegistry.unregister(sessionKey)
      }
    })
  })
}
