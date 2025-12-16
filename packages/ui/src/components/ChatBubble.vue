<script setup lang="ts">
defineProps<{
  message: string
  isThinking?: boolean      // 正在思考（显示加载动画）
  isInnerMonologue?: boolean // 内心独白样式
  speaker?: string | null   // 说话者名称，null 表示自己
}>()
</script>

<template>
  <div
    class="chat-bubble"
    :class="{
      'from-other': speaker,
      'inner-monologue': isInnerMonologue
    }"
  >
    <!-- 说话者名称 -->
    <div v-if="speaker" class="speaker-name">{{ speaker }}</div>

    <!-- 内心独白标签 -->
    <div v-if="isInnerMonologue" class="monologue-label">内心独白</div>

    <div v-if="isThinking" class="thinking">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
    <p v-else class="message">{{ message }}</p>
  </div>
</template>

<style scoped>
.chat-bubble {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 12px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  animation: fadeIn 0.3s ease;
}

.chat-bubble.from-other {
  background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
  border-left: 3px solid #667eea;
}

/* 内心独白样式 */
.chat-bubble.inner-monologue {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(240, 240, 255, 0.7) 100%);
  border: 1px dashed #a0a0c0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  font-style: italic;
}

.chat-bubble.inner-monologue .message {
  color: #666;
}

.monologue-label {
  font-size: 10px;
  color: #999;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.monologue-label::before {
  content: '💭';
  font-style: normal;
}

.speaker-name {
  font-size: 11px;
  font-weight: 600;
  color: #667eea;
  margin-bottom: 4px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message {
  margin: 0;
  color: #333;
  font-size: 14px;
  line-height: 1.5;
}

.thinking {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}

.dot {
  width: 8px;
  height: 8px;
  background: #667eea;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}

.dot:nth-child(1) {
  animation-delay: -0.32s;
}

.dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}
</style>
