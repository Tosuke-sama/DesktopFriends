import {
  readTextFile,
  readBinaryFile as tauriReadBinaryFile,
  writeTextFile,
  writeBinaryFile as tauriWriteBinaryFile,
  createDir,
  readDir,
  removeDir,
  removeFile,
  exists as tauriExists,
} from '@tauri-apps/api/fs'
import { appDataDir } from '@tauri-apps/api/path'
import { convertFileSrc } from '@tauri-apps/api/tauri'
import type { FilesystemPlugin, FileInfo } from '../types'

/**
 * Tauri 文件系统实现
 */
export class TauriFilesystem implements FilesystemPlugin {
  private basePath: string | null = null

  private async getBasePath(): Promise<string> {
    if (!this.basePath) {
      this.basePath = await appDataDir()
    }
    return this.basePath
  }

  private async resolvePath(path: string): Promise<string> {
    const base = await this.getBasePath()
    // 如果是绝对路径，直接返回
    if (path.startsWith('/') || path.includes(':')) {
      return path
    }
    return `${base}${path}`
  }

  async readFile(path: string): Promise<{ data: string }> {
    const fullPath = await this.resolvePath(path)
    const data = await readTextFile(fullPath)
    return { data }
  }

  async readBinaryFile(path: string): Promise<{ data: Uint8Array }> {
    const fullPath = await this.resolvePath(path)
    const data = await tauriReadBinaryFile(fullPath)
    return { data }
  }

  async writeFile(path: string, data: string): Promise<void> {
    const fullPath = await this.resolvePath(path)
    await writeTextFile(fullPath, data)
  }

  async writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
    const fullPath = await this.resolvePath(path)
    await tauriWriteBinaryFile(fullPath, data)
  }

  async mkdir(path: string, recursive = true): Promise<void> {
    const fullPath = await this.resolvePath(path)
    await createDir(fullPath, { recursive })
  }

  async readdir(path: string): Promise<{ files: FileInfo[] }> {
    const fullPath = await this.resolvePath(path)
    const entries = await readDir(fullPath)

    const files: FileInfo[] = entries.map((entry) => ({
      name: entry.name || '',
      type: entry.children !== undefined ? 'directory' : 'file',
    }))

    return { files }
  }

  async rmdir(path: string, recursive = false): Promise<void> {
    const fullPath = await this.resolvePath(path)
    await removeDir(fullPath, { recursive })
  }

  async deleteFile(path: string): Promise<void> {
    const fullPath = await this.resolvePath(path)
    await removeFile(fullPath)
  }

  async getUri(path: string): Promise<{ uri: string }> {
    const fullPath = await this.resolvePath(path)
    // convertFileSrc 将本地路径转换为 Tauri 可访问的 URL
    return { uri: convertFileSrc(fullPath) }
  }

  async exists(path: string): Promise<boolean> {
    const fullPath = await this.resolvePath(path)
    return await tauriExists(fullPath)
  }

  async getAppDataDir(): Promise<string> {
    return await this.getBasePath()
  }
}
