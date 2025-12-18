<script setup lang="ts">
/**
 * 插件管理面板
 *
 * 提供插件的安装、启用、禁用、卸载等管理功能
 */

import { ref, onMounted, computed } from "vue";
import { marked } from "marked";
import { usePluginSystem } from "./usePluginSystem";
import type { PluginInfo } from "./types";

const emit = defineEmits<{
  close: [];
}>();

const {
  plugins,
  isLoading,
  error,
  initialize,
  installPlugin,
  uninstallPlugin,
  togglePlugin,
  openPluginWindow,
  readPluginReadme,
} = usePluginSystem();

// 当前选中的插件（用于显示详情）
const selectedPlugin = ref<PluginInfo | null>(null);
const readmeContent = ref<string>("");
const isLoadingReadme = ref(false);

// 是否显示详情视图
const showDetail = computed(() => selectedPlugin.value !== null);

// 判断插件是否有可打开的窗口
const hasWindows = (plugin: PluginInfo) => {
  return plugin.ui?.windows && Object.keys(plugin.ui.windows).length > 0;
};

// 获取插件的第一个窗口名称
const getFirstWindowName = (plugin: PluginInfo): string | null => {
  if (!plugin.ui?.windows) return null;
  const windowNames = Object.keys(plugin.ui.windows);
  return windowNames.length > 0 ? windowNames[0] : null;
};

// 打开插件窗口
const handleOpenWindow = async (plugin: PluginInfo) => {
  const windowName = getFirstWindowName(plugin);
  if (!windowName) return;

  const windowConfig = plugin.ui?.windows?.[windowName];
  const title = windowConfig?.title || plugin.name;

  try {
    console.log("打开插件窗口:", plugin.name, windowName, title);
    await openPluginWindow(plugin.id, windowName, title);
  } catch (e) {
    console.error("打开插件窗口失败:", e);
  }
};

// 选择插件查看详情
const selectPlugin = async (plugin: PluginInfo) => {
  selectedPlugin.value = plugin;
  readmeContent.value = "";
  isLoadingReadme.value = true;

  try {
    const content = await readPluginReadme(plugin.id);
    if (content) {
      // 使用 marked 渲染 markdown
      readmeContent.value = await marked(content);
    } else {
      readmeContent.value = `<p class="no-readme">此插件暂无使用说明</p>`;
    }
  } catch (e) {
    console.error("读取 README 失败:", e);
    readmeContent.value = `<p class="readme-error">读取说明文档失败</p>`;
  } finally {
    isLoadingReadme.value = false;
  }
};

// 返回列表
const backToList = () => {
  selectedPlugin.value = null;
  readmeContent.value = "";
};

// 确认对话框
const showConfirmDialog = ref(false);
const confirmAction = ref<"uninstall" | null>(null);
const confirmPluginId = ref<string | null>(null);
const confirmPluginName = ref<string>("");

onMounted(() => {
  initialize();
});

// 安装插件
const handleInstall = async () => {
  const info = await installPlugin();
  if (info) {
    console.log("插件安装成功:", info.name);
  }
};

// 切换插件状态
const handleToggle = async (plugin: PluginInfo) => {
  await togglePlugin(plugin.id, !plugin.enabled);
};

// 确认卸载
const confirmUninstall = (plugin: PluginInfo) => {
  confirmAction.value = "uninstall";
  confirmPluginId.value = plugin.id;
  confirmPluginName.value = plugin.name;
  showConfirmDialog.value = true;
};

// 执行确认操作
const executeConfirm = async () => {
  if (confirmAction.value === "uninstall" && confirmPluginId.value) {
    await uninstallPlugin(confirmPluginId.value);
  }
  showConfirmDialog.value = false;
  confirmAction.value = null;
  confirmPluginId.value = null;
};

// 取消确认
const cancelConfirm = () => {
  showConfirmDialog.value = false;
  confirmAction.value = null;
  confirmPluginId.value = null;
};
</script>

<template>
  <div class="plugin-manager">
    <div class="pm-header">
      <template v-if="showDetail">
        <button class="pm-back-btn" @click="backToList">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        <h2>{{ selectedPlugin?.name }}</h2>
      </template>
      <template v-else>
        <h2>插件管理</h2>
      </template>
      <button class="pm-close-btn" @click="emit('close')">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
          />
        </svg>
      </button>
    </div>

    <!-- 详情视图 -->
    <template v-if="showDetail && selectedPlugin">
      <div class="pm-detail">
        <!-- 插件信息头部 -->
        <div class="pm-detail-header">
          <div class="pm-detail-icon">
            {{ selectedPlugin.name.charAt(0).toUpperCase() }}
          </div>
          <div class="pm-detail-info">
            <div class="pm-detail-name">{{ selectedPlugin.name }}</div>
            <div class="pm-detail-meta">
              <span>v{{ selectedPlugin.version }}</span>
              <span>{{ selectedPlugin.author }}</span>
            </div>
            <div class="pm-detail-desc">{{ selectedPlugin.description }}</div>
          </div>
          <div class="pm-detail-actions">
            <button
              v-if="hasWindows(selectedPlugin) && selectedPlugin.enabled"
              class="pm-open-btn"
              @click="handleOpenWindow(selectedPlugin)"
              title="打开"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"
                />
              </svg>
            </button>
            <label class="pm-switch">
              <input
                type="checkbox"
                :checked="selectedPlugin.enabled"
                @change="handleToggle(selectedPlugin)"
              />
              <span class="pm-switch-slider"></span>
            </label>
          </div>
        </div>

        <!-- README 内容 -->
        <div class="pm-readme">
          <div class="pm-readme-title">使用说明</div>
          <div v-if="isLoadingReadme" class="pm-readme-loading">
            <div class="pm-spinner"></div>
            <span>加载中...</span>
          </div>
          <div
            v-else
            class="pm-readme-content markdown-body"
            v-html="readmeContent"
          ></div>
        </div>
      </div>
    </template>

    <!-- 列表视图 -->
    <template v-else>
      <div class="pm-toolbar">
        <button
          class="pm-install-btn"
          @click="handleInstall"
          :disabled="isLoading"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          安装插件
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="pm-error">
        {{ error }}
      </div>

      <!-- 加载状态 -->
      <div v-if="isLoading" class="pm-loading">
        <div class="pm-spinner"></div>
        <span>加载中...</span>
      </div>

      <!-- 插件列表 -->
      <div class="pm-list">
        <div v-if="plugins.length === 0 && !isLoading" class="pm-empty">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
            />
          </svg>
          <p>暂无已安装的插件</p>
          <p class="pm-hint">点击上方按钮安装插件</p>
        </div>

        <div
          v-for="plugin in plugins"
          :key="plugin.id"
          class="pm-item"
          :class="{ enabled: plugin.enabled }"
          @click="selectPlugin(plugin)"
        >
          <div class="pm-item-icon">
            {{ plugin.name.charAt(0).toUpperCase() }}
          </div>

          <div class="pm-item-info">
            <div class="pm-item-name">{{ plugin.name }}</div>
            <div class="pm-item-meta">
              <span class="pm-item-version">v{{ plugin.version }}</span>
              <span class="pm-item-author">{{ plugin.author }}</span>
            </div>
            <div class="pm-item-desc">{{ plugin.description }}</div>
          </div>

          <div class="pm-item-actions" @click.stop>
            <!-- 打开窗口按钮 -->
            <button
              v-if="hasWindows(plugin) && plugin.enabled"
              class="pm-open-btn"
              @click="handleOpenWindow(plugin)"
              title="打开"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"
                />
              </svg>
            </button>

            <!-- 启用/禁用开关 -->
            <label class="pm-switch">
              <input
                type="checkbox"
                :checked="plugin.enabled"
                @change="handleToggle(plugin)"
              />
              <span class="pm-switch-slider"></span>
            </label>

            <!-- 卸载按钮 -->
            <button
              class="pm-delete-btn"
              @click="confirmUninstall(plugin)"
              title="卸载插件"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 确认对话框 -->
    <Teleport to="body">
      <Transition name="pm-modal">
        <div
          v-if="showConfirmDialog"
          class="pm-modal-overlay"
          @click="cancelConfirm"
        >
          <div class="pm-modal" @click.stop>
            <div class="pm-modal-title">确认卸载</div>
            <div class="pm-modal-body">
              确定要卸载插件 "{{ confirmPluginName }}" 吗？此操作无法撤销。
            </div>
            <div class="pm-modal-actions">
              <button class="pm-modal-btn" @click="cancelConfirm">取消</button>
              <button
                class="pm-modal-btn pm-modal-btn-danger"
                @click="executeConfirm"
              >
                卸载
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.plugin-manager {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(26, 26, 46, 0.98);
  color: white;
}

.pm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.pm-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  flex: 1;
}

.pm-back-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  margin-right: 12px;
}

.pm-back-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.pm-back-btn svg {
  width: 20px;
  height: 20px;
  color: white;
}

.pm-close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.pm-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.pm-close-btn svg {
  width: 20px;
  height: 20px;
  color: white;
}

.pm-toolbar {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.pm-install-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pm-install-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.pm-install-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pm-install-btn svg {
  width: 20px;
  height: 20px;
}

.pm-error {
  margin: 16px 20px;
  padding: 12px 16px;
  background: rgba(239, 83, 80, 0.1);
  border: 1px solid rgba(239, 83, 80, 0.3);
  border-radius: 8px;
  color: #ef5350;
  font-size: 14px;
}

.pm-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: rgba(255, 255, 255, 0.6);
}

.pm-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.pm-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.pm-empty {
  text-align: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.6);
}

.pm-empty svg {
  width: 48px;
  height: 48px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.pm-empty p {
  margin: 0 0 8px;
}

.pm-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

.pm-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  margin-bottom: 12px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.pm-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.pm-item.enabled {
  border-color: rgba(102, 126, 234, 0.3);
}

.pm-item-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  flex-shrink: 0;
}

.pm-item-info {
  flex: 1;
  min-width: 0;
}

.pm-item-name {
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 4px;
}

.pm-item-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 6px;
}

.pm-item-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-item-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Switch 样式 */
.pm-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.pm-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.pm-switch-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.2);
  transition: 0.3s;
  border-radius: 24px;
}

.pm-switch-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.pm-switch input:checked + .pm-switch-slider {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.pm-switch input:checked + .pm-switch-slider:before {
  transform: translateX(20px);
}

.pm-open-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: rgba(102, 126, 234, 0.15);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.pm-open-btn:hover {
  background: rgba(102, 126, 234, 0.3);
  transform: translateY(-1px);
}

.pm-open-btn svg {
  width: 18px;
  height: 18px;
  color: #667eea;
}

.pm-delete-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: rgba(239, 83, 80, 0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.pm-delete-btn:hover {
  background: rgba(239, 83, 80, 0.2);
}

.pm-delete-btn svg {
  width: 18px;
  height: 18px;
  color: #ef5350;
}

/* Modal 样式 */
.pm-modal-overlay {
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
  z-index: 1000;
}

.pm-modal {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  padding: 24px;
  min-width: 320px;
  max-width: 90%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.pm-modal-title {
  font-size: 18px;
  font-weight: 500;
  color: white;
  margin-bottom: 12px;
}

.pm-modal-body {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
  margin-bottom: 20px;
}

.pm-modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.pm-modal-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.pm-modal-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.pm-modal-btn-danger {
  background: linear-gradient(135deg, #ef5350 0%, #c62828 100%);
}

.pm-modal-btn-danger:hover {
  box-shadow: 0 4px 12px rgba(239, 83, 80, 0.4);
}

/* Modal 动画 */
.pm-modal-enter-active,
.pm-modal-leave-active {
  transition: all 0.3s ease;
}

.pm-modal-enter-from,
.pm-modal-leave-to {
  opacity: 0;
}

.pm-modal-enter-from .pm-modal,
.pm-modal-leave-to .pm-modal {
  transform: scale(0.9);
}

/* 详情视图样式 */
.pm-detail {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.pm-detail-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  margin-bottom: 20px;
}

.pm-detail-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 600;
  flex-shrink: 0;
}

.pm-detail-info {
  flex: 1;
  min-width: 0;
}

.pm-detail-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 6px;
}

.pm-detail-meta {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 8px;
}

.pm-detail-desc {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
}

.pm-detail-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* README 样式 */
.pm-readme {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 20px;
}

.pm-readme-title {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.pm-readme-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: rgba(255, 255, 255, 0.5);
}

.pm-readme-content {
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.7;
  font-size: 14px;
}

/* Markdown 内容样式 */
.pm-readme-content :deep(h1) {
  font-size: 1.5em;
  font-weight: 600;
  margin: 0 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.pm-readme-content :deep(h2) {
  font-size: 1.3em;
  font-weight: 600;
  margin: 24px 0 12px;
  color: rgba(255, 255, 255, 0.9);
}

.pm-readme-content :deep(h3) {
  font-size: 1.1em;
  font-weight: 600;
  margin: 20px 0 10px;
  color: rgba(255, 255, 255, 0.85);
}

.pm-readme-content :deep(p) {
  margin: 0 0 12px;
}

.pm-readme-content :deep(ul),
.pm-readme-content :deep(ol) {
  margin: 0 0 12px;
  padding-left: 24px;
}

.pm-readme-content :deep(li) {
  margin-bottom: 6px;
}

.pm-readme-content :deep(code) {
  background: rgba(102, 126, 234, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.9em;
  color: #a5b4fc;
}

.pm-readme-content :deep(pre) {
  background: rgba(0, 0, 0, 0.3);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0 0 16px;
}

.pm-readme-content :deep(pre code) {
  background: none;
  padding: 0;
  color: rgba(255, 255, 255, 0.85);
}

.pm-readme-content :deep(blockquote) {
  border-left: 3px solid #667eea;
  padding-left: 16px;
  margin: 0 0 16px;
  color: rgba(255, 255, 255, 0.7);
  font-style: italic;
}

.pm-readme-content :deep(a) {
  color: #667eea;
  text-decoration: none;
}

.pm-readme-content :deep(a:hover) {
  text-decoration: underline;
}

.pm-readme-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 16px;
}

.pm-readme-content :deep(th),
.pm-readme-content :deep(td) {
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  text-align: left;
}

.pm-readme-content :deep(th) {
  background: rgba(255, 255, 255, 0.05);
  font-weight: 500;
}

.pm-readme-content :deep(hr) {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin: 20px 0;
}

.pm-readme-content :deep(.no-readme),
.pm-readme-content :deep(.readme-error) {
  text-align: center;
  padding: 40px;
  color: rgba(255, 255, 255, 0.5);
}

.pm-readme-content :deep(.readme-error) {
  color: #ef5350;
}

/* 插件列表项悬停效果增强 */
.pm-item {
  cursor: pointer;
}

.pm-item:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateX(4px);
}
</style>
