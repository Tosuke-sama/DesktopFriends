import type { FilesystemPlugin, FileInfo, KeyboardPlugin, KeyboardInfo, WindowPlugin } from '../types'

/**
 * Web 文件系统实现 (降级方案 - 功能受限)
 */
export class WebFilesystem implements FilesystemPlugin {
  private storage = new Map<string, string>()

  async readFile(path: string): Promise<{ data: string }> {
    const data = this.storage.get(path)
    if (data === undefined) {
      throw new Error(`File not found: ${path}`)
    }
    return { data }
  }

  async writeFile(path: string, data: string): Promise<void> {
    this.storage.set(path, data)
  }

  async mkdir(_path: string): Promise<void> {
    // Web 环境不支持真实目录创建
  }

  async readdir(_path: string): Promise<{ files: FileInfo[] }> {
    // 返回内存存储中的键作为文件列表
    const files: FileInfo[] = []
    for (const key of this.storage.keys()) {
      files.push({ name: key, type: 'file' })
    }
    return { files }
  }

  async rmdir(_path: string): Promise<void> {
    // Web 环境不支持
  }

  async deleteFile(path: string): Promise<void> {
    this.storage.delete(path)
  }

  async getUri(path: string): Promise<{ uri: string }> {
    const data = this.storage.get(path)
    if (data) {
      // 尝试创建 data URL
      return { uri: `data:text/plain;base64,${btoa(data)}` }
    }
    return { uri: path }
  }

  async exists(path: string): Promise<boolean> {
    return this.storage.has(path)
  }

  async getAppDataDir(): Promise<string> {
    return '/web-storage/'
  }
}

/**
 * Web 键盘实现 (空实现)
 */
export class WebKeyboard implements KeyboardPlugin {
  async addListener(
    _event: 'keyboardWillShow' | 'keyboardWillHide' | 'keyboardDidShow' | 'keyboardDidHide',
    _callback: (info: KeyboardInfo) => void
  ): Promise<{ remove: () => Promise<void> }> {
    // Web 环境没有虚拟键盘事件
    return {
      remove: async () => {},
    }
  }

  async removeAllListeners(): Promise<void> {}
}

/**
 * Web 窗口实现 (空实现)
 */
export class WebWindow implements WindowPlugin {
  async setAlwaysOnTop(_value: boolean): Promise<void> {
    console.warn('Window.setAlwaysOnTop is not supported in web environment')
  }

  async setSize(_width: number, _height: number): Promise<void> {
    console.warn('Window.setSize is not supported in web environment')
  }

  async setPosition(_x: number, _y: number): Promise<void> {
    console.warn('Window.setPosition is not supported in web environment')
  }

  async getPosition(): Promise<{ x: number; y: number }> {
    return { x: 0, y: 0 }
  }

  async getSize(): Promise<{ width: number; height: number }> {
    return { width: window.innerWidth, height: window.innerHeight }
  }

  async minimize(): Promise<void> {
    console.warn('Window.minimize is not supported in web environment')
  }

  async close(): Promise<void> {
    window.close()
  }

  async show(): Promise<void> {}

  async hide(): Promise<void> {
    console.warn('Window.hide is not supported in web environment')
  }

  async startDrag(): Promise<void> {
    console.warn('Window.startDrag is not supported in web environment')
  }
}
