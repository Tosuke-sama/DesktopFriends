import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import type { FilesystemPlugin, FileInfo } from '../types'

/**
 * Capacitor 文件系统实现
 */
export class CapacitorFilesystem implements FilesystemPlugin {
  async readFile(path: string): Promise<{ data: string }> {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })
    return { data: result.data as string }
  }

  async readBinaryFile(path: string): Promise<{ data: Uint8Array }> {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Data,
    })
    // Capacitor 返回 base64 字符串
    const base64 = result.data as string
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return { data: bytes }
  }

  async writeFile(path: string, data: string): Promise<void> {
    await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    })
  }

  async writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
    // 转换为 base64
    let binary = ''
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i])
    }
    const base64 = btoa(binary)

    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    })
  }

  async mkdir(path: string, recursive = true): Promise<void> {
    await Filesystem.mkdir({
      path,
      directory: Directory.Data,
      recursive,
    })
  }

  async readdir(path: string): Promise<{ files: FileInfo[] }> {
    const result = await Filesystem.readdir({
      path,
      directory: Directory.Data,
    })

    const files: FileInfo[] = result.files.map((file) => ({
      name: file.name,
      type: file.type === 'directory' ? 'directory' : 'file',
      size: file.size,
      mtime: file.mtime,
    }))

    return { files }
  }

  async rmdir(path: string, recursive = false): Promise<void> {
    await Filesystem.rmdir({
      path,
      directory: Directory.Data,
      recursive,
    })
  }

  async deleteFile(path: string): Promise<void> {
    await Filesystem.deleteFile({
      path,
      directory: Directory.Data,
    })
  }

  async getUri(path: string): Promise<{ uri: string }> {
    const result = await Filesystem.getUri({
      path,
      directory: Directory.Data,
    })
    return { uri: result.uri }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({
        path,
        directory: Directory.Data,
      })
      return true
    } catch {
      return false
    }
  }

  async getAppDataDir(): Promise<string> {
    const result = await Filesystem.getUri({
      path: '',
      directory: Directory.Data,
    })
    return result.uri
  }
}
