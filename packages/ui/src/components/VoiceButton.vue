<script setup lang="ts">
defineProps<{
  recording?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  start: [];
  end: [];
}>();

const handleStart = () => {
  emit("start");
};

const handleEnd = () => {
  emit("end");
};
</script>

<template>
  <button
    class="voice-btn"
    :class="{ recording: recording }"
    :disabled="disabled"
    @touchstart.prevent="handleStart"
    @touchend.prevent="handleEnd"
    @touchcancel.prevent="handleEnd"
    @mousedown.prevent="handleStart"
    @mouseup.prevent="handleEnd"
    @mouseleave="handleEnd"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      class="voice-icon"
    >
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
      <path
        d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.08A7 7 0 0 0 19 11z"
      />
    </svg>
  </button>
</template>

<style scoped>
.voice-btn {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.voice-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.voice-btn:active:not(:disabled),
.voice-btn.recording {
  background: #ff4757;
  transform: scale(1.1);
}

.voice-btn.recording .voice-icon {
  color: white;
  animation: pulse 1s infinite;
}

.voice-icon {
  width: 24px;
  height: 24px;
  color: #667eea;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
