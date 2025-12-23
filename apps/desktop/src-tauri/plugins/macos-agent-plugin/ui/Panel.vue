<!--
  macOS Agent 插件 UI 面板
  
  此组件显示在侧边栏，提供：
  - 权限管理（备忘录读取、创建、编辑、删除）
  - 权限状态显示
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/tauri'

// 插件 ID
const props = defineProps<{
  pluginId: string
}>()

// 权限状态
interface Permissions {
  notes: {
    read: boolean
    create: boolean
    edit: boolean
    delete: boolean
  }
}

const permissions = ref<Permissions>({
  notes: {
    read: false,
    create: false,
    edit: false,
    delete: false,
  },
})

const isLoading = ref(false)
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)

// 加载当前配置
const loadConfig = async () => {
  try {
    isLoading.value = true
    error.value = null

    // 通过调用一个工具来获取配置（或者直接读取配置）
    // 由于插件系统可能没有直接读取配置的接口，我们先尝试读取
    // 如果失败，使用默认值
    const result = await invoke<{ success: boolean; data: any; error?: string }>(
      'plugin_execute_tool',
      {
        pluginId: props.pluginId,
        toolName: 'get_config', // 这个工具需要我们在插件中添加
        arguments: {},
      }
    ).catch(() => null)

    if (result?.success && result.data?.permissions) {
      permissions.value = result.data.permissions
    }
  } catch (e) {
    // 忽略错误，使用默认值
    console.log('加载配置失败，使用默认值:', e)
  } finally {
    isLoading.value = false
  }
}

// 保存配置
const saveConfig = async () => {
  try {
    isLoading.value = true
    error.value = null
    successMessage.value = null

    await invoke('plugin_set_config', {
      pluginId: props.pluginId,
      config: {
        permissions: permissions.value,
      },
    })

    successMessage.value = '权限设置已保存'
    
    // 3 秒后清除成功消息
    setTimeout(() => {
      successMessage.value = null
    }, 3000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isLoading.value = false
  }
}

// 切换权限
const togglePermission = async (category: 'notes', permission: 'read' | 'create' | 'edit' | 'delete') => {
  permissions.value[category][permission] = !permissions.value[category][permission]
  // 自动保存
  await saveConfig()
}

// 初始化
onMounted(async () => {
  await loadConfig()
})
</script>

<template>
  <div class="agent-panel">
    <!-- 标题栏 -->
    <div class="panel-header">
      <svg class="panel-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
      <span class="panel-title">macOS 应用代理</span>
    </div>

    <!-- 成功消息 -->
    <div v-if="successMessage" class="success-msg">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
      {{ successMessage }}
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 权限设置 -->
    <div class="permissions-section">
      <div class="section-title">备忘录权限</div>
      <div class="section-desc">控制桌宠对备忘录应用的访问权限</div>

      <!-- 读取权限 -->
      <div class="permission-item">
        <div class="permission-info">
          <div class="permission-name">读取备忘录</div>
          <div class="permission-desc">允许桌宠读取你的备忘录列表和内容</div>
        </div>
        <label class="permission-switch">
          <input
            type="checkbox"
            :checked="permissions.notes.read"
            @change="togglePermission('notes', 'read')"
            :disabled="isLoading"
          />
          <span class="switch-slider"></span>
        </label>
      </div>

      <!-- 创建权限 -->
      <div class="permission-item">
        <div class="permission-info">
          <div class="permission-name">创建备忘录</div>
          <div class="permission-desc">允许桌宠创建新的备忘录（计划中）</div>
        </div>
        <label class="permission-switch">
          <input
            type="checkbox"
            :checked="permissions.notes.create"
            @change="togglePermission('notes', 'create')"
            :disabled="isLoading"
          />
          <span class="switch-slider"></span>
        </label>
      </div>

      <!-- 编辑权限 -->
      <div class="permission-item">
        <div class="permission-info">
          <div class="permission-name">编辑备忘录</div>
          <div class="permission-desc">允许桌宠修改现有备忘录（计划中）</div>
        </div>
        <label class="permission-switch">
          <input
            type="checkbox"
            :checked="permissions.notes.edit"
            @change="togglePermission('notes', 'edit')"
            :disabled="isLoading"
          />
          <span class="switch-slider"></span>
        </label>
      </div>

      <!-- 删除权限 -->
      <div class="permission-item">
        <div class="permission-info">
          <div class="permission-name">删除备忘录</div>
          <div class="permission-desc">允许桌宠删除备忘录（计划中）</div>
        </div>
        <label class="permission-switch">
          <input
            type="checkbox"
            :checked="permissions.notes.delete"
            @change="togglePermission('notes', 'delete')"
            :disabled="isLoading"
          />
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>

    <!-- 提示信息 -->
    <div class="info-box">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <div class="info-content">
        <div class="info-title">使用提示</div>
        <div class="info-text">
          启用权限后，你可以直接询问桌宠：
          <ul>
            <li>"读取我的备忘录"</li>
            <li>"我的备忘录里有什么？"</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 加载指示器 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="spinner"></div>
    </div>
  </div>
</template>

<style scoped>
.agent-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(26, 26, 46, 0.98);
  color: white;
  font-size: 13px;
  position: relative;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-icon {
  width: 20px;
  height: 20px;
  color: #667eea;
}

.panel-title {
  font-weight: 500;
}

.success-msg {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 16px;
  padding: 10px 12px;
  background: rgba(76, 175, 80, 0.1);
  border: 1px solid rgba(76, 175, 80, 0.3);
  border-radius: 6px;
  color: #4caf50;
  font-size: 12px;
}

.success-msg svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.error-msg {
  margin: 0 16px 12px;
  padding: 8px 12px;
  background: rgba(239, 83, 80, 0.1);
  border: 1px solid rgba(239, 83, 80, 0.3);
  border-radius: 6px;
  color: #ef5350;
  font-size: 12px;
}

.permissions-section {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
  color: white;
}

.section-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 16px;
}

.permission-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s ease;
}

.permission-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.permission-info {
  flex: 1;
  min-width: 0;
}

.permission-name {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  color: white;
}

.permission-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.4;
}

/* Switch 样式 */
.permission-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.permission-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
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

.switch-slider:before {
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

.permission-switch input:checked + .switch-slider {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.permission-switch input:checked + .switch-slider:before {
  transform: translateX(20px);
}

.permission-switch input:disabled + .switch-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.info-box {
  margin: 16px;
  padding: 12px;
  background: rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 8px;
  display: flex;
  gap: 12px;
}

.info-box svg {
  width: 20px;
  height: 20px;
  color: #667eea;
  flex-shrink: 0;
  margin-top: 2px;
}

.info-content {
  flex: 1;
}

.info-title {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #a5b4fc;
}

.info-text {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
}

.info-text ul {
  margin: 6px 0 0 0;
  padding-left: 20px;
}

.info-text li {
  margin-bottom: 4px;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(26, 26, 46, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>



