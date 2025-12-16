/**
 * 平台类型
 */
export type PlatformType = 'capacitor' | 'tauri' | 'web'

/**
 * 平台能力
 */
export interface PlatformCapabilities {
  /** 文件系统访问 */
  hasFilesystem: boolean
  /** 键盘事件监听 (移动端) */
  hasKeyboard: boolean
  /** 本地服务器能力 */
  hasLocalServer: boolean
  /** 透明窗口 (桌面端) */
  hasTransparentWindow: boolean
  /** 窗口置顶 (桌面端) */
  hasAlwaysOnTop: boolean
  /** 窗口控制 (桌面端) */
  hasWindowControl: boolean
}

/**
 * 文件信息
 */
export interface FileInfo {
  name: string
  type: 'file' | 'directory'
  size?: number
  mtime?: number
}

/**
 * 文件系统插件接口
 */
export interface FilesystemPlugin {
  /** 读取文件 */
  readFile(path: string): Promise<{ data: string }>
  /** 读取二进制文件 */
  readBinaryFile?(path: string): Promise<{ data: Uint8Array }>
  /** 写入文件 */
  writeFile(path: string, data: string): Promise<void>
  /** 写入二进制文件 */
  writeBinaryFile?(path: string, data: Uint8Array): Promise<void>
  /** 创建目录 */
  mkdir(path: string, recursive?: boolean): Promise<void>
  /** 读取目录 */
  readdir(path: string): Promise<{ files: FileInfo[] }>
  /** 删除目录 */
  rmdir(path: string, recursive?: boolean): Promise<void>
  /** 删除文件 */
  deleteFile(path: string): Promise<void>
  /** 获取文件 URI (用于显示) */
  getUri(path: string): Promise<{ uri: string }>
  /** 检查路径是否存在 */
  exists?(path: string): Promise<boolean>
  /** 获取应用数据目录 */
  getAppDataDir(): Promise<string>
}

/**
 * 键盘事件信息
 */
export interface KeyboardInfo {
  keyboardHeight: number
}

/**
 * 键盘插件接口 (主要用于移动端)
 */
export interface KeyboardPlugin {
  /** 监听键盘显示 */
  addListener(
    event: 'keyboardWillShow' | 'keyboardWillHide' | 'keyboardDidShow' | 'keyboardDidHide',
    callback: (info: KeyboardInfo) => void
  ): Promise<{ remove: () => Promise<void> }>
  /** 移除所有监听器 */
  removeAllListeners(): Promise<void>
}

/**
 * 窗口控制接口 (桌面端专用)
 */
export interface WindowPlugin {
  /** 设置窗口置顶 */
  setAlwaysOnTop(value: boolean): Promise<void>
  /** 设置窗口大小 */
  setSize(width: number, height: number): Promise<void>
  /** 设置窗口位置 */
  setPosition(x: number, y: number): Promise<void>
  /** 获取窗口位置 */
  getPosition(): Promise<{ x: number; y: number }>
  /** 获取窗口大小 */
  getSize(): Promise<{ width: number; height: number }>
  /** 最小化窗口 */
  minimize(): Promise<void>
  /** 关闭窗口 */
  close(): Promise<void>
  /** 显示窗口 */
  show(): Promise<void>
  /** 隐藏窗口 */
  hide(): Promise<void>
  /** 开始拖拽窗口 */
  startDrag(): Promise<void>
}

/**
 * 本地服务器状态
 */
export interface ServerStatus {
  running: boolean
  port: number
  ip: string
  connectedClients: number
}

/**
 * 本地服务器插件接口
 */
export interface LocalServerPlugin {
  /** 启动服务器 */
  startServer(options: { port: number }): Promise<{
    success: boolean
    port: number
    ip: string
    error?: string
  }>
  /** 停止服务器 */
  stopServer(): Promise<{ success: boolean }>
  /** 获取服务器状态 */
  getStatus(): Promise<ServerStatus>
  /** 获取本机 IP */
  getLocalIP(): Promise<{ ip: string }>
  /** 广播消息 */
  broadcast(options: { event: string; data: string }): Promise<{ success: boolean }>
  /** 添加事件监听 */
  addListener(
    eventName: 'clientConnected' | 'clientDisconnected' | 'messageReceived',
    callback: (data: any) => void
  ): Promise<{ remove: () => Promise<void> }>
}

/**
 * 平台插件集合
 */
export interface PlatformPlugins {
  filesystem?: FilesystemPlugin
  keyboard?: KeyboardPlugin
  window?: WindowPlugin
  localServer?: LocalServerPlugin
}
