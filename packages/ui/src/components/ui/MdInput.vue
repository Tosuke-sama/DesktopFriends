<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue: string
  label: string
  type?: 'text' | 'password' | 'email'
  error?: string
  hint?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isFocused = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const isActive = computed(() => isFocused.value || props.modelValue.length > 0)
const hasError = computed(() => !!props.error)

const handleInput = (e: Event) => {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

const focusInput = () => {
  inputRef.value?.focus()
}
</script>

<template>
  <div
    class="md-input"
    :class="{ focused: isFocused, active: isActive, error: hasError }"
    @click="focusInput"
  >
    <div class="input-container">
      <label class="label">{{ label }}</label>
      <input
        ref="inputRef"
        :type="type || 'text'"
        :value="modelValue"
        @input="handleInput"
        @focus="isFocused = true"
        @blur="isFocused = false"
      />
      <div class="underline">
        <div class="underline-focus" />
      </div>
    </div>
    <div class="helper-text" v-if="error || hint">
      {{ error || hint }}
    </div>
  </div>
</template>

<style scoped>
.md-input {
  position: relative;
  padding-top: 16px;
  margin-bottom: 8px;
}

.input-container {
  position: relative;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px 8px 0 0;
  padding: 20px 16px 8px;
  cursor: text;
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.md-input:hover .input-container {
  background: rgba(255, 255, 255, 0.12);
}

.md-input.focused .input-container {
  background: rgba(255, 255, 255, 0.15);
}

.label {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.6);
  font-size: 16px;
  pointer-events: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: left center;
}

.md-input.active .label {
  top: 8px;
  transform: translateY(0) scale(0.75);
  color: rgba(255, 255, 255, 0.8);
}

.md-input.focused .label {
  color: #667eea;
}

.md-input.error .label {
  color: #ef5350;
}

input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 16px;
  color: white;
  padding: 0;
  margin-top: 4px;
}

input::placeholder {
  color: transparent;
}

.underline {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.3);
}

.underline-focus {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 0;
  height: 2px;
  background: #667eea;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  transform: translateX(-50%);
}

.md-input.focused .underline-focus {
  width: 100%;
}

.md-input.error .underline-focus {
  width: 100%;
  background: #ef5350;
}

.helper-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  padding: 4px 16px 0;
  min-height: 20px;
}

.md-input.error .helper-text {
  color: #ef5350;
}
</style>
