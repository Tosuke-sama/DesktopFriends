<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  click: [e: MouseEvent]
}>()

const ripples = ref<{ id: number; x: number; y: number; size: number }[]>([])
let rippleId = 0

const createRipple = (e: MouseEvent) => {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height) * 2
  const x = e.clientX - rect.left - size / 2
  const y = e.clientY - rect.top - size / 2

  const id = rippleId++
  ripples.value.push({ id, x, y, size })

  setTimeout(() => {
    ripples.value = ripples.value.filter((r) => r.id !== id)
  }, 600)

  emit('click', e)
}
</script>

<template>
  <button
    class="ripple-button"
    :disabled="disabled"
    @click="createRipple"
  >
    <span class="content">
      <slot />
    </span>
    <span class="ripple-container">
      <span
        v-for="ripple in ripples"
        :key="ripple.id"
        class="ripple"
        :style="{
          left: `${ripple.x}px`,
          top: `${ripple.y}px`,
          width: `${ripple.size}px`,
          height: `${ripple.size}px`,
        }"
      />
    </span>
  </button>
</template>

<style scoped>
.ripple-button {
  position: relative;
  overflow: hidden;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.ripple-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.ripple-button:active:not(:disabled) {
  transform: translateY(0);
}

.ripple-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.content {
  position: relative;
  z-index: 1;
}

.ripple-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
}

.ripple {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  transform: scale(0);
  animation: ripple-effect 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

@keyframes ripple-effect {
  to {
    transform: scale(1);
    opacity: 0;
  }
}
</style>
