<script setup lang="ts">
import { ref } from "vue";
import { appWindow } from "@tauri-apps/api/window";

defineProps<{
  isLocked: boolean;
}>();

const emit = defineEmits<{
  "toggle-lock": [];
}>();

const isAlwaysOnTop = ref(true);

// 开始拖拽窗口
const startDrag = async () => {
  await appWindow.startDragging();
};

// 切换置顶状态
const toggleAlwaysOnTop = async () => {
  isAlwaysOnTop.value = !isAlwaysOnTop.value;
  await appWindow.setAlwaysOnTop(isAlwaysOnTop.value);
};

// 最小化窗口
const minimize = async () => {
  await appWindow.minimize();
};

// 关闭窗口
const close = async () => {
  await appWindow.close();
};
</script>

<template>
  <div class="window-controls-wrapper">
    <!-- 只保留控制按钮，不遮挡整个顶部 -->
    <div class="window-controls">
      <button
        class="control-btn lock"
        :class="{ active: isLocked }"
        @click="emit('toggle-lock')"
        title="锁定交互"
      >
        {{ isLocked ? "🔒" : "🔓" }}
      </button>
      <button
        class="control-btn pin"
        :class="{ active: isAlwaysOnTop }"
        @click="toggleAlwaysOnTop"
        title="置顶"
      >
        📌
      </button>
      <button class="control-btn" @click="minimize" title="最小化">─</button>
      <button class="control-btn close" @click="close" title="关闭">✕</button>
    </div>
    <!-- 拖拽区域放在中间，不影响其他按钮 -->
    <div
      class="drag-handle"
      data-tauri-drag-region
      @mousedown="startDrag"
    ></div>
  </div>
</template>

<style scoped>
.window-controls {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  z-index: 100;
}

.drag-handle {
  position: absolute;
  margin-top: 15px;
  margin-left: 50%;
  transform: translateX(-50%);
  width: 50px;
  height: 6px;
  cursor: grab;
  z-index: 99;
  background-color: rgb(93, 90, 90);
  border-radius: 10px;
  -webkit-app-region: drag;
}

.drag-handle:active {
  cursor: grabbing;
}

.control-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.3);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: all 0.2s;
  backdrop-filter: blur(4px);
}

.control-btn:hover {
  background: rgba(0, 0, 0, 0.5);
}

.control-btn.pin.active {
  background: rgba(255, 200, 0, 0.4);
  color: #ffcc00;
}

.control-btn.lock.active {
  background: rgba(76, 175, 80, 0.4);
  color: #4caf50;
}

.control-btn.close:hover {
  background: rgba(255, 0, 0, 0.6);
  color: white;
}
</style>
