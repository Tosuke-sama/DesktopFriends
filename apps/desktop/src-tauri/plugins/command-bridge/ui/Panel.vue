<script setup lang="ts">
const steps = [
  '在插件管理器中授权需要访问的目录（默认包含当前用户主目录）',
  '通过 LLM 调用 list_directory 工具登记一次受控命令',
  'Console 窗口会弹出供你审批，只有同意后才会真正执行'
]
</script>

<template>
  <div class="bridge-panel">
    <h3>Command Bridge</h3>
    <p>为桌宠提供受控的命令行能力，目前仅开放目录列表（ls -a / dir /b）。</p>
    <ul>
      <li v-for="item in steps" :key="item">{{ item }}</li>
    </ul>
  </div>
</template>

<style scoped>
.bridge-panel {
  padding: 12px;
  color: #f0f4ff;
  font-size: 13px;
}
.bridge-panel h3 {
  margin: 0 0 8px;
  font-size: 16px;
}
.bridge-panel ul {
  padding-left: 18px;
  margin: 0 0 8px;
}
.bridge-panel li {
  margin-bottom: 4px;
}
.hint {
  opacity: 0.8;
}
code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
}
</style>
