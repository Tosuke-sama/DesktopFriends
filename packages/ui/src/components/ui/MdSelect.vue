<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  modelValue: string
  label: string
  options: { value: string; label: string }[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const selectRef = ref<HTMLElement | null>(null)

const selectedLabel = () => {
  const option = props.options.find((o) => o.value === props.modelValue)
  return option?.label || ''
}

const selectOption = (value: string) => {
  emit('update:modelValue', value)
  isOpen.value = false
}

const handleClickOutside = (e: MouseEvent) => {
  if (selectRef.value && !selectRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

const toggleOpen = () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside, { once: true })
    }, 0)
  }
}
</script>

<template>
  <div class="md-select" :class="{ open: isOpen }" ref="selectRef">
    <div class="select-trigger" @click="toggleOpen">
      <span class="label" :class="{ active: modelValue }">{{ label }}</span>
      <span class="value">{{ selectedLabel() }}</span>
      <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 10l5 5 5-5z" />
      </svg>
      <div class="underline">
        <div class="underline-focus" />
      </div>
    </div>
    <Transition name="dropdown">
      <div class="dropdown" v-if="isOpen">
        <div
          v-for="option in options"
          :key="option.value"
          class="option"
          :class="{ selected: option.value === modelValue }"
          @click="selectOption(option.value)"
        >
          {{ option.label }}
          <svg
            v-if="option.value === modelValue"
            class="check"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.md-select {
  position: relative;
  margin-bottom: 8px;
}

.select-trigger {
  position: relative;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px 8px 0 0;
  padding: 20px 48px 8px 16px;
  cursor: pointer;
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 56px;
}

.select-trigger:hover {
  background: rgba(255, 255, 255, 0.12);
}

.md-select.open .select-trigger {
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

.label.active {
  top: 8px;
  transform: translateY(0) scale(0.75);
  color: rgba(255, 255, 255, 0.8);
}

.md-select.open .label {
  color: #667eea;
}

.value {
  color: white;
  font-size: 16px;
  display: block;
  margin-top: 4px;
}

.arrow {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  color: rgba(255, 255, 255, 0.6);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.md-select.open .arrow {
  transform: translateY(-50%) rotate(180deg);
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

.md-select.open .underline-focus {
  width: 100%;
}

.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #2d2d3a;
  border-radius: 0 0 8px 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 100;
  overflow: hidden;
}

.option {
  padding: 12px 16px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.option:hover {
  background: rgba(255, 255, 255, 0.08);
}

.option.selected {
  color: #667eea;
}

.check {
  width: 20px;
  height: 20px;
}

/* Dropdown animation */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: top;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: scaleY(0.8);
}
</style>
