<script setup lang="ts">
defineProps<{
  title?: string
  elevated?: boolean
}>()
</script>

<template>
  <div class="md-card" :class="{ elevated }">
    <div class="card-header" v-if="title">
      <h3>{{ title }}</h3>
    </div>
    <div class="card-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.md-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.md-card.elevated {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.card-header {
  padding: 16px 20px 8px;
}

.card-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: #667eea;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card-content {
  padding: 8px 20px 16px;
}
</style>
