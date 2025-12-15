import type { CapacitorConfig } from '@capacitor/cli'
import type { KeyboardResize } from '@capacitor/keyboard'

const config: CapacitorConfig = {
  appId: 'com.desktopfriends.app',
  appName: 'DesktopFriends',
  webDir: 'dist',
  server: {
    androidScheme: 'http', // 使用 HTTP 避免 Mixed Content 问题
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#00000000', // 透明背景
  },
  plugins: {
    Keyboard: {
      // 禁用系统自动调整，由代码手动控制输入框位置
      resize: 'none' as KeyboardResize,
      // 禁用自动滚动，避免布局异常
      scrollAssist: false,
      scrollPadding: false,
    },
  },
}

export default config
