/**
 * OpenClaw LAN Bridge - 可测试的应用创建模块
 * 
 * @author 维莉安 (Vilian) 🧠 | 中央大脑左脑模块
 * @version 1.0
 * @date 2026-03-05
 */

import Fastify from 'fastify'
import cors from '@fastify/cors'
import { setupSocketHandlers } from './socket.js'
import { publishService, unpublishService, getLocalIP } from './mdns.js'
import { createAuthMiddleware, sessionRegistry } from './auth.js'
import { initDatabase, getDatabase, closeDatabase } from './database.js'
import type { PetInfo, ServerToClientEvents, ClientToServerEvents } from '@desktopfriends/shared'

const DEFAULT_PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'

/**
 * 创建 OpenClaw LAN Bridge 应用实例（用于测试）
 */
export async function createApp() {
  // 创建 Fastify 实例
  const fastify = Fastify({
    logger: false, // 测试时禁用日志
  })

  // 注册 CORS
  await fastify.register(cors, {
    origin: true,
  })

  // 动态导入 Socket.io 避免 vitest ESM 问题
  const { Server: SocketIOServer } = await import('socket.io')
  
  // 创建 Socket.io 服务器
  const socketIo = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(fastify.server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  })

  // 添加 OpenClaw 认证中间件
  socketIo.use(createAuthMiddleware())

  // 存储在线宠物
  const onlinePets = new Map<string, PetInfo>()

  // 设置 Socket 处理器
  setupSocketHandlers(socketIo, onlinePets)

  // 健康检查接口
  fastify.get('/health', async () => {
    return { 
      status: 'ok', 
      pets: onlinePets.size,
      sessions: sessionRegistry.size,
      uptime: process.uptime()
    }
  })

  // 服务器信息接口
  fastify.get('/info', async () => {
    return {
      ip: getLocalIP(),
      port: DEFAULT_PORT,
      version: '1.0.0',
      protocol: 'OpenClaw LAN Bridge v1.0',
      capabilities: ['oc:send', 'oc:broadcast', 'oc:heartbeat', 'oc:subscribe', 'offline-queue', 'persistence'],
    }
  })

  // 初始化数据库（如果启用）
  if (process.env.DISABLE_DB !== 'true') {
    try {
      initDatabase()
    } catch (err) {
      fastify.log.warn('Database initialization failed, running without persistence')
    }
  }

  // 添加关闭方法
  (fastify as any).socketIo = socketIo
  (fastify as any).onlinePets = onlinePets

  return fastify
}

/**
 * 启动应用（用于生产环境）
 */
export async function startApp() {
  const fastify = await createApp()
  
  try {
    // 发布 mDNS 服务
    const actualPort = await tryListen(DEFAULT_PORT)
    
    console.log(`🚀 OpenClaw LAN Bridge running at http://${HOST}:${actualPort}`)
    console.log(`📡 Socket.io ready for connections`)
    console.log(`🔐 OpenClaw authentication enabled`)
    console.log(`🔍 mDNS service discovery active (_openclaw-bridge._tcp)`)

    publishService(actualPort, undefined, {
      serviceType: 'openclaw-bridge',
      metadata: {
        version: '1.0.0',
        protocolVersion: '1.0',
        capabilities: ['oc:send', 'oc:broadcast', 'oc:heartbeat', 'oc:subscribe', 'offline-queue', 'persistence'],
      },
    })

    return { fastify, port: actualPort }
  } catch (err) {
    fastify.log.error(err)
    throw err
  }
}

/**
 * 尝试监听端口，如果被占用则尝试下一个端口
 */
async function tryListen(port: number, attempt = 1): Promise<number> {
  const fastify = (await createApp()) as any
  
  try {
    await fastify.listen({ port, host: HOST })
    await fastify.close()
    return port
  } catch (err: any) {
    if (err.code === 'EADDRINUSE' && attempt < 10) {
      console.log(`⚠️ 端口 ${port} 被占用，尝试端口 ${port + 1}...`)
      return tryListen(port + 1, attempt + 1)
    }
    throw err
  }
}

/**
 * 优雅关闭应用
 */
export async function shutdownApp(fastify: any) {
  try {
    // 取消 mDNS 服务发布
    unpublishService()

    // 关闭数据库连接
    try {
      closeDatabase()
    } catch (e) {
      // 数据库可能未初始化
    }

    // 关闭 Socket.io
    if (fastify.socketIo) {
      fastify.socketIo.close()
    }

    // 关闭 Fastify 服务器
    await fastify.close()
  } catch (err) {
    console.error('Error during shutdown:', err)
  }
}
