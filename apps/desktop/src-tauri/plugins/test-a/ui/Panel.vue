<script setup lang="ts">
import { ref } from 'vue'
const msg = ref('Hello from test-a!')
</script>
<template>
  <div style="padding: 12px; color: #fff;">
    <h3 style="margin: 0 0 8px;">test-a</h3>
    <p>{{ msg }}</p>
  </div>
</template>
