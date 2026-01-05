<script setup lang="ts">
import { computed, ref } from "vue";
import ModelFormatGuide from "./ModelFormatGuide.vue";

// 动作组信息
export interface MotionGroupInfo {
  group: string; // 动作组名
  count: number; // 组内动作数量
}

// 模型上传结果信息
export interface ModelUploadResultInfo {
  modelName: string; // 模型名称
  expressionCount: number; // 表情数量
  motionGroups: MotionGroupInfo[]; // 动作组列表
  textureCount?: number; // 纹理文件数量
  totalFiles?: number; // 总文件数
}

const props = defineProps<{
  show: boolean;
  info: ModelUploadResultInfo | null;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
  close: [];
}>();

// 格式指南弹窗
const showFormatGuide = ref(false);

// 计算总动作数
const totalMotionCount = computed(() => {
  if (!props.info) return 0;
  return props.info.motionGroups.reduce((sum, g) => sum + g.count, 0);
});

const handleClose = () => {
  emit("update:show", false);
  emit("close");
};
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show && info" class="modal-overlay" @click.self="handleClose">
        <div class="modal-content">
          <!-- 成功图标 -->
          <div class="success-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
              />
            </svg>
          </div>

          <!-- 标题 -->
          <h2 class="modal-title">模型导入成功</h2>

          <!-- 模型名称 -->
          <div class="model-name">{{ info.modelName }}</div>

          <!-- 统计信息 -->
          <div class="stats-container">
            <!-- 表情数量 -->
            <div class="stat-item">
              <div class="stat-icon expression">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"
                  />
                </svg>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ info.expressionCount }}</div>
                <div class="stat-label">表情</div>
              </div>
            </div>

            <!-- 动作数量 -->
            <div class="stat-item">
              <div class="stat-icon motion">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"
                  />
                </svg>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ totalMotionCount }}</div>
                <div class="stat-label">动作</div>
              </div>
            </div>

            <!-- 动作组数量 -->
            <div class="stat-item">
              <div class="stat-icon groups">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"
                  />
                </svg>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ info.motionGroups.length }}</div>
                <div class="stat-label">动作组</div>
              </div>
            </div>
          </div>

          <!-- 动作组详情 -->
          <div v-if="info.motionGroups.length > 0" class="motion-groups">
            <div class="groups-title">动作组详情</div>
            <div class="groups-list">
              <div
                v-for="group in info.motionGroups"
                :key="group.group"
                class="group-item"
              >
                <span class="group-name">{{ group.group }}</span>
                <span class="group-count">{{ group.count }}</span>
              </div>
            </div>
          </div>

          <!-- 文件统计 -->
          <div v-if="info.textureCount || info.totalFiles" class="file-stats">
            <span v-if="info.textureCount">纹理: {{ info.textureCount }}</span>
            <span v-if="info.totalFiles">总文件: {{ info.totalFiles }}</span>
          </div>

          <!-- 关闭按钮 -->
          <button class="close-button" @click="handleClose">确定</button>

          <!-- 查看格式规范链接 -->
          <button class="format-guide-link" @click="showFormatGuide = true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"
              />
            </svg>
            <span>查看模型格式规范</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 模型格式指南弹窗 -->
  <ModelFormatGuide :visible="showFormatGuide" @close="showFormatGuide = false" />
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.modal-content {
  background: #1e1e2e;
  border-radius: 20px;
  padding: 24px;
  max-width: 360px;
  width: 100%;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.success-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  background: linear-gradient(135deg, #43a047, #66bb6a);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.success-icon svg {
  width: 40px;
  height: 40px;
  color: white;
}

.modal-title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
  color: #fff;
}

.model-name {
  font-size: 14px;
  color: #888;
  margin-bottom: 20px;
  word-break: break-all;
}

.stats-container {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 72px;
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon svg {
  width: 24px;
  height: 24px;
  color: white;
}

.stat-icon.expression {
  background: linear-gradient(135deg, #ff9800, #ffb74d);
}

.stat-icon.motion {
  background: linear-gradient(135deg, #2196f3, #64b5f6);
}

.stat-icon.groups {
  background: linear-gradient(135deg, #9c27b0, #ba68c8);
}

.stat-info {
  text-align: center;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.stat-label {
  font-size: 12px;
  color: #888;
}

.motion-groups {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 16px;
}

.groups-title {
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
  text-align: left;
}

.groups-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.08);
  padding: 4px 10px;
  border-radius: 16px;
  font-size: 12px;
}

.group-name {
  color: #ccc;
}

.group-count {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.file-stats {
  display: flex;
  justify-content: center;
  gap: 16px;
  font-size: 12px;
  color: #666;
  margin-bottom: 16px;
}

.close-button {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  border-radius: 12px;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  -webkit-tap-highlight-color: transparent;
}

.close-button:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
}

.close-button:active {
  transform: scale(0.98);
}

/* 格式规范链接 */
.format-guide-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s;
  text-decoration: underline;
  text-underline-offset: 2px;
  -webkit-tap-highlight-color: transparent;
}

.format-guide-link:hover {
  color: rgba(255, 255, 255, 0.8);
}

.format-guide-link svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* 动画 */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9);
  opacity: 0;
}
</style>
