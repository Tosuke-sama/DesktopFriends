<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const toggle = () => {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <div class="md-switch" :class="{ active: modelValue }" @click="toggle">
    <span class="label" v-if="label">{{ label }}</span>
    <div class="track">
      <div class="thumb">
        <div class="ripple" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.md-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  cursor: pointer;
  user-select: none;
}

.label {
  color: white;
  font-size: 14px;
}

.track {
  position: relative;
  width: 36px;
  height: 14px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 7px;
  transition: background 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.md-switch.active .track {
  background: rgba(102, 126, 234, 0.5);
}

.thumb {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translate(0, -50%);
  width: 20px;
  height: 20px;
  background: #fafafa;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.md-switch.active .thumb {
  transform: translate(16px, -50%);
  background: #667eea;
}

.ripple {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: transparent;
  transition: background 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.md-switch:hover .ripple {
  background: rgba(255, 255, 255, 0.08);
}

.md-switch.active:hover .ripple {
  background: rgba(102, 126, 234, 0.15);
}
</style>
