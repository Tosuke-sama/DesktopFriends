<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'

export interface ChatMessage {
  id: string
  speaker: 'user' | 'pet' | 'other'
  name: string
  content: string
  timestamp: number
  avatar?: string
}

const props = defineProps<{
  messages: ChatMessage[]
  petName: string
  maxMessages?: number
}>()

const containerRef = ref<HTMLElement | null>(null)
const chatHistoryRef = ref<HTMLElement | null>(null)
const isExpanded = ref(false)

// 拖拽相关状态
const isDragging = ref(false)
const position = ref({ x: 12, y: 0 }) // 初始位置 (left: 12px, bottom 由 CSS 控制)
const dragOffset = ref({ x: 0, y: 0 })

// 从 localStorage 读取保存的位置
const STORAGE_KEY = 'chat-history-position'

const loadPosition = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      position.value = parsed
    }
  } catch (e) {
    console.warn('Failed to load chat history position:', e)
  }
}

const savePosition = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position.value))
  } catch (e) {
    console.warn('Failed to save chat history position:', e)
  }
}

// 拖拽开始
const onDragStart = (e: MouseEvent | TouchEvent) => {
  // 阻止点击事件触发展开/收起
  e.stopPropagation()

  isDragging.value = true

  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

  dragOffset.value = {
    x: clientX - position.value.x,
    y: clientY - position.value.y,
  }

  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  document.addEventListener('touchmove', onDragMove, { passive: false })
  document.addEventListener('touchend', onDragEnd)
}

// 拖拽移动
const onDragMove = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return

  e.preventDefault()

  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

  // 计算新位置
  let newX = clientX - dragOffset.value.x
  let newY = clientY - dragOffset.value.y

  // 限制在屏幕范围内
  const maxX = window.innerWidth - 60 // 保留一部分可见
  const maxY = window.innerHeight - 60

  newX = Math.max(-220, Math.min(newX, maxX)) // 允许部分隐藏到左边
  newY = Math.max(60, Math.min(newY, maxY))

  position.value = { x: newX, y: newY }
}

// 拖拽结束
const onDragEnd = () => {
  isDragging.value = false
  savePosition()

  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.removeEventListener('touchmove', onDragMove)
  document.removeEventListener('touchend', onDragEnd)
}

// 自动滚动到底部
const scrollToBottom = async () => {
  await nextTick()
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
}

// 监听消息变化，自动滚动
watch(() => props.messages.length, () => {
  scrollToBottom()
})

// 获取头像显示
const getAvatar = (message: ChatMessage) => {
  if (message.avatar) return message.avatar
  // 使用名称首字作为头像
  return message.name.charAt(0)
}

// 获取头像颜色
const getAvatarColor = (speaker: 'user' | 'pet' | 'other') => {
  switch (speaker) {
    case 'user': return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    case 'pet': return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
    case 'other': return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
    default: return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  }
}

// 切换展开/收起
const toggleExpand = () => {
  if (!isDragging.value) {
    isExpanded.value = !isExpanded.value
  }
}

// 重置位置
const resetPosition = () => {
  position.value = { x: 12, y: window.innerHeight - 240 }
  savePosition()
}

onMounted(() => {
  loadPosition()
  // 如果没有保存的 y 位置，设置默认值
  if (position.value.y === 0) {
    position.value.y = window.innerHeight - 240
  }
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.removeEventListener('touchmove', onDragMove)
  document.removeEventListener('touchend', onDragEnd)
})

// 暴露重置方法
defineExpose({
  resetPosition,
})
</script>

<template>
  <div
    ref="chatHistoryRef"
    class="chat-history"
    :class="{ expanded: isExpanded, dragging: isDragging }"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
  >
    <!-- 标题栏 -->
    <div class="history-header" @click="toggleExpand">
      <!-- 拖拽手柄 -->
      <div
        class="drag-handle"
        @mousedown.stop="onDragStart"
        @touchstart.stop="onDragStart"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
        </svg>
      </div>
      <div class="header-left">
        <svg class="chat-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
          <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/>
        </svg>
        <span class="header-title">对话记录</span>
        <span class="message-count">{{ messages.length }}</span>
      </div>
      <svg class="expand-icon" :class="{ rotated: isExpanded }" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
      </svg>
    </div>

    <!-- 消息列表 -->
    <div ref="containerRef" class="messages-container">
      <TransitionGroup name="message">
        <div
          v-for="message in messages"
          :key="message.id"
          class="message-item"
          :class="message.speaker"
        >
          <!-- 头像 -->
          <div
            class="message-avatar"
            :style="{ background: getAvatarColor(message.speaker) }"
          >
            {{ getAvatar(message) }}
          </div>
          <!-- 内容 -->
          <div class="message-content">
            <span class="message-name">{{ message.name }}</span>
            <span class="message-text">{{ message.content }}</span>
          </div>
        </div>
      </TransitionGroup>

      <!-- 空状态 -->
      <div v-if="messages.length === 0" class="empty-state">
        <span>暂无对话记录</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-history {
  position: fixed;
  width: 280px;
  max-height: 160px;
  background: transparent;
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
  user-select: none;
  touch-action: manipulation;
  display: flex;
  flex-direction: column;
}

.chat-history.dragging {
  transition: none;
  cursor: grabbing;
}

.chat-history.expanded {
  max-height: 350px;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  cursor: pointer;
  user-select: none;
  border-radius: 16px;
  margin-bottom: 6px;
  flex-shrink: 0;
}

.drag-handle {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  color: rgba(255, 255, 255, 0.4);
  transition: color 0.2s ease;
  margin-right: 4px;
  flex-shrink: 0;
}

.drag-handle:hover {
  color: rgba(255, 255, 255, 0.7);
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle svg {
  width: 14px;
  height: 14px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chat-icon {
  width: 14px;
  height: 14px;
  color: rgba(255, 255, 255, 0.6);
}

.header-title {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
}

.message-count {
  font-size: 10px;
  padding: 1px 5px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
}

.expand-icon {
  width: 16px;
  height: 16px;
  color: rgba(255, 255, 255, 0.4);
  transition: transform 0.3s ease;
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

.messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
  /* 启用触摸滚动 */
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
}

.messages-container::-webkit-scrollbar {
  display: none;
}

.message-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 8px;
  margin-bottom: 2px;
  border-radius: 12px;
  background: transparent;
  transition: background 0.2s ease;
}

.message-item:hover {
  background: rgba(0, 0, 0, 0.2);
}

.message-item:last-child {
  margin-bottom: 0;
}

.message-avatar {
  width: 22px;
  height: 22px;
  min-width: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: white;
  text-transform: uppercase;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.message-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.message-name {
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.message-item.user .message-name {
  color: #c4b5fd;
}

.message-item.pet .message-name {
  color: #f9a8d4;
}

.message-item.other .message-name {
  color: #67e8f9;
}

.message-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.95);
  line-height: 1.4;
  word-break: break-word;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 11px;
}

/* Message animation */
.message-enter-active {
  animation: message-slide-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.message-leave-active {
  animation: message-fade-out 0.3s ease-out;
}

.message-move {
  transition: transform 0.3s ease;
}

@keyframes message-slide-in {
  0% {
    opacity: 0;
    transform: translateX(-20px) scale(0.9);
  }
  100% {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes message-fade-out {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.9);
  }
}

/* New message highlight - subtle glow */
.message-item:last-child {
  animation: highlight-glow 2s ease-out;
}

@keyframes highlight-glow {
  0% {
    text-shadow: 0 0 8px rgba(255, 255, 255, 0.6), 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  100% {
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
}
</style>
