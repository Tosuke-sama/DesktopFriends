<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  errors?: string[]
}>()

const emit = defineEmits<{
  close: []
}>()

const hasErrors = computed(() => props.errors && props.errors.length > 0)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click="emit('close')">
        <div class="modal-content format-guide" @click.stop>
          <div class="modal-title">模型格式规范</div>

          <!-- 错误提示 -->
          <div v-if="hasErrors" class="error-section">
            <div class="error-title">上传失败原因：</div>
            <ul class="error-list">
              <li v-for="(err, i) in errors" :key="i">{{ err }}</li>
            </ul>
          </div>

          <!-- 格式说明 -->
          <div class="guide-section">
            <div class="guide-title">标准 Live2D 模型结构</div>
            <div class="structure-preview">
              <pre>model_name.zip
├── model_name.model3.json  ← 必需
├── model_name.moc3         ← 必需
├── textures/               ← 必需
│   └── texture_00.png
├── motions/                ← 可选
│   └── idle.motion3.json
└── expressions/            ← 可选
    └── happy.exp3.json</pre>
            </div>
          </div>

          <!-- 必需文件说明 -->
          <div class="requirements">
            <div class="req-item">
              <span class="req-icon required">●</span>
              <span class="req-text">.model3.json 或 .model.json - 模型配置文件</span>
            </div>
            <div class="req-item">
              <span class="req-icon required">●</span>
              <span class="req-text">.moc3 或 .moc - 模型数据文件</span>
            </div>
            <div class="req-item">
              <span class="req-icon required">●</span>
              <span class="req-text">.png 纹理文件</span>
            </div>
            <div class="req-item">
              <span class="req-icon optional">○</span>
              <span class="req-text">motions/ - 动作文件（可选）</span>
            </div>
            <div class="req-item">
              <span class="req-icon optional">○</span>
              <span class="req-text">expressions/ - 表情文件（可选）</span>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn secondary" @click="emit('close')">我知道了</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2100;
}

.modal-content {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  padding: 24px;
  min-width: 280px;
  max-width: 90%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.modal-title {
  font-size: 18px;
  font-weight: 500;
  color: white;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* 格式指南弹窗 */
.format-guide {
  max-width: 400px;
}

.error-section {
  background: rgba(239, 83, 80, 0.1);
  border: 1px solid rgba(239, 83, 80, 0.3);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.error-title {
  font-size: 13px;
  font-weight: 500;
  color: #ef5350;
  margin-bottom: 8px;
}

.error-list {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.error-list li {
  margin-bottom: 4px;
}

.guide-section {
  margin-bottom: 16px;
}

.guide-title {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 8px;
}

.structure-preview {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
}

.structure-preview pre {
  margin: 0;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.8);
}

.requirements {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.req-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.req-icon {
  font-size: 8px;
}

.req-icon.required {
  color: #ef5350;
}

.req-icon.optional {
  color: rgba(255, 255, 255, 0.4);
}

.req-text {
  color: rgba(255, 255, 255, 0.7);
}

/* Button */
.btn {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.btn.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9);
}
</style>
