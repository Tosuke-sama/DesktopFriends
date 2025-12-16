<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  send: [message: string];
}>();

const inputText = ref("");

const handleSend = () => {
  if (!inputText.value.trim() || props.disabled) return;
  emit("send", inputText.value.trim());
  inputText.value = "";
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
};
</script>

<template>
  <div class="chat-input">
    <input
      v-model="inputText"
      type="text"
      placeholder="和宠物说点什么..."
      :disabled="disabled"
      @keydown="handleKeydown"
    />
    <button @click="handleSend" :disabled="disabled || !inputText.trim()">
      发送
    </button>
  </div>
</template>

<style scoped>
.chat-input {
  display: flex;
  gap: 8px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  padding: 8px 8px 8px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

input {
  flex: 1;
  border: none;
  outline: none;
  /* font-size: 16px; */
  background: transparent;
  color: #333;
}

input::placeholder {
  color: #999;
}

input:disabled {
  opacity: 0.6;
}

button {
  padding: 8px 20px;
  border: none;
  border-radius: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
}

button:hover:not(:disabled) {
  opacity: 0.9;
}

button:active:not(:disabled) {
  transform: scale(0.98);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
