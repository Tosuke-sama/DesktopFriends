import type { PlatformType, PlatformCapabilities } from './types'

/**
 * 检测当前运行平台
 */
export function detectPlatform(): PlatformType {
  if (typeof window === 'undefined') {
    return 'web'
  }

  // Tauri 检测
  if ('__TAURI__' in window) {
    return 'tauri'
  }

  // Capacitor 检测
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    return 'capacitor'
  }

  return 'web'
}

/**
 * 获取当前平台的能力
 */
export function getPlatformCapabilities(): PlatformCapabilities {
  const platform = detectPlatform()

  switch (platform) {
    case 'capacitor':
      return {
        hasFilesystem: true,
        hasKeyboard: true,
        hasLocalServer: true,
        hasTransparentWindow: false,
        hasAlwaysOnTop: false,
        hasWindowControl: false,
      }
    case 'tauri':
      return {
        hasFilesystem: true,
        hasKeyboard: false, // 桌面端不需要虚拟键盘高度
        hasLocalServer: true,
        hasTransparentWindow: true,
        hasAlwaysOnTop: true,
        hasWindowControl: true,
      }
    case 'web':
    default:
      return {
        hasFilesystem: false,
        hasKeyboard: false,
        hasLocalServer: false,
        hasTransparentWindow: false,
        hasAlwaysOnTop: false,
        hasWindowControl: false,
      }
  }
}

/**
 * 检测是否在原生平台运行
 */
export function isNativePlatform(): boolean {
  const platform = detectPlatform()
  return platform === 'capacitor' || platform === 'tauri'
}

/**
 * 检测是否在桌面平台运行
 */
export function isDesktopPlatform(): boolean {
  return detectPlatform() === 'tauri'
}

/**
 * 检测是否在移动平台运行
 */
export function isMobilePlatform(): boolean {
  return detectPlatform() === 'capacitor'
}
