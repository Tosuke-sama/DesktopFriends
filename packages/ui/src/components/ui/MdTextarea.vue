<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue: string
  label: string
  rows?: number
  error?: string
  hint?: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isFocused = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const isActive = computed(() => isFocused.value || props.modelValue.length > 0)
const hasError = computed(() => !!props.error)

const handleInput = (e: Event) => {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
}

const focusTextarea = () => {
  textareaRef.value?.focus()
}
</script>

<template>
  <div
    class="md-textarea"
    :class="{ focused: isFocused, active: isActive, error: hasError }"
    @click="focusTextarea"
  >
    <div class="textarea-container">
      <label class="label">{{ label }}</label>
      <textarea
        ref="textareaRef"
        :value="modelValue"
        :rows="rows || 4"
        :placeholder="placeholder"
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
.md-textarea {
  position: relative;
  padding-top: 16px;
  margin-bottom: 8px;
}

.textarea-container {
  position: relative;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px 8px 0 0;
  padding: 24px 16px 8px;
  cursor: text;
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.md-textarea:hover .textarea-container {
  background: rgba(255, 255, 255, 0.12);
}

.md-textarea.focused .textarea-container {
  background: rgba(255, 255, 255, 0.15);
}

.label {
  position: absolute;
  left: 16px;
  top: 20px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 16px;
  pointer-events: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: left center;
}

.md-textarea.active .label {
  top: 8px;
  transform: scale(0.75);
  color: rgba(255, 255, 255, 0.8);
}

.md-textarea.focused .label {
  color: #667eea;
}

.md-textarea.error .label {
  color: #ef5350;
}

textarea {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  line-height: 1.5;
  color: white;
  padding: 0;
  margin-top: 4px;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

textarea::placeholder {
  color: rgba(255, 255, 255, 0.3);
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

.md-textarea.focused .underline-focus {
  width: 100%;
}

.md-textarea.error .underline-focus {
  width: 100%;
  background: #ef5350;
}

.helper-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  padding: 4px 16px 0;
  min-height: 20px;
}

.md-textarea.error .helper-text {
  color: #ef5350;
}
</style>
