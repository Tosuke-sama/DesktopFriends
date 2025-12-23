declare module 'opus-recorder' {
  interface RecorderConfig {
    bufferLength?: number
    encoderPath?: string
    mediaTrackConstraints?: MediaTrackConstraints | boolean
    monitorGain?: number
    numberOfChannels?: number
    recordingGain?: number
    sourceNode?: MediaStreamAudioSourceNode
    encoderApplication?: number
    encoderBitRate?: number
    encoderComplexity?: number
    encoderFrameSize?: number
    encoderSampleRate?: number
    maxFramesPerPage?: number
    originalSampleRateOverride?: number
    resampleQuality?: number
    streamPages?: boolean
    wavBitDepth?: number
  }

  class Recorder {
    constructor(config?: RecorderConfig)

    encodedSamplePosition: number

    ondataavailable: ((data: ArrayBuffer) => void) | null
    onpause: (() => void) | null
    onresume: (() => void) | null
    onstart: (() => void) | null
    onstop: (() => void) | null

    close(): void
    pause(flush?: boolean): Promise<void> | void
    resume(): void
    setRecordingGain(gain: number): void
    setMonitorGain(gain: number): void
    start(): Promise<void>
    stop(): void

    static isRecordingSupported(): boolean
    static version: string
  }

  export default Recorder
}
