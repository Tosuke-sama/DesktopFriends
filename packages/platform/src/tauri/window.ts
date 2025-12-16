import { appWindow } from '@tauri-apps/api/window'
import type { WindowPlugin } from '../types'

/**
 * Tauri 窗口控制实现
 */
export class TauriWindow implements WindowPlugin {
  async setAlwaysOnTop(value: boolean): Promise<void> {
    await appWindow.setAlwaysOnTop(value)
  }

  async setSize(width: number, height: number): Promise<void> {
    await appWindow.setSize({ type: 'Logical', width, height })
  }

  async setPosition(x: number, y: number): Promise<void> {
    await appWindow.setPosition({ type: 'Logical', x, y })
  }

  async getPosition(): Promise<{ x: number; y: number }> {
    const position = await appWindow.outerPosition()
    return { x: position.x, y: position.y }
  }

  async getSize(): Promise<{ width: number; height: number }> {
    const size = await appWindow.outerSize()
    return { width: size.width, height: size.height }
  }

  async minimize(): Promise<void> {
    await appWindow.minimize()
  }

  async close(): Promise<void> {
    await appWindow.close()
  }

  async show(): Promise<void> {
    await appWindow.show()
  }

  async hide(): Promise<void> {
    await appWindow.hide()
  }

  async startDrag(): Promise<void> {
    await appWindow.startDragging()
  }
}
