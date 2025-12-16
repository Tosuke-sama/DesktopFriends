<script setup lang="ts">
import { watch } from 'vue'

const props = defineProps<{
  message: string
  show: boolean
  type?: 'success' | 'error' | 'info'
  duration?: number
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

watch(
  () => props.show,
  (newVal) => {
    if (newVal && props.duration !== 0) {
      setTimeout(() => {
        emit('update:show', false)
      }, props.duration || 3000)
    }
  }
)
</script>

<template>
  <Transition name="snackbar">
    <div v-if="show" class="md-snackbar" :class="type || 'info'">
      <span class="message">{{ message }}</span>
      <button class="close" @click="emit('update:show', false)">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
          />
        </svg>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.md-snackbar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #323232;
  color: white;
  padding: 14px 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  max-width: calc(100vw - 32px);
}

.md-snackbar.success {
  background: #43a047;
}

.md-snackbar.error {
  background: #e53935;
}

.message {
  font-size: 14px;
  flex: 1;
}

.close {
  background: transparent;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}

.close:hover {
  background: rgba(255, 255, 255, 0.1);
}

.close svg {
  width: 18px;
  height: 18px;
  color: rgba(255, 255, 255, 0.7);
}

/* Animation */
.snackbar-enter-active,
.snackbar-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.snackbar-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(100%);
}

.snackbar-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.9);
}
</style>
