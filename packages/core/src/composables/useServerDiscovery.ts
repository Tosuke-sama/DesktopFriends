import { ref, onUnmounted } from 'vue'

export interface DiscoveredServer {
  name: string
  ip: string
  port: number
  url: string
  pets: number
}

/**
 * 服务器发现原理说明：
 *
 * 由于浏览器安全限制，无法直接使用 mDNS (Bonjour) 协议发现局域网设备。
 * 所以采用 "IP 扫描" 方式：
 *
 * 1. 猜测本机 IP 段（通过 WebRTC 获取本机 IP 前三段，如 192.168.1）
 * 2. 遍历该网段所有可能的 IP（1-254）
 * 3. 对每个 IP 尝试连接 http://{ip}:{port}/info
 * 4. 如果响应包含 "DesktopFriends Server"，则识别为有效服务器
 *
 * 优化措施：
 * - 使用并发池控制同时请求数量（避免网络拥塞）
 * - 设置较短的超时时间（快速跳过无响应 IP）
 * - 支持扫描多个端口（3000-3009）以适配自动端口切换
 */
export function useServerDiscovery() {
  const servers = ref<DiscoveredServer[]>([])
  const isScanning = ref(false)
  const progress = ref(0)
  const error = ref<string | null>(null)

  let abortController: AbortController | null = null

  /**
   * 创建带超时的 AbortController（兼容旧版浏览器）
   */
  const createTimeoutController = (timeout: number, parentSignal?: AbortSignal): AbortController => {
    const controller = new AbortController()

    const timeoutId = setTimeout(() => controller.abort(), timeout)

    // 如果父信号被中止，也中止这个
    if (parentSignal) {
      if (parentSignal.aborted) {
        clearTimeout(timeoutId)
        controller.abort()
      } else {
        parentSignal.addEventListener('abort', () => {
          clearTimeout(timeoutId)
          controller.abort()
        })
      }
    }

    return controller
  }

  /**
   * 扫描单个 IP 的多个端口
   */
  const scanIPPorts = async (
    ip: string,
    ports: number[],
    timeout: number,
    signal: AbortSignal
  ): Promise<DiscoveredServer | null> => {
    for (const port of ports) {
      if (signal.aborted) return null

      const controller = createTimeoutController(timeout, signal)

      try {
        const url = `http://${ip}:${port}/info`
        const response = await fetch(url, {
          signal: controller.signal,
        })

        console.log(`[Scan] ${url} -> status: ${response.status}`)

        if (response.ok) {
          const info = await response.json()
          console.log(`[Scan] ${url} -> info:`, JSON.stringify(info))
          // 验证是 DesktopFriends 服务器
          if (info.name === 'DesktopFriends Server') {
            console.log(`[Scan] ✅ Found server at ${url}`)
            return {
              name: info.name,
              ip: ip,
              port: port,
              url: `http://${ip}:${port}`,
              pets: info.pets || 0,
            }
          }
        }
      } catch {
        // 该端口无响应，继续尝试下一个
      }
    }
    return null
  }

  /**
   * 扫描局域网内的 DesktopFriends 服务器
   */
  const scanNetwork = async (options?: {
    baseIP?: string      // 基础 IP，如 "192.168.1"
    startHost?: number   // 起始主机号，默认 1
    endHost?: number     // 结束主机号，默认 254
    ports?: number[]     // 要扫描的端口列表
    timeout?: number     // 超时时间(ms)，默认 800
    concurrency?: number // 并发数，默认 30
    append?: boolean     // 是否追加结果（不清空已有服务器）
  }) => {
    const {
      baseIP = await guessBaseIP(),
      startHost = 1,
      endHost = 254,
      ports = [3000, 3001, 3002, 3003, 3004],  // 扫描多个端口
      timeout = 800,
      concurrency = 30,
      append = false,
    } = options || {}

    isScanning.value = true
    progress.value = 0
    error.value = null

    if (!append) {
      servers.value = []
    }

    abortController = new AbortController()

    const totalHosts = endHost - startHost + 1
    let scannedCount = 0

    // 生成所有要扫描的 IP
    const ips: string[] = []
    for (let i = startHost; i <= endHost; i++) {
      ips.push(`${baseIP}.${i}`)
    }

    // 使用 Promise 并发池
    const runWithConcurrency = async (
      tasks: (() => Promise<void>)[],
      limit: number
    ) => {
      const executing: Promise<void>[] = []

      for (const task of tasks) {
        if (abortController?.signal.aborted) break

        const p = task().then(() => {
          executing.splice(executing.indexOf(p), 1)
        })
        executing.push(p)

        if (executing.length >= limit) {
          await Promise.race(executing)
        }
      }

      await Promise.allSettled(executing)
    }

    // 创建扫描任务
    const tasks = ips.map((ip) => async () => {
      if (abortController?.signal.aborted) return

      const server = await scanIPPorts(ip, ports, timeout, abortController!.signal)

      if (server) {
        // 避免重复添加
        if (!servers.value.find((s) => s.ip === server.ip && s.port === server.port)) {
          servers.value.push(server)
        }
      }

      scannedCount++
      progress.value = Math.round((scannedCount / totalHosts) * 100)
    })

    await runWithConcurrency(tasks, concurrency)

    isScanning.value = false
    progress.value = 100

    if (servers.value.length === 0 && !append) {
      error.value = '未找到服务器，请确认服务器已启动并在同一局域网'
    }

    return servers.value
  }

  /**
   * 快速扫描 - 扫描常见 IP 段
   */
  const quickScan = async () => {
    console.log('[QuickScan] Starting scan...')
    const commonBases = ['192.168.1', '192.168.0', '192.168.31', '10.0.0', '172.30.124']
    const baseIP = await guessBaseIP()
    console.log('[QuickScan] Guessed baseIP:', baseIP)

    // 把猜测的 IP 放在最前面，去重
    const bases = [baseIP, ...commonBases.filter((b) => b !== baseIP)]
    console.log('[QuickScan] Scanning bases:', bases.join(', '))

    isScanning.value = true
    servers.value = []
    error.value = null
    progress.value = 0

    abortController = new AbortController()

    // 同时扫描所有网段（更快）
    const scanPromises = bases.map((base, index) =>
      scanNetwork({
        baseIP: base,
        startHost: 1,
        endHost: 254,
        timeout: 600,
        concurrency: 25,
        append: true,  // 追加模式，不清空已找到的服务器
      }).then(() => {
        // 更新整体进度
        progress.value = Math.round(((index + 1) / bases.length) * 100)
      })
    )

    await Promise.allSettled(scanPromises)

    isScanning.value = false
    progress.value = 100

    if (servers.value.length === 0) {
      error.value = '未找到服务器，请确认：\n1. 服务器已启动\n2. 手机与电脑在同一局域网\n3. 防火墙未阻止连接'
    }

    return servers.value
  }

  /**
   * 测试单个服务器连接
   */
  const testServer = async (url: string): Promise<DiscoveredServer | null> => {
    const controller = createTimeoutController(3000)

    try {
      const response = await fetch(`${url}/info`, {
        signal: controller.signal,
      })

      if (response.ok) {
        const info = await response.json()
        if (info.name === 'DesktopFriends Server') {
          const urlObj = new URL(url)
          return {
            name: info.name,
            ip: info.ip || urlObj.hostname,
            port: info.port || parseInt(urlObj.port) || 3000,
            url: url,
            pets: info.pets || 0,
          }
        }
      }
    } catch {
      // 连接失败
    }
    return null
  }

  /**
   * 停止扫描
   */
  const stopScan = () => {
    abortController?.abort()
    isScanning.value = false
  }

  /**
   * 猜测当前设备的局域网 IP 段
   * 通过 WebRTC 获取本机 IP（如果可用）
   */
  const guessBaseIP = async (): Promise<string> => {
    try {
      // 尝试使用 WebRTC 获取本机 IP
      const pc = new RTCPeerConnection({ iceServers: [] })
      pc.createDataChannel('')

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pc.close()
          resolve('192.168.1') // 默认值
        }, 1000)

        pc.onicecandidate = (e) => {
          if (!e.candidate) return

          const match = e.candidate.candidate.match(/(\d+\.\d+\.\d+)\.\d+/)
          if (match) {
            clearTimeout(timeout)
            pc.close()
            resolve(match[1])
          }
        }
      })
    } catch {
      return '192.168.1' // 默认值
    }
  }

  // 组件卸载时停止扫描
  onUnmounted(() => {
    stopScan()
  })

  return {
    servers,
    isScanning,
    progress,
    error,
    scanNetwork,
    quickScan,
    testServer,
    stopScan,
    guessBaseIP,
  }
}
