import { ref, onMounted, onUnmounted } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

export function useKeyboard() {
  const isKeyboardVisible = ref(false)
  const keyboardHeight = ref(0)

  // 处理键盘显示
  const handleKeyboardShow = (info: { keyboardHeight: number }) => {
    isKeyboardVisible.value = true
    keyboardHeight.value = info.keyboardHeight
    console.log('Keyboard shown, height:', info.keyboardHeight)
  }

  // 处理键盘隐藏
  const handleKeyboardHide = () => {
    isKeyboardVisible.value = false
    keyboardHeight.value = 0
    console.log('Keyboard hidden')
  }

  onMounted(async () => {
    if (Capacitor.isNativePlatform()) {
      // 监听键盘事件
      await Keyboard.addListener('keyboardWillShow', handleKeyboardShow)
      await Keyboard.addListener('keyboardWillHide', handleKeyboardHide)
    }
  })

  onUnmounted(async () => {
    if (Capacitor.isNativePlatform()) {
      await Keyboard.removeAllListeners()
    }
  })

  return {
    isKeyboardVisible,
    keyboardHeight,
  }
}
