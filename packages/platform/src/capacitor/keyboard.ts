import { Keyboard } from '@capacitor/keyboard'
import type { KeyboardPlugin, KeyboardInfo } from '../types'

/**
 * Capacitor 键盘插件实现
 */
export class CapacitorKeyboard implements KeyboardPlugin {
  async addListener(
    event: 'keyboardWillShow' | 'keyboardWillHide' | 'keyboardDidShow' | 'keyboardDidHide',
    callback: (info: KeyboardInfo) => void
  ): Promise<{ remove: () => Promise<void> }> {
    // Capacitor Keyboard 每个事件有单独的类型签名，需要分别处理
    let handle: { remove: () => Promise<void> }

    switch (event) {
      case 'keyboardWillShow':
        handle = await Keyboard.addListener('keyboardWillShow', (info) => {
          callback({ keyboardHeight: info.keyboardHeight || 0 })
        })
        break
      case 'keyboardWillHide':
        handle = await Keyboard.addListener('keyboardWillHide', () => {
          callback({ keyboardHeight: 0 })
        })
        break
      case 'keyboardDidShow':
        handle = await Keyboard.addListener('keyboardDidShow', (info) => {
          callback({ keyboardHeight: info.keyboardHeight || 0 })
        })
        break
      case 'keyboardDidHide':
        handle = await Keyboard.addListener('keyboardDidHide', () => {
          callback({ keyboardHeight: 0 })
        })
        break
    }

    return {
      remove: async () => {
        await handle.remove()
      },
    }
  }

  async removeAllListeners(): Promise<void> {
    await Keyboard.removeAllListeners()
  }
}
