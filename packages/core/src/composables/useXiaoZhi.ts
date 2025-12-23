import { ref, shallowRef, computed } from 'vue'
import {
  XiaoZhiOpusDecoder,
  XiaoZhiOpusEncoder,
  createXiaoZhiDecoder,
  createXiaoZhiEncoder,
  XIAOZHI_AUDIO_CONFIG,
} from '../utils/opusCodec'

// ============ 类型定义 ============

export interface XiaoZhiConfig {
  /** OTA 服务器地址 */
  otaUrl: string
  /** 设备 MAC 地址 */
  deviceMac: string
  /** 客户端 ID */
  clientId?: string
  /** 设备名称 */
  deviceName?: string
  /** 认证令牌 */
  token?: string
  /** 是否自动播放音频 */
  autoPlayAudio?: boolean
}

export interface XiaoZhiOtaResponse {
  needBinding?: boolean
  activation?: { code: string }
  binding_required?: boolean
  websocket?: {
    url: string
    token?: string
  }
  [key: string]: unknown
}

export interface XiaoZhiConnectResult {
  success: boolean
  reason?: 'binding_required' | 'error' | 'already_connecting'
  message?: string
  data?: XiaoZhiOtaResponse
}

export interface XiaoZhiMessage {
  type: 'hello' | 'stt' | 'llm' | 'tts' | 'mcp' | 'listen' | string
  session_id?: string
  text?: string
  state?: 'sentence_start' | 'sentence_end' | 'stop' | string  // TTS 状态
  payload?: MCPPayload
  [key: string]: unknown
}

/** TTS 播放状态 */
export type TTSState = 'idle' | 'playing' | 'stopped'

export interface MCPPayload {
  jsonrpc?: string
  id?: string | number
  method?: string
  params?: {
    name?: string
    arguments?: Record<string, unknown>
  }
  result?: unknown
}

export interface MCPTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export type XiaoZhiStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'BINDING_REQUIRED'

// ============ Composable ============

export function useXiaoZhi(config?: Partial<XiaoZhiConfig>) {
  // 配置
  const xiaoZhiConfig = ref<XiaoZhiConfig>({
    otaUrl: config?.otaUrl || 'http://118.89.81.22:8002/xiaozhi/ota/',
    deviceMac: config?.deviceMac || '',
    clientId: config?.clientId || 'tablefri_client',
    deviceName: config?.deviceName || 'TableFri',
    token: config?.token || '',
    autoPlayAudio: config?.autoPlayAudio ?? true,
  })

  // 状态
  const status = ref<XiaoZhiStatus>('DISCONNECTED')
  const isConnected = computed(() => status.value === 'CONNECTED')
  const error = ref<Error | null>(null)
  const sessionId = ref<string | null>(null)
  const bindingCode = ref<string | null>(null)

  // 连接状态管理
  const isConnecting = ref(false)
  const connectionError = ref<string | null>(null)

  // 状态文本（用于 UI 显示）
  const statusText = computed(() => {
    if (isConnecting.value) return '连接中...'
    if (status.value === 'BINDING_REQUIRED') return `需要绑定: ${bindingCode.value || ''}`
    if (isConnected.value) return '已连接'
    if (connectionError.value) return connectionError.value
    return '未连接'
  })

  // TTS 相关状态
  const ttsState = ref<TTSState>('idle')
  const ttsText = ref<string>('')  // 当前 TTS 正在播放的文本
  const isSpeaking = computed(() => ttsState.value === 'playing')

  // 最后收到的消息
  const lastSTT = shallowRef<string | null>(null)
  const lastLLM = shallowRef<string | null>(null)
  const lastTTS = shallowRef<XiaoZhiMessage | null>(null)
  const lastAudioData = shallowRef<ArrayBuffer | Blob | null>(null)

  // WebSocket 实例
  let ws: WebSocket | null = null

  // 音频播放器相关
  let audioContext: AudioContext | null = null
  const audioQueue: ArrayBuffer[] = []
  let isPlayingAudio = false
  let opusDecoder: XiaoZhiOpusDecoder | null = null

  // Opus 编码器相关
  let opusEncoder: XiaoZhiOpusEncoder | null = null

  // MCP 工具列表
  const mcpTools = ref<MCPTool[]>([])

  // 事件回调
  const sttHandlers: Array<(text: string) => void> = []
  const llmHandlers: Array<(text: string) => void> = []
  const ttsHandlers: Array<(msg: XiaoZhiMessage) => void> = []
  const audioHandlers: Array<(data: ArrayBuffer | Blob) => void> = []
  const connectedHandlers: Array<(msg: XiaoZhiMessage) => void> = []
  const mcpHandlers: Array<(msg: XiaoZhiMessage) => void> = []
  const messageHandlers: Array<(msg: XiaoZhiMessage) => void> = []
  const ttsStartHandlers: Array<(text: string) => void> = []
  const ttsEndHandlers: Array<() => void> = []
  const audioPlaybackEndHandlers: Array<() => void> = [] // 音频播放完毕事件

  // 跟踪服务器是否已完成发送 TTS 数据
  let ttsServerDone = false

  /**
   * 设置配置
   */
  const setConfig = (newConfig: Partial<XiaoZhiConfig>) => {
    xiaoZhiConfig.value = { ...xiaoZhiConfig.value, ...newConfig }
  }

  /**
   * 设置 MCP 工具列表
   */
  const setMCPTools = (tools: MCPTool[]) => {
    mcpTools.value = tools
  }

  // ============ 音频播放相关 ============

  /**
   * 初始化音频上下文
   */
  const initAudioContext = () => {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return audioContext
  }

  /**
   * 初始化 Opus 解码器
   */
  const initOpusDecoder = async (): Promise<XiaoZhiOpusDecoder> => {
    if (!opusDecoder) {
      opusDecoder = createXiaoZhiDecoder()
      await opusDecoder.init()
      console.log('[XiaoZhi] Opus 解码器已初始化 (16kHz, 单声道)')
    }
    return opusDecoder
  }

  /**
   * 初始化 Opus 编码器
   * 注意：只创建实例，实际初始化在 startRecording 时进行
   */
  const initOpusEncoder = async (): Promise<XiaoZhiOpusEncoder> => {
    if (!opusEncoder) {
      opusEncoder = createXiaoZhiEncoder()
    }
    return opusEncoder
  }

  /**
   * 播放音频数据（支持 Opus 和其他格式）
   */
  const playAudioData = async (data: ArrayBuffer | Blob) => {
    if (!xiaoZhiConfig.value.autoPlayAudio) return

    try {
      const ctx = initAudioContext()

      // 如果是 Blob，转换为 ArrayBuffer
      let arrayBuffer: ArrayBuffer
      if (data instanceof Blob) {
        arrayBuffer = await data.arrayBuffer()
      } else {
        arrayBuffer = data
      }

      // 将音频数据加入队列
      audioQueue.push(arrayBuffer)

      // 如果没有正在播放，开始播放
      if (!isPlayingAudio) {
        playNextInQueue(ctx)
      }
    } catch (e) {
      console.error('[XiaoZhi] 音频播放错误:', e)
    }
  }

  /**
   * 检查并触发音频播放完毕事件
   */
  const checkAudioPlaybackEnd = () => {
    // 只有当服务器完成发送且队列为空且不在播放时，才触发事件
    if (ttsServerDone && audioQueue.length === 0 && !isPlayingAudio) {
      console.log('[XiaoZhi] 音频播放完毕（服务器完成 + 队列为空）')
      audioPlaybackEndHandlers.forEach((handler) => handler())
    }
  }

  /**
   * 播放队列中的下一个音频
   */
  const playNextInQueue = async (ctx: AudioContext) => {
    if (audioQueue.length === 0) {
      isPlayingAudio = false
      // 检查是否应该触发播放完毕事件
      checkAudioPlaybackEnd()
      return
    }

    isPlayingAudio = true
    const arrayBuffer = audioQueue.shift()!
    const uint8Array = new Uint8Array(arrayBuffer)

    console.log('[XiaoZhi] 处理音频数据, 大小:', uint8Array.length, '字节')

    try {
      // 首先尝试作为 Opus 解码
      const decoder = await initOpusDecoder()
      const decodedData = await decoder.decode(uint8Array)

      if (decodedData && decodedData.length > 0) {
        console.log('[XiaoZhi] Opus 解码成功, 采样数:', decodedData.length)

        const audioBuffer = ctx.createBuffer(1, decodedData.length, XIAOZHI_AUDIO_CONFIG.sampleRate)
        audioBuffer.getChannelData(0).set(decodedData)

        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)

        source.onended = () => {
          playNextInQueue(ctx)
        }

        source.start(0)
        return
      }
    } catch (opusError) {
      console.warn('[XiaoZhi] Opus 解码失败:', opusError)
    }

    try {
      // 尝试作为标准音频格式解码 (MP3, WAV 等)
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)

      source.onended = () => {
        playNextInQueue(ctx)
      }

      source.start(0)
      return
    } catch (decodeError) {
      console.warn('[XiaoZhi] 标准格式解码失败:', decodeError)
    }

    try {
      // 最后尝试作为 PCM 播放
      await playPCMAudio(ctx, arrayBuffer)
      playNextInQueue(ctx)
    } catch (pcmError) {
      console.error('[XiaoZhi] 所有音频解码方式都失败:', pcmError)
      playNextInQueue(ctx)
    }
  }

  /**
   * 播放 PCM 音频数据
   */
  const playPCMAudio = async (ctx: AudioContext, arrayBuffer: ArrayBuffer) => {
    // XiaoZhi 的 PCM 通常是 16-bit, 24000Hz, 单声道
    const sampleRate = 24000

    // 确保字节数是偶数
    const byteLength = arrayBuffer.byteLength % 2 === 0
      ? arrayBuffer.byteLength
      : arrayBuffer.byteLength - 1

    if (byteLength < 2) {
      throw new Error('音频数据太短')
    }

    const int16Array = new Int16Array(arrayBuffer.slice(0, byteLength))
    const float32Array = new Float32Array(int16Array.length)

    // 转换 Int16 到 Float32
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0
    }

    const audioBuffer = ctx.createBuffer(1, float32Array.length, sampleRate)
    audioBuffer.getChannelData(0).set(float32Array)

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)

    return new Promise<void>((resolve) => {
      source.onended = () => resolve()
      source.start(0)
    })
  }

  /**
   * 停止音频播放
   */
  const stopAudio = async () => {
    audioQueue.length = 0
    isPlayingAudio = false
    if (audioContext) {
      audioContext.close()
      audioContext = null
    }
    if (opusDecoder) {
      await opusDecoder.destroy()
      opusDecoder = null
    }
    if (opusEncoder) {
      opusEncoder.destroy()
      opusEncoder = null
    }
  }

  // ============ 语音录制相关 ============

  // 录音状态
  const isRecording = ref(false)
  let audioStream: MediaStream | null = null

  /**
   * 开始录音并发送到服务器（使用 opus-recorder 进行 Opus 编码）
   */
  const startRecording = async (): Promise<boolean> => {
    if (isRecording.value) {
      return false
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('[XiaoZhi] WebSocket 未连接，无法录音')
      return false
    }

    try {
      // 初始化编码器
      const encoder = await initOpusEncoder()

      // 设置编码数据回调 - 发送原始 Opus 帧到服务器
      encoder.onEncoded((opusFrame) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(opusFrame.buffer)
        }
      })

      // 初始化编码器（会请求麦克风权限）
      await encoder.init()

      // 发送开始监听消息
      sendJSON({
        type: 'listen',
        mode: 'manual',
        state: 'start',
      })

      // 开始录音
      const started = await encoder.start()
      if (!started) {
        throw new Error('编码器启动失败')
      }

      isRecording.value = true
      return true
    } catch (e) {
      console.error('[XiaoZhi] 录音启动失败:', e)
      stopRecording()
      return false
    }
  }

  /**
   * 停止录音
   */
  const stopRecording = () => {
    if (opusEncoder) {
      opusEncoder.stop()
    }

    if (audioStream) {
      audioStream.getTracks().forEach((track) => track.stop())
      audioStream = null
    }

    if (isRecording.value && ws && ws.readyState === WebSocket.OPEN) {
      // 发送停止监听消息
      sendJSON({
        type: 'listen',
        mode: 'manual',
        state: 'stop',
      })
    }

    isRecording.value = false
  }

  /**
   * 生成随机 MAC 地址
   */
  const generateRandomMac = (): string => {
    const hexDigits = '0123456789ABCDEF'
    const parts: string[] = []
    for (let i = 0; i < 6; i++) {
      let part = ''
      for (let j = 0; j < 2; j++) {
        part += hexDigits[Math.floor(Math.random() * 16)]
      }
      parts.push(part)
    }
    return parts.join(':')
  }

  /**
   * 步骤1: 发送 OTA 请求获取 WebSocket 连接信息
   */
  const sendOtaRequest = async (): Promise<XiaoZhiOtaResponse> => {
    const { otaUrl, deviceMac, clientId } = xiaoZhiConfig.value

    // 如果没有 MAC 地址，生成一个并保存到配置中（确保重试时使用相同的 MAC）
    let mac = deviceMac
    if (!mac) {
      mac = generateRandomMac()
      xiaoZhiConfig.value.deviceMac = mac
      console.log('[XiaoZhi] 生成并保存随机 MAC 地址:', mac)
    }

    const requestBody = {
      version: 0,
      uuid: '',
      application: {
        name: 'tablefri',
        version: '1.0.0',
        compile_time: new Date().toISOString(),
        idf_version: '4.4.3',
        elf_sha256: '1234567890abcdef1234567890abcdef',
      },
      ota: { label: 'tablefri' },
      board: {
        type: 'tablefri-device',
        ssid: '',
        rssi: 0,
        channel: 0,
        ip: '192.168.1.100',
        mac: mac,
      },
      flash_size: 0,
      minimum_free_heap_size: 0,
      mac_address: mac,
      chip_model_name: '',
      chip_info: { model: 0, cores: 0, revision: 0, features: 0 },
      partition_table: [],
    }

    console.log('[XiaoZhi] 发送 OTA 请求到:', otaUrl)

    const response = await fetch(otaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Device-Id': mac,
        'Client-Id': clientId || 'tablefri_client',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      throw new Error(`OTA 请求失败: ${response.status} ${response.statusText}`)
    }

    const result: XiaoZhiOtaResponse = await response.json()
    console.log('[XiaoZhi] OTA 响应:', result)

    // 检查是否需要绑定
    if (result.activation || result.binding_required) {
      console.log('[XiaoZhi] 需要设备绑定! 验证码:', result.activation?.code)
      bindingCode.value = result.activation?.code || null
      return { needBinding: true, ...result }
    }

    return result
  }

  /**
   * 步骤2: 建立 WebSocket 连接
   * @param options 可选的连接选项，用于覆盖已设置的配置
   * @returns 连接结果，如果自动生成了 MAC 地址，会在 generatedMac 字段返回
   */
  const connect = async (options?: {
    otaUrl?: string
    deviceMac?: string
    deviceName?: string
    autoPlayAudio?: boolean
  }): Promise<XiaoZhiConnectResult & { generatedMac?: string }> => {
    // 防止重复连接
    if (isConnecting.value || isConnected.value) {
      return { success: false, reason: 'already_connecting', message: '已在连接中或已连接' }
    }

    isConnecting.value = true
    connectionError.value = null
    status.value = 'CONNECTING'
    error.value = null

    // 合并选项到配置
    if (options) {
      setConfig(options)
    }

    // 如果没有 MAC 地址，自动生成
    let generatedMac: string | undefined
    if (!xiaoZhiConfig.value.deviceMac) {
      generatedMac = generateRandomMac()
      xiaoZhiConfig.value.deviceMac = generatedMac
      console.log('[XiaoZhi] 自动生成 MAC 地址:', generatedMac)
    }

    try {
      // 1. 获取 OTA 响应
      const otaResult = await sendOtaRequest()

      // 检查是否需要绑定
      if (otaResult.needBinding) {
        status.value = 'BINDING_REQUIRED'
        isConnecting.value = false
        connectionError.value = `需要绑定: ${bindingCode.value || ''}`
        return {
          success: false,
          reason: 'binding_required',
          message: '请在后台输入六位数验证码完成设备绑定',
          data: otaResult,
          generatedMac,
        }
      }

      // 2. 提取 WebSocket 信息
      const { websocket } = otaResult
      if (!websocket?.url) {
        throw new Error('OTA 响应中缺少 websocket 信息')
      }

      // 3. 构造 WebSocket URL (添加认证参数)
      const wsUrl = new URL(websocket.url)
      const { deviceMac, clientId } = xiaoZhiConfig.value

      // 添加 token
      if (websocket.token) {
        const token = websocket.token.startsWith('Bearer ')
          ? websocket.token
          : `Bearer ${websocket.token}`
        wsUrl.searchParams.append('authorization', token)
      }

      // 添加设备标识
      wsUrl.searchParams.append('device-id', deviceMac || 'tablefri-device')
      wsUrl.searchParams.append('client-id', clientId || 'tablefri_client')

      console.log('[XiaoZhi] 连接 WebSocket:', wsUrl.toString())

      // 4. 建立 WebSocket 连接
      return new Promise((resolve) => {
        ws = new WebSocket(wsUrl.toString())

        ws.onopen = () => {
          console.log('[XiaoZhi] WebSocket 已连接')
          sendHello()
          status.value = 'CONNECTED'
          isConnecting.value = false
          connectionError.value = null
          resolve({ success: true, generatedMac })
        }

        ws.onmessage = (event) => handleMessage(event)

        ws.onerror = (event) => {
          console.error('[XiaoZhi] WebSocket 错误:', event)
          error.value = new Error('WebSocket 连接错误')
          status.value = 'DISCONNECTED'
          isConnecting.value = false
          connectionError.value = 'WebSocket 连接错误'
          resolve({ success: false, reason: 'error', message: 'WebSocket 连接错误', generatedMac })
        }

        ws.onclose = (event) => {
          console.log('[XiaoZhi] WebSocket 已断开:', event.code, event.reason)
          status.value = 'DISCONNECTED'
          sessionId.value = null
          isConnecting.value = false
        }
      })
    } catch (e) {
      console.error('[XiaoZhi] 连接失败:', e)
      error.value = e instanceof Error ? e : new Error(String(e))
      status.value = 'DISCONNECTED'
      isConnecting.value = false
      connectionError.value = error.value.message
      return {
        success: false,
        reason: 'error',
        message: error.value.message,
        generatedMac,
      }
    }
  }

  /**
   * 步骤3: 发送 Hello 握手消息
   */
  const sendHello = () => {
    const { deviceMac, deviceName, token } = xiaoZhiConfig.value

    const helloMsg: XiaoZhiMessage = {
      type: 'hello',
      device_id: deviceMac || 'tablefri-device',
      device_name: deviceName || 'TableFri',
      device_mac: deviceMac || 'tablefri-device',
      token: token || '',
      features: {
        mcp: true, // 支持 MCP 工具协议
      },
    }

    sendJSON(helloMsg)
    console.log('[XiaoZhi] 已发送 Hello 消息')
  }

  /**
   * 处理服务器消息
   */
  const handleMessage = (event: MessageEvent) => {
    // 二进制数据 = 音频
    if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
      console.log('[XiaoZhi] 收到音频数据')
      lastAudioData.value = event.data
      audioHandlers.forEach((handler) => handler(event.data))

      // 自动播放音频
      if (xiaoZhiConfig.value.autoPlayAudio) {
        playAudioData(event.data)
      }
      return
    }

    // JSON 消息
    try {
      const msg: XiaoZhiMessage = JSON.parse(event.data)
      console.log('[XiaoZhi] 收到消息:', msg.type, msg)

      // 通用消息回调
      messageHandlers.forEach((handler) => handler(msg))

      switch (msg.type) {
        case 'hello':
          sessionId.value = msg.session_id || null
          console.log('[XiaoZhi] 握手成功, sessionId:', sessionId.value)
          connectedHandlers.forEach((handler) => handler(msg))
          break

        case 'stt':
          // 语音识别结果
          if (msg.text) {
            lastSTT.value = msg.text
            sttHandlers.forEach((handler) => handler(msg.text!))
          }
          break

        case 'llm':
          // 大模型回复
          if (msg.text) {
            lastLLM.value = msg.text
            llmHandlers.forEach((handler) => handler(msg.text!))
          }
          break

        case 'tts':
          // TTS 状态
          lastTTS.value = msg
          ttsHandlers.forEach((handler) => handler(msg))

          // 处理 TTS 状态变化
          if (msg.state === 'sentence_start') {
            ttsState.value = 'playing'
            // 重置服务器完成标志
            ttsServerDone = false
            if (msg.text) {
              ttsText.value = msg.text
              ttsStartHandlers.forEach((handler) => handler(msg.text!))
            }
          } else if (msg.state === 'stop') {
            ttsState.value = 'stopped'
            // 标记服务器已完成发送
            ttsServerDone = true
            ttsEndHandlers.forEach((handler) => handler())
            // 检查音频是否已经播放完毕
            checkAudioPlaybackEnd()
            // 稍后重置为 idle
            setTimeout(() => {
              if (ttsState.value === 'stopped') {
                ttsState.value = 'idle'
                ttsText.value = ''
              }
            }, 100)
          }
          break

        case 'mcp':
          // MCP 工具调用
          handleMCP(msg)
          mcpHandlers.forEach((handler) => handler(msg))
          break
      }
    } catch (e) {
      console.error('[XiaoZhi] 消息解析失败:', e)
    }
  }

  /**
   * 处理 MCP 工具调用
   */
  const handleMCP = (msg: XiaoZhiMessage) => {
    const { payload } = msg

    if (!payload) return

    if (payload.method === 'tools/list') {
      // 返回工具列表
      sendMCPResponse(payload.id, {
        tools: mcpTools.value,
      })
    } else if (payload.method === 'tools/call') {
      // 外部处理工具执行，这里只返回默认结果
      // 实际的工具执行应该由外部通过 onMCP 回调处理
      console.log('[XiaoZhi] MCP 工具调用:', payload.params?.name, payload.params?.arguments)
    }
  }

  /**
   * 发送 MCP 响应
   */
  const sendMCPResponse = (id: string | number | undefined, result: unknown) => {
    if (id === undefined) return

    sendJSON({
      type: 'mcp',
      session_id: sessionId.value,
      payload: {
        jsonrpc: '2.0',
        id: id,
        result: result,
      },
    })
  }

  /**
   * 发送 MCP 工具执行结果
   */
  const sendMCPToolResult = (
    id: string | number,
    result: { content: Array<{ type: string; text: string }>; isError: boolean }
  ) => {
    sendMCPResponse(id, result)
  }

  /**
   * 发送 JSON 消息
   */
  const sendJSON = (data: object): boolean => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[XiaoZhi] WebSocket 未连接')
      return false
    }

    try {
      ws.send(JSON.stringify(data))
      return true
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
      return false
    }
  }

  /**
   * 发送文本消息
   */
  const sendText = (text: string): boolean => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      error.value = new Error('WebSocket 未连接')
      return false
    }

    return sendJSON({
      type: 'listen',
      mode: 'manual',
      state: 'detect',
      text: text,
    })
  }

  /**
   * 发送音频数据
   */
  const sendAudio = (data: ArrayBuffer | Blob): boolean => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      error.value = new Error('WebSocket 未连接')
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
   * 断开连接
   */
  const disconnect = () => {
    if (ws) {
      ws.close(1000, 'Normal closure')
      ws = null
    }
    status.value = 'DISCONNECTED'
    sessionId.value = null
    // 停止音频播放
    stopAudio()
    ttsState.value = 'idle'
    ttsText.value = ''
  }

  /**
   * 重试连接（用于绑定后重新连接）
   */
  const retryConnect = async (): Promise<XiaoZhiConnectResult> => {
    bindingCode.value = null
    return connect()
  }

  // ============ 事件注册 ============

  const onSTT = (handler: (text: string) => void) => {
    sttHandlers.push(handler)
    return () => {
      const index = sttHandlers.indexOf(handler)
      if (index > -1) sttHandlers.splice(index, 1)
    }
  }

  const onLLM = (handler: (text: string) => void) => {
    llmHandlers.push(handler)
    return () => {
      const index = llmHandlers.indexOf(handler)
      if (index > -1) llmHandlers.splice(index, 1)
    }
  }

  const onTTS = (handler: (msg: XiaoZhiMessage) => void) => {
    ttsHandlers.push(handler)
    return () => {
      const index = ttsHandlers.indexOf(handler)
      if (index > -1) ttsHandlers.splice(index, 1)
    }
  }

  const onAudio = (handler: (data: ArrayBuffer | Blob) => void) => {
    audioHandlers.push(handler)
    return () => {
      const index = audioHandlers.indexOf(handler)
      if (index > -1) audioHandlers.splice(index, 1)
    }
  }

  const onConnected = (handler: (msg: XiaoZhiMessage) => void) => {
    connectedHandlers.push(handler)
    return () => {
      const index = connectedHandlers.indexOf(handler)
      if (index > -1) connectedHandlers.splice(index, 1)
    }
  }

  const onMCP = (handler: (msg: XiaoZhiMessage) => void) => {
    mcpHandlers.push(handler)
    return () => {
      const index = mcpHandlers.indexOf(handler)
      if (index > -1) mcpHandlers.splice(index, 1)
    }
  }

  const onMessage = (handler: (msg: XiaoZhiMessage) => void) => {
    messageHandlers.push(handler)
    return () => {
      const index = messageHandlers.indexOf(handler)
      if (index > -1) messageHandlers.splice(index, 1)
    }
  }

  const onTTSStart = (handler: (text: string) => void) => {
    ttsStartHandlers.push(handler)
    return () => {
      const index = ttsStartHandlers.indexOf(handler)
      if (index > -1) ttsStartHandlers.splice(index, 1)
    }
  }

  const onTTSEnd = (handler: () => void) => {
    ttsEndHandlers.push(handler)
    return () => {
      const index = ttsEndHandlers.indexOf(handler)
      if (index > -1) ttsEndHandlers.splice(index, 1)
    }
  }

  const onAudioPlaybackEnd = (handler: () => void) => {
    audioPlaybackEndHandlers.push(handler)
    return () => {
      const index = audioPlaybackEndHandlers.indexOf(handler)
      if (index > -1) audioPlaybackEndHandlers.splice(index, 1)
    }
  }

  return {
    // 配置
    config: xiaoZhiConfig,
    setConfig,
    setMCPTools,

    // 状态
    status,
    isConnected,
    isConnecting,
    connectionError,
    statusText,
    error,
    sessionId,
    bindingCode,

    // TTS 状态
    ttsState,
    ttsText,
    isSpeaking,

    // 最后消息
    lastSTT,
    lastLLM,
    lastTTS,
    lastAudioData,

    // 连接方法
    connect,
    disconnect,
    retryConnect,

    // 发送方法
    sendText,
    sendAudio,
    sendJSON,
    sendMCPResponse,
    sendMCPToolResult,

    // 音频控制
    playAudioData,
    stopAudio,

    // 录音控制
    isRecording,
    startRecording,
    stopRecording,

    // 事件注册
    onSTT,
    onLLM,
    onTTS,
    onAudio,
    onConnected,
    onMCP,
    onMessage,
    onTTSStart,
    onTTSEnd,
    onAudioPlaybackEnd,
  }
}
