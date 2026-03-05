import BonjourService from 'bonjour-service'
import type { Service } from 'bonjour-service'
import os from 'os'
import { sessionRegistry } from './auth.js'

// 处理 ESM/CommonJS 兼容性
const Bonjour = (BonjourService as any).default || BonjourService

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bonjour: any = null
let publishedService: Service | null = null

// RemoteService 类型（bonjour-service 未导出）
interface RemoteService {
  name: string
  host: string
  port: number
  txt?: Record<string, string>
}

/**
 * OpenClaw Bridge 服务元数据
 */
export interface OpenClawBridgeMetadata {
  version: string
  ip: string
  port: number
  hostname: string
  sessions?: number  // 当前活跃会话数
  capabilities?: string[]  // 支持的功能
  protocolVersion?: string  // 协议版本
}

/**
 * 获取本机局域网 IP 地址
 */
export function getLocalIP(): string {
  const interfaces = os.networkInterfaces()

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // 跳过内部地址和 IPv6
      if (iface.internal || iface.family !== 'IPv4') continue
      // 返回第一个找到的局域网 IP
      if (iface.address.startsWith('192.168.') ||
          iface.address.startsWith('10.') ||
          iface.address.startsWith('172.')) {
        return iface.address
      }
    }
  }

  return '127.0.0.1'
}

/**
 * 发布 mDNS 服务
 */
export function publishService(
  port: number,
  name?: string,
  options?: {
    serviceType?: 'desktopfriends' | 'openclaw-bridge'
    metadata?: Partial<OpenClawBridgeMetadata>
  }
): Service | null {
  bonjour = new Bonjour()

  const serviceType = options?.serviceType || 'openclaw-bridge'
  const serviceName = name || `OpenClawBridge-${os.hostname()}`
  const localIP = getLocalIP()
  const sessions = sessionRegistry.getAllSessions().size

  const metadata: OpenClawBridgeMetadata = {
    version: options?.metadata?.version || '1.0',
    ip: localIP,
    port: port,
    hostname: os.hostname(),
    sessions: sessions,
    capabilities: options?.metadata?.capabilities || ['oc:send', 'oc:broadcast', 'oc:heartbeat', 'offline-queue'],
    protocolVersion: options?.metadata?.protocolVersion || '1.0',
  }

  publishedService = bonjour.publish({
    name: serviceName,
    type: serviceType,
    port: port,
    txt: {
      version: metadata.version,
      ip: metadata.ip,
      port: String(metadata.port),
      hostname: metadata.hostname,
      sessions: String(metadata.sessions),
      capabilities: (metadata.capabilities || []).join(','),
      protocolVersion: metadata.protocolVersion || '1.0',
    },
  })

  console.log(`📡 mDNS service published: ${serviceName}._${serviceType}._tcp`)
  console.log(`   Local IP: ${localIP}:${port}`)
  console.log(`   Sessions: ${sessions}`)
  console.log(`   Capabilities: ${(metadata.capabilities || []).join(', ')}`)

  return publishedService
}

/**
 * 发现局域网内的 OpenClaw Bridge 服务
 */
export function discoverServices(
  onFound: (service: { name: string; host: string; port: number; ip?: string; metadata?: OpenClawBridgeMetadata }) => void,
  onRemoved?: (service: { name: string }) => void,
  options?: {
    serviceType?: 'desktopfriends' | 'openclaw-bridge'
  }
): () => void {
  if (!bonjour) {
    bonjour = new Bonjour()
  }

  const serviceType = options?.serviceType || 'openclaw-bridge'
  const browser = bonjour.find({ type: serviceType })

  browser.on('up', (service: RemoteService) => {
    console.log(`🔍 Found service: ${service.name}`)
    
    // 解析元数据
    const metadata: OpenClawBridgeMetadata | undefined = service.txt ? {
      version: service.txt.version || '1.0',
      ip: service.txt.ip || service.host,
      port: parseInt(service.txt.port || String(service.port)),
      hostname: service.txt.hostname || service.name,
      sessions: parseInt(service.txt.sessions || '0'),
      capabilities: service.txt.capabilities?.split(',') || [],
      protocolVersion: service.txt.protocolVersion || '1.0',
    } : undefined

    onFound({
      name: service.name,
      host: service.host,
      port: service.port,
      ip: service.txt?.ip || metadata?.ip,
      metadata,
    })
  })

  if (onRemoved) {
    browser.on('down', (service: RemoteService) => {
      console.log(`❌ Service removed: ${service.name}`)
      onRemoved({ name: service.name })
    })
  }

  // 返回停止发现的函数
  return () => {
    browser.stop()
  }
}

/**
 * 取消发布服务
 */
export function unpublishService(): void {
  if (publishedService) {
    publishedService.stop?.()
    publishedService = null
  }
  if (bonjour) {
    bonjour.destroy()
    bonjour = null
  }
  console.log('📡 mDNS service unpublished')
}
