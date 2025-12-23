/**
 * Opus 编解码工具
 *
 * XiaoZhi 音频参数规范:
 * - 采样率: 16000 Hz
 * - 声道数: 1 (单声道)
 * - 帧大小: 960 样本 (60ms @ 16kHz)
 * - 应用类型: 2048 (OPUS_APPLICATION_VOIP)
 * - 比特率: 16000 bps
 */

import { OpusDecoder } from 'opus-decoder'

// XiaoZhi 音频参数常量
export const XIAOZHI_AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1,
  frameSize: 960, // 60ms @ 16kHz
  frameDurationMs: 60,
  application: 2048, // OPUS_APPLICATION_VOIP
  bitRate: 16000,
} as const

/**
 * Opus 解码器封装
 * 使用 opus-decoder 库进行解码
 */
export class XiaoZhiOpusDecoder {
  private decoder: InstanceType<typeof OpusDecoder> | null = null
  private isReady = false

  async init(): Promise<void> {
    if (this.decoder) return

    this.decoder = new OpusDecoder({
      channels: XIAOZHI_AUDIO_CONFIG.channels,
      sampleRate: XIAOZHI_AUDIO_CONFIG.sampleRate,
    })
    await this.decoder.ready
    this.isReady = true
  }

  async decode(opusData: Uint8Array): Promise<Float32Array | null> {
    if (!this.decoder || !this.isReady) {
      await this.init()
    }

    try {
      const { channelData } = await this.decoder!.decodeFrame(opusData)
      if (channelData && channelData[0] && channelData[0].length > 0) {
        return channelData[0]
      }
      return null
    } catch (e) {
      console.error('[OpusCodec] 解码失败:', e)
      return null
    }
  }

  async destroy(): Promise<void> {
    if (this.decoder) {
      this.decoder.free()
      this.decoder = null
      this.isReady = false
    }
  }
}

/**
 * OGG 页解析器
 * 从 OGG 容器中提取原始 Opus 帧
 */
class OggPageParser {
  /**
   * 解析 OGG 页并提取 Opus 数据包
   * @param data OGG 页数据
   * @returns 提取的 Opus 数据包数组
   */
  static extractOpusPackets(data: Uint8Array): Uint8Array[] {
    const packets: Uint8Array[] = []
    let offset = 0

    while (offset < data.length) {
      // 检查 OGG 魔数 "OggS"
      if (
        data[offset] !== 0x4f || // 'O'
        data[offset + 1] !== 0x67 || // 'g'
        data[offset + 2] !== 0x67 || // 'g'
        data[offset + 3] !== 0x53 // 'S'
      ) {
        break
      }

      // 跳过头部到 segment_count
      // OGG 头部: 4(魔数) + 1(版本) + 1(类型) + 8(granule) + 4(serial) + 4(seq) + 4(checksum) + 1(segments) = 27 bytes
      const segmentCount = data[offset + 26]
      const segmentTableStart = offset + 27
      const dataStart = segmentTableStart + segmentCount

      // 读取 segment table 计算总数据长度
      let totalDataLength = 0
      for (let i = 0; i < segmentCount; i++) {
        totalDataLength += data[segmentTableStart + i]
      }

      // 提取数据
      const pageData = data.slice(dataStart, dataStart + totalDataLength)

      // 检查是否是 Opus 头部页面（跳过 OpusHead 和 OpusTags）
      if (pageData.length >= 8) {
        const header = String.fromCharCode(...pageData.slice(0, 8))
        if (header !== 'OpusHead' && header !== 'OpusTags') {
          // 这是音频数据页，解析 segments 提取独立的 Opus 包
          let packetOffset = 0
          let packetLength = 0

          for (let i = 0; i < segmentCount; i++) {
            const segmentLength = data[segmentTableStart + i]
            packetLength += segmentLength

            // 如果 segment 长度 < 255，说明是包的结束
            if (segmentLength < 255) {
              if (packetLength > 0) {
                const packet = pageData.slice(packetOffset, packetOffset + packetLength)
                packets.push(packet)
              }
              packetOffset += packetLength
              packetLength = 0
            }
          }

          // 处理最后一个包（如果没有结束标记）
          if (packetLength > 0) {
            const packet = pageData.slice(packetOffset, packetOffset + packetLength)
            packets.push(packet)
          }
        }
      }

      // 移动到下一页
      offset = dataStart + totalDataLength
    }

    return packets
  }
}

/**
 * Opus 编码器封装
 * 使用 opus-recorder 库进行编码，并解析 OGG 提取原始 Opus 帧
 */
export class XiaoZhiOpusEncoder {
  private recorder: any = null
  private isReady = false
  private onEncodedCallback: ((data: Uint8Array) => void) | null = null
  private Recorder: any = null

  /**
   * 初始化编码器
   * @param encoderPath encoderWorker.min.js 的路径
   */
  async init(encoderPath?: string): Promise<void> {
    if (this.isReady) return

    try {
      // 动态导入 opus-recorder
      const module = await import('opus-recorder')
      this.Recorder = module.default || module

      // 如果没有提供路径，尝试使用默认路径
      const workerPath = encoderPath || '/encoderWorker.min.js'

      this.recorder = new this.Recorder({
        encoderPath: workerPath,
        encoderSampleRate: XIAOZHI_AUDIO_CONFIG.sampleRate,
        encoderFrameSize: XIAOZHI_AUDIO_CONFIG.frameDurationMs,
        encoderApplication: XIAOZHI_AUDIO_CONFIG.application,
        encoderBitRate: XIAOZHI_AUDIO_CONFIG.bitRate,
        numberOfChannels: XIAOZHI_AUDIO_CONFIG.channels,
        streamPages: true, // 启用流式输出
        maxFramesPerPage: 1, // 每页只包含一帧，降低延迟
        // 麦克风约束 - 不强制采样率，让设备使用默认值，opus-recorder 会自动重采样
        mediaTrackConstraints: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      // 设置数据回调
      this.recorder.ondataavailable = (arrayBuffer: ArrayBuffer) => {
        if (this.onEncodedCallback) {
          const oggData = new Uint8Array(arrayBuffer)
          // 解析 OGG 页提取原始 Opus 包
          const opusPackets = OggPageParser.extractOpusPackets(oggData)
          opusPackets.forEach((packet) => {
            this.onEncodedCallback!(packet)
          })
        }
      }

      this.isReady = true
    } catch (e) {
      console.error('[OpusCodec] 编码器初始化失败:', e)
      throw e
    }
  }

  /**
   * 设置编码完成回调
   */
  onEncoded(callback: (data: Uint8Array) => void): void {
    this.onEncodedCallback = callback
  }

  /**
   * 开始录音编码
   * 注意：必须从用户交互事件中调用
   */
  async start(): Promise<boolean> {
    if (!this.recorder || !this.isReady) {
      console.error('[OpusCodec] 编码器未初始化')
      return false
    }

    try {
      await this.recorder.start()
      return true
    } catch (e) {
      console.error('[OpusCodec] 开始录音失败:', e)
      return false
    }
  }

  /**
   * 停止录音编码
   */
  stop(): void {
    if (this.recorder) {
      this.recorder.stop()
    }
  }

  /**
   * 暂停录音
   */
  pause(): void {
    if (this.recorder) {
      this.recorder.pause()
    }
  }

  /**
   * 恢复录音
   */
  resume(): void {
    if (this.recorder) {
      this.recorder.resume()
    }
  }

  /**
   * 销毁编码器
   */
  destroy(): void {
    if (this.recorder) {
      this.recorder.close()
      this.recorder = null
    }
    this.isReady = false
    this.onEncodedCallback = null
  }

  /**
   * 检查浏览器是否支持录音
   */
  static isSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  }
}

/**
 * 创建 XiaoZhi Opus 解码器实例
 */
export function createXiaoZhiDecoder(): XiaoZhiOpusDecoder {
  return new XiaoZhiOpusDecoder()
}

/**
 * 创建 XiaoZhi Opus 编码器实例
 */
export function createXiaoZhiEncoder(): XiaoZhiOpusEncoder {
  return new XiaoZhiOpusEncoder()
}
