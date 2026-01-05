<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSettings, useServerDiscovery, useP2P, useChatHistory, DEFAULT_PET_PROMPT, PRESET_BACKGROUNDS } from '@desktopfriends/core'
import { ModelFormatGuide, ModelUploadResult, type ModelUploadResultInfo } from '@desktopfriends/ui'
import { useModelUpload } from '../composables/useModelUpload'

const emit = defineEmits<{
  back: []
}>()

const {
  settings,
  resetSettings,
  getLLMConfig,
  pets,
  currentPet,
  addPet,
  removePet,
  switchPet,
  updatePet,
  duplicatePet,
  updateSetting,
  setPresetBackground,
  clearCustomBackground,
} = useSettings()

const {
  servers: discoveredServers,
  isScanning,
  progress: scanProgress,
  quickScan,
  testServer,
  stopScan,
} = useServerDiscovery()

// P2P 连接状态
const p2p = useP2P()

// 聊天历史记录
const { chatHistory, stats: chatStats, exportHistory, clearHistory: clearChatHistory } = useChatHistory()

// 模型上传
const {
  isUploading: isUploadingModel,
  uploadProgress,
  selectModelFile,
  uploadModel,
  getUploadedModels,
  getModelPath,
  deleteModel,
} = useModelUpload()

// 已上传的模型列表
const uploadedModels = ref<string[]>([])

// 加载已上传的模型列表
const loadUploadedModels = async () => {
  uploadedModels.value = await getUploadedModels()
}

// 组件挂载时加载模型列表
onMounted(() => {
  loadUploadedModels()
})

// 使用 computed 确保响应式追踪
const isServerConnected = computed(() => p2p.isConnected.value && p2p.isRegistered.value)
const onlinePetsCount = computed(() => p2p.onlinePets.value.length)

// LLM 配置状态
const isLLMConfigured = computed(() => !!settings.value.llmApiKey)
const llmStatusText = computed(() => {
  if (!settings.value.llmApiKey) return '未配置'
  const provider = llmProviders.find(p => p.value === settings.value.llmProvider)
  return provider?.label || settings.value.llmProvider
})

// 服务器状态文本
const serverStatusText = computed(() => {
  if (!settings.value.serverUrl) return '未配置'
  if (p2p.isConnected.value) {
    return p2p.isRegistered.value ? '已连接' : '连接中...'
  }
  return '未连接'
})

// 当前选中的预设背景
const currentPresetBackground = computed(() => {
  if (settings.value.backgroundType === 'preset' && settings.value.backgroundPreset) {
    return PRESET_BACKGROUNDS.find(
      (p: { id: string; name: string; value: string }) => p.id === settings.value.backgroundPreset
    )
  }
  return null
})

const showSnackbar = ref(false)
const snackbarMessage = ref('')
const snackbarType = ref<'success' | 'error' | 'info'>('success')

// 显示消息
const showMessage = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
  snackbarMessage.value = message
  snackbarType.value = type
  showSnackbar.value = true
  setTimeout(() => {
    showSnackbar.value = false
  }, 3000)
}

// 格式指南弹窗
const showFormatGuide = ref(false)
const uploadErrorDetails = ref<string[]>([])

// 模型上传结果
const showModelUploadResult = ref(false)
const modelUploadInfo = ref<ModelUploadResultInfo | null>(null)

const llmProviders = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'custom', label: '自定义' },
]

const showApiKeyHint = computed(() => {
  switch (settings.value.llmProvider) {
    case 'openai':
      return '以 sk- 开头的 API Key'
    case 'claude':
      return '以 sk-ant- 开头的 API Key'
    case 'deepseek':
      return 'DeepSeek API Key'
    default:
      return '输入你的 API Key'
  }
})

const showBaseUrlHint = computed(() => {
  switch (settings.value.llmProvider) {
    case 'openai':
      return '默认: https://api.openai.com/v1/chat/completions'
    case 'claude':
      return '默认: https://api.anthropic.com/v1/messages'
    case 'deepseek':
      return '默认: https://api.deepseek.com/v1/chat/completions'
    default:
      return '完整的 API 端点 URL'
  }
})

const testConnection = async () => {
  if (!settings.value.llmApiKey) {
    showMessage('请先输入 API Key', 'error')
    return
  }

  if (settings.value.llmProvider === 'custom' && !settings.value.llmBaseUrl) {
    showMessage('自定义 API 需要填写 API 地址', 'error')
    return
  }

  showMessage('测试连接中...', 'info')

  try {
    const config = getLLMConfig()
    let url = config.baseUrl
    let headers: Record<string, string> = {}

    if (config.provider === 'openai' || config.provider === 'deepseek') {
      url = url || (config.provider === 'openai'
        ? 'https://api.openai.com/v1/models'
        : 'https://api.deepseek.com/v1/models')
      headers = { Authorization: `Bearer ${config.apiKey}` }
    } else if (config.provider === 'claude') {
      showMessage('Claude API Key 已保存，发送消息时验证', 'success')
      return
    } else if (config.provider === 'custom') {
      url = config.baseUrl!.replace('/chat/completions', '/models')
      headers = { Authorization: `Bearer ${config.apiKey}` }
    }

    const response = await fetch(url!, { headers, method: 'GET' })

    if (response.ok) {
      showMessage('连接成功！', 'success')
    } else {
      showMessage(`连接失败: ${response.status}`, 'error')
    }
  } catch (e) {
    showMessage('连接失败，请检查网络或代理设置', 'error')
  }
}

const handleReset = () => {
  resetSettings()
  showMessage('设置已重置', 'info')
}

// 恢复默认人设
const resetPrompt = () => {
  updatePet(currentPet.value.id, { prompt: DEFAULT_PET_PROMPT })
  showMessage('已恢复默认人设', 'success')
}

// ===== 宠物管理 =====
const showDeleteConfirm = ref(false)
const petToDelete = ref<string | null>(null)

const handleAddPet = () => {
  const newPet = addPet()
  switchPet(newPet.id)
  showMessage(`已创建新宠物: ${newPet.name}`, 'success')
}

const handleSwitchPet = (petId: string) => {
  if (petId === currentPet.value.id) return
  switchPet(petId)
  showMessage(`已切换到: ${currentPet.value.name}`, 'success')
}

const confirmDeletePet = (petId: string) => {
  if (pets.value.length <= 1) {
    showMessage('至少保留一个宠物', 'error')
    return
  }
  petToDelete.value = petId
  showDeleteConfirm.value = true
}

const handleDeletePet = () => {
  if (petToDelete.value) {
    const petName = pets.value.find(p => p.id === petToDelete.value)?.name
    removePet(petToDelete.value)
    showMessage(`已删除: ${petName}`, 'info')
  }
  showDeleteConfirm.value = false
  petToDelete.value = null
}

const handleDuplicatePet = (petId: string) => {
  const newPet = duplicatePet(petId)
  if (newPet) {
    switchPet(newPet.id)
    showMessage(`已复制: ${newPet.name}`, 'success')
  }
}

// ===== 模型上传相关 =====
const showDeleteModelConfirm = ref(false)
const modelToDelete = ref<string | null>(null)

// 触发模型上传
const handleUploadModel = async () => {
  const filePath = await selectModelFile()
  if (!filePath) return

  // 从文件路径提取模型名称
  const fileName = filePath.split('/').pop()?.split('\\').pop() || ''
  const modelName = fileName.replace('.zip', '') || `model_${Date.now()}`

  showMessage('正在上传模型...', 'info')
  const result = await uploadModel(filePath, modelName)

  if (result) {
    // 更新当前宠物的模型路径
    updatePet(currentPet.value.id, { modelPath: result.path })
    await loadUploadedModels()

    // 显示上传结果对话框
    modelUploadInfo.value = {
      modelName: result.info.modelName,
      expressionCount: result.info.expressionCount,
      motionGroups: result.info.motionGroups,
      textureCount: result.info.textureCount,
      totalFiles: result.info.totalFiles,
    }
    showModelUploadResult.value = true
  } else {
    // 解析错误信息
    const errorMsg = uploadProgress.value.message || '上传失败'
    if (errorMsg.includes('压缩包格式不符合要求')) {
      // 提取错误详情
      const lines = errorMsg.split('\n').filter((l) => l.startsWith('缺少'))
      uploadErrorDetails.value = lines
      showFormatGuide.value = true
    } else {
      showMessage(errorMsg, 'error')
    }
  }
}

// 使用已上传的模型
const useUploadedModel = async (modelName: string) => {
  const path = await getModelPath(modelName)
  if (path) {
    updatePet(currentPet.value.id, { modelPath: path })
    showMessage(`已切换到模型: ${modelName}`, 'success')
  } else {
    showMessage('无法获取模型路径', 'error')
  }
}

// 确认删除模型
const confirmDeleteModel = (modelName: string) => {
  modelToDelete.value = modelName
  showDeleteModelConfirm.value = true
}

// 删除模型
const handleDeleteModel = async () => {
  if (modelToDelete.value) {
    const success = await deleteModel(modelToDelete.value)
    if (success) {
      showMessage(`已删除模型: ${modelToDelete.value}`, 'info')
      await loadUploadedModels()
    } else {
      showMessage('删除失败', 'error')
    }
  }
  showDeleteModelConfirm.value = false
  modelToDelete.value = null
}

// 扫描局域网服务器
const handleScanServers = async () => {
  showMessage('正在扫描局域网...', 'info')
  await quickScan()
  if (discoveredServers.value.length > 0) {
    showMessage(`找到 ${discoveredServers.value.length} 个服务器`, 'success')
  } else {
    showMessage('未找到服务器', 'error')
  }
}

// 选择发现的服务器
const selectServer = (server: { url: string; ip: string }) => {
  updateSetting('serverUrl', server.url)
  showMessage(`已选择: ${server.ip}`, 'success')
}

// 测试当前服务器连接
const testServerConnection = async () => {
  if (!settings.value.serverUrl) {
    showMessage('请先输入或选择服务器地址', 'error')
    return
  }

  showMessage('测试连接中...', 'info')
  const result = await testServer(settings.value.serverUrl)
  if (result) {
    showMessage(`连接成功！当前有 ${result.pets} 只宠物在线`, 'success')
  } else {
    showMessage('连接失败，请检查服务器地址', 'error')
  }
}

// ===== 聊天记录相关 =====
const handleExportJSON = () => {
  if (chatHistory.value.length === 0) {
    showMessage('暂无聊天记录可导出', 'error')
    return
  }
  exportHistory('json')
  showMessage(`已导出 ${chatStats.value.total} 条聊天记录`, 'success')
}

const handleExportText = () => {
  if (chatHistory.value.length === 0) {
    showMessage('暂无聊天记录可导出', 'error')
    return
  }
  exportHistory('text')
  showMessage(`已导出 ${chatStats.value.total} 条聊天记录`, 'success')
}

const showClearChatConfirm = ref(false)

const handleClearChatHistory = () => {
  clearChatHistory()
  showClearChatConfirm.value = false
  showMessage('聊天记录已清空', 'info')
}

// ===== 背景设置相关 =====
const selectPresetBackground = (presetId: string) => {
  setPresetBackground(presetId)
  showMessage('背景已更新', 'success')
}

const handleClearBackground = () => {
  clearCustomBackground()
  showMessage('已恢复默认背景', 'info')
}
</script>

<template>
  <div class="settings-view">
    <!-- Header -->
    <header class="header">
      <button class="back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
      </button>
      <h1>设置</h1>
    </header>

    <!-- 状态栏 -->
    <div class="status-bar">
      <div class="status-item">
        <div class="status-icon" :class="{ active: isServerConnected }">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>
        <div class="status-info">
          <span class="status-label">中继服务器</span>
          <span class="status-value" :class="{ connected: isServerConnected }">
            {{ serverStatusText }}
          </span>
        </div>
      </div>

      <div class="status-divider"></div>

      <div class="status-item">
        <div class="status-icon" :class="{ active: isLLMConfigured }">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.8-9.88-.1-2.73 2.71-2.73 7.08 0 9.79s7.15 2.71 9.88 0C18.32 15.65 19 14.08 19 12.1h2c0 1.98-.88 4.55-2.64 6.29-3.51 3.48-9.21 3.48-12.72 0-3.5-3.47-3.53-9.11-.02-12.58s9.14-3.47 12.65 0L21 3v7.12zM12.5 8v4.25l3.5 2.08-.72 1.21L11 13V8h1.5z"/>
          </svg>
        </div>
        <div class="status-info">
          <span class="status-label">大模型 API</span>
          <span class="status-value" :class="{ connected: isLLMConfigured }">
            {{ llmStatusText }}
          </span>
        </div>
      </div>

      <div class="status-divider"></div>

      <div class="status-item">
        <div class="status-icon pets">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
        <div class="status-info">
          <span class="status-label">在线宠物</span>
          <span class="status-value pets">
            {{ onlinePetsCount }} 只
          </span>
        </div>
      </div>
    </div>

    <!-- Content -->
    <main class="content">
      <!-- 宠物设置 -->
      <div class="card">
        <div class="card-title">宠物</div>

        <!-- 宠物列表 -->
        <div class="pet-selector">
          <div class="pet-list-scroll">
            <div
              v-for="pet in pets"
              :key="pet.id"
              class="pet-card"
              :class="{ active: pet.id === currentPet.id }"
              @click="handleSwitchPet(pet.id)"
            >
              <div class="pet-avatar">
                {{ pet.name.charAt(0) }}
              </div>
              <div class="pet-card-name">{{ pet.name }}</div>
              <div class="pet-card-actions" v-if="pet.id === currentPet.id">
                <button class="pet-action-btn" @click.stop="handleDuplicatePet(pet.id)" title="复制">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                  </svg>
                </button>
                <button class="pet-action-btn delete" @click.stop="confirmDeletePet(pet.id)" title="删除">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            </div>
            <!-- 添加新宠物 -->
            <div class="pet-card add-pet" @click="handleAddPet">
              <div class="add-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </div>
              <div class="pet-card-name">添加</div>
            </div>
          </div>
        </div>

        <div class="input-group">
          <label>宠物名称</label>
          <input
            type="text"
            :value="currentPet.name"
            @input="updatePet(currentPet.id, { name: ($event.target as HTMLInputElement).value })"
            placeholder="输入宠物名称"
          />
        </div>

        <div class="input-group">
          <label>模型路径</label>
          <input
            type="text"
            :value="currentPet.modelPath"
            @input="updatePet(currentPet.id, { modelPath: ($event.target as HTMLInputElement).value })"
            placeholder="/modules/xxx/xxx.model3.json"
          />
          <span class="hint">Live2D 模型文件路径，上传 zip 模型包或手动输入路径</span>
        </div>

        <!-- 模型上传区域 -->
        <div class="button-row">
          <button
            class="btn primary"
            @click="handleUploadModel"
            :disabled="isUploadingModel"
          >
            {{ isUploadingModel ? '上传中...' : '上传模型 (zip)' }}
          </button>
        </div>

        <!-- 上传进度 -->
        <div v-if="isUploadingModel" class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${uploadProgress.progress}%` }"></div>
          </div>
          <span class="progress-text">{{ uploadProgress.message }}</span>
        </div>

        <!-- 已上传的模型列表 -->
        <div v-if="uploadedModels.length > 0" class="uploaded-models">
          <div class="uploaded-models-title">已上传的模型:</div>
          <div
            v-for="model in uploadedModels"
            :key="model"
            class="model-item"
          >
            <div class="model-info" @click="useUploadedModel(model)">
              <span class="model-name">{{ model }}</span>
              <span class="model-hint">点击使用</span>
            </div>
            <button class="model-delete-btn" @click.stop="confirmDeleteModel(model)" title="删除">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="input-group">
          <label>人设 (Prompt)</label>
          <textarea
            :value="currentPet.prompt"
            @input="updatePet(currentPet.id, { prompt: ($event.target as HTMLTextAreaElement).value })"
            rows="5"
            placeholder="自定义宠物的性格和说话方式"
          ></textarea>
          <span class="hint">使用 {petName} 代表宠物名称</span>
        </div>
        <div class="button-row">
          <button class="btn secondary" @click="resetPrompt">恢复默认人设</button>
        </div>
      </div>

      <!-- 大模型设置 -->
      <div class="card">
        <div class="card-title">大模型 (LLM)</div>

        <div class="input-group">
          <label>模型提供商</label>
          <select v-model="settings.llmProvider">
            <option v-for="provider in llmProviders" :key="provider.value" :value="provider.value">
              {{ provider.label }}
            </option>
          </select>
        </div>

        <div class="input-group">
          <label>API Key</label>
          <input
            type="password"
            v-model="settings.llmApiKey"
            :placeholder="showApiKeyHint"
          />
        </div>

        <div class="input-group">
          <label>API 地址 (可选)</label>
          <input
            type="text"
            v-model="settings.llmBaseUrl"
            :placeholder="showBaseUrlHint"
          />
        </div>

        <div class="input-group">
          <label>模型名称 (可选)</label>
          <input
            type="text"
            v-model="settings.llmModel"
            placeholder="留空使用默认模型"
          />
        </div>

        <div class="button-row">
          <button class="btn primary" @click="testConnection">测试连接</button>
        </div>
      </div>

      <!-- 服务器设置 -->
      <div class="card">
        <div class="card-title">局域网通信</div>

        <div class="input-group">
          <label>服务器地址</label>
          <input
            type="text"
            v-model="settings.serverUrl"
            placeholder="例如: http://192.168.1.100:3000"
          />
        </div>

        <div class="button-row">
          <button class="btn secondary" @click="isScanning ? stopScan() : handleScanServers()">
            {{ isScanning ? '停止扫描' : '扫描局域网' }}
          </button>
          <button class="btn secondary" @click="testServerConnection">测试连接</button>
        </div>

        <!-- 扫描进度条 -->
        <div v-if="isScanning" class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${scanProgress}%` }"></div>
          </div>
          <span class="progress-text">{{ scanProgress }}%</span>
        </div>

        <!-- 发现的服务器列表 -->
        <div v-if="discoveredServers.length > 0" class="server-list">
          <div class="server-list-title">发现的服务器:</div>
          <div
            v-for="server in discoveredServers"
            :key="server.ip"
            class="server-item"
            :class="{ active: settings.serverUrl === server.url }"
            @click="selectServer(server)"
          >
            <div class="server-info">
              <span class="server-ip">{{ server.ip }}:{{ server.port }}</span>
              <span class="server-pets">{{ server.pets }} 只宠物在线</span>
            </div>
            <svg v-if="settings.serverUrl === server.url" class="check-icon" viewBox="0 0 24 24">
              <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          </div>
        </div>

        <div class="toggle-group">
          <label class="toggle-label">
            <input type="checkbox" v-model="settings.autoConnect" />
            <span>自动连接服务器</span>
          </label>
        </div>
      </div>

      <!-- 显示设置 -->
      <div class="card">
        <div class="card-title">显示</div>
        <div class="toggle-group">
          <label class="toggle-label">
            <input type="checkbox" v-model="settings.showBubble" />
            <span>显示对话气泡</span>
          </label>
        </div>
      </div>

      <!-- 背景设置 -->
      <div class="card">
        <div class="card-title">背景</div>

        <!-- 当前背景预览 -->
        <div class="background-preview-section">
          <div class="preview-label">当前背景</div>
          <div
            class="background-preview"
            :class="{ transparent: currentPresetBackground?.id === 'transparent' }"
            :style="currentPresetBackground && currentPresetBackground.id !== 'transparent'
              ? { background: currentPresetBackground.value }
              : !currentPresetBackground ? { background: settings.backgroundGradient } : {}"
          >
            <div class="preview-overlay">
              <span v-if="currentPresetBackground">
                {{ currentPresetBackground.name }}
              </span>
              <span v-else>默认渐变</span>
            </div>
          </div>
        </div>

        <div class="button-row">
          <button v-if="settings.backgroundType !== 'gradient'" class="btn secondary" @click="handleClearBackground">
            恢复默认
          </button>
        </div>

        <!-- 预设背景 -->
        <div class="preset-section">
          <div class="preset-label">预设背景</div>
          <div class="preset-grid">
            <div
              v-for="preset in PRESET_BACKGROUNDS"
              :key="preset.id"
              class="preset-item"
              :class="{
                active: settings.backgroundType === 'preset' && settings.backgroundPreset === preset.id,
                transparent: preset.id === 'transparent'
              }"
              :style="preset.id !== 'transparent' ? { background: preset.value } : {}"
              @click="selectPresetBackground(preset.id)"
            >
              <span class="preset-name">{{ preset.name }}</span>
              <svg v-if="settings.backgroundType === 'preset' && settings.backgroundPreset === preset.id" class="check-icon" viewBox="0 0 24 24">
                <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- 聊天记录 -->
      <div class="card">
        <div class="card-title">聊天记录</div>

        <div class="chat-stats">
          <div class="stat-item">
            <span class="stat-value">{{ chatStats.total }}</span>
            <span class="stat-label">总消息</span>
          </div>
          <div class="stat-item">
            <span class="stat-value user">{{ chatStats.userCount }}</span>
            <span class="stat-label">我</span>
          </div>
          <div class="stat-item">
            <span class="stat-value pet">{{ chatStats.petCount }}</span>
            <span class="stat-label">宠物</span>
          </div>
          <div class="stat-item">
            <span class="stat-value other">{{ chatStats.otherCount }}</span>
            <span class="stat-label">其他</span>
          </div>
        </div>

        <div class="button-row">
          <button class="btn secondary" @click="handleExportJSON">导出 JSON</button>
          <button class="btn secondary" @click="handleExportText">导出文本</button>
        </div>

        <button class="clear-btn" @click="showClearChatConfirm = true">
          清空聊天记录
        </button>
      </div>

      <!-- 操作按钮 -->
      <div class="actions">
        <button class="btn secondary" @click="handleReset">重置所有设置</button>
      </div>
    </main>

    <!-- 删除宠物确认对话框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showDeleteConfirm" class="modal-overlay" @click="showDeleteConfirm = false">
          <div class="modal-content" @click.stop>
            <div class="modal-title">确认删除</div>
            <div class="modal-body">确定要删除这个宠物吗？此操作无法撤销。</div>
            <div class="modal-actions">
              <button class="btn secondary" @click="showDeleteConfirm = false">取消</button>
              <button class="btn danger" @click="handleDeletePet">删除</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 清空聊天记录确认对话框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showClearChatConfirm" class="modal-overlay" @click="showClearChatConfirm = false">
          <div class="modal-content" @click.stop>
            <div class="modal-title">确认清空</div>
            <div class="modal-body">确定要清空所有聊天记录吗？此操作无法撤销。</div>
            <div class="modal-actions">
              <button class="btn secondary" @click="showClearChatConfirm = false">取消</button>
              <button class="btn danger" @click="handleClearChatHistory">清空</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除模型确认对话框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showDeleteModelConfirm" class="modal-overlay" @click="showDeleteModelConfirm = false">
          <div class="modal-content" @click.stop>
            <div class="modal-title">确认删除</div>
            <div class="modal-body">确定要删除模型 "{{ modelToDelete }}" 吗？此操作无法撤销。</div>
            <div class="modal-actions">
              <button class="btn secondary" @click="showDeleteModelConfirm = false">取消</button>
              <button class="btn danger" @click="handleDeleteModel">删除</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 格式指南弹窗 -->
    <ModelFormatGuide
      :visible="showFormatGuide"
      :errors="uploadErrorDetails"
      @close="showFormatGuide = false"
    />

    <!-- 模型上传结果 -->
    <ModelUploadResult
      :show="showModelUploadResult"
      :info="modelUploadInfo"
      @update:show="showModelUploadResult = $event"
    />

    <!-- Snackbar -->
    <Transition name="snackbar">
      <div v-if="showSnackbar" class="snackbar" :class="snackbarType">
        {{ snackbarMessage }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  max-height: 100vh;
  overflow-y: auto;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: rgba(26, 26, 46, 0.95);
  backdrop-filter: blur(10px);
  z-index: 10;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.back-btn {
  background: transparent;
  border: none;
  padding: 8px;
  margin: -8px;
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.2s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.back-btn svg {
  width: 24px;
  height: 24px;
  color: white;
}

.header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  color: white;
}

/* 状态栏 */
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 12px 16px;
  margin: 12px 16px 0;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: center;
}

.status-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-icon svg {
  width: 16px;
  height: 16px;
  color: rgba(255, 255, 255, 0.5);
}

.status-icon.active {
  background: rgba(76, 175, 80, 0.2);
}

.status-icon.active svg {
  color: #4caf50;
}

.status-icon.pets {
  background: rgba(102, 126, 234, 0.2);
}

.status-icon.pets svg {
  color: #667eea;
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
}

.status-value {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
}

.status-value.connected {
  color: #4caf50;
}

.status-value.pets {
  color: #667eea;
}

.status-divider {
  width: 1px;
  height: 32px;
  background: rgba(255, 255, 255, 0.1);
}

.content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 32px;
}

/* Card */
.card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.card-title {
  font-size: 16px;
  font-weight: 500;
  color: white;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

/* Input Group */
.input-group {
  margin-bottom: 12px;
}

.input-group label {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 6px;
}

.input-group input,
.input-group select,
.input-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 14px;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.input-group input:focus,
.input-group select:focus,
.input-group textarea:focus {
  outline: none;
  border-color: #667eea;
}

.input-group textarea {
  resize: vertical;
  min-height: 100px;
}

.input-group select {
  cursor: pointer;
}

.input-group .hint {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
}

/* Toggle */
.toggle-group {
  margin: 12px 0;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
}

.toggle-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #667eea;
}

/* Buttons */
.button-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.btn {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn.primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.btn.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn.danger {
  background: linear-gradient(135deg, #ef5350 0%, #c62828 100%);
  color: white;
}

/* Pet Selector */
.pet-selector {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.pet-list-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 4px 0;
  scrollbar-width: none;
}

.pet-list-scroll::-webkit-scrollbar {
  display: none;
}

.pet-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px;
  min-width: 80px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.pet-card:hover {
  background: rgba(255, 255, 255, 0.1);
}

.pet-card.active {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.15);
}

.pet-card .pet-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 16px;
}

.pet-card-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  text-align: center;
  max-width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pet-card-actions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.pet-card:hover .pet-card-actions,
.pet-card.active .pet-card-actions {
  opacity: 1;
}

.pet-action-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.pet-action-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.pet-action-btn.delete:hover {
  background: rgba(239, 83, 80, 0.3);
}

.pet-action-btn svg {
  width: 12px;
  height: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.pet-action-btn.delete svg {
  color: #ef5350;
}

.pet-card.add-pet {
  border: 2px dashed rgba(255, 255, 255, 0.2);
  background: transparent;
}

.pet-card.add-pet:hover {
  border-color: rgba(255, 255, 255, 0.4);
}

.add-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-icon svg {
  width: 24px;
  height: 24px;
  color: rgba(255, 255, 255, 0.6);
}

/* Progress */
.progress-container {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  border-radius: 2px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

/* Server List */
.server-list {
  margin: 12px 0;
}

.server-list-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 8px;
}

.server-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.server-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.server-item.active {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.server-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.server-ip {
  font-size: 14px;
  color: white;
  font-weight: 500;
}

.server-pets {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.check-icon {
  width: 20px;
  height: 20px;
  color: #667eea;
}

/* Background */
.background-preview-section {
  margin-bottom: 16px;
}

.preview-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 8px;
}

.background-preview {
  width: 100%;
  height: 100px;
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.background-preview.transparent {
  background-image:
    linear-gradient(45deg, #444 25%, transparent 25%),
    linear-gradient(-45deg, #444 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #444 75%),
    linear-gradient(-45deg, transparent 75%, #444 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
  background-color: #666;
}

.preview-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px 12px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
  color: white;
  font-size: 12px;
}

.preset-section {
  margin-top: 12px;
}

.preset-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 12px;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.preset-item {
  aspect-ratio: 1;
  border-radius: 10px;
  position: relative;
  cursor: pointer;
  overflow: hidden;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.preset-item:hover {
  transform: scale(1.05);
  border-color: rgba(255, 255, 255, 0.3);
}

.preset-item.active {
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3);
}

/* 透明背景的棋盘格图案 */
.preset-item.transparent {
  background-image:
    linear-gradient(45deg, #444 25%, transparent 25%),
    linear-gradient(-45deg, #444 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #444 75%),
    linear-gradient(-45deg, transparent 75%, #444 75%);
  background-size: 12px 12px;
  background-position: 0 0, 0 6px, 6px -6px, -6px 0px;
  background-color: #666;
}

.preset-name {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: white;
  font-size: 10px;
  text-align: center;
}

.preset-item .check-icon {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  color: white;
  background: #667eea;
  border-radius: 50%;
  padding: 2px;
}

/* Chat Stats */
.chat-stats {
  display: flex;
  justify-content: space-around;
  padding: 16px 0;
  margin-bottom: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: white;
}

.stat-value.user {
  color: #a78bfa;
}

.stat-value.pet {
  color: #f472b6;
}

.stat-value.other {
  color: #22d3ee;
}

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.clear-btn {
  width: 100%;
  padding: 12px;
  margin-top: 12px;
  background: transparent;
  border: 1px dashed rgba(239, 83, 80, 0.4);
  border-radius: 8px;
  color: #ef5350;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: rgba(239, 83, 80, 0.1);
  border-color: rgba(239, 83, 80, 0.6);
}

.actions {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

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
  z-index: 1000;
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
  margin-bottom: 12px;
}

.modal-body {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
  margin-bottom: 20px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* Snackbar */
.snackbar {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  z-index: 1001;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.snackbar.success {
  background: #4caf50;
}

.snackbar.error {
  background: #ef5350;
}

.snackbar.info {
  background: #2196f3;
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

.snackbar-enter-active,
.snackbar-leave-active {
  transition: all 0.3s ease;
}

.snackbar-enter-from,
.snackbar-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

/* Uploaded Models */
.uploaded-models {
  margin: 12px 0;
}

.uploaded-models-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-bottom: 8px;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.model-item:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.1);
}

.model-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  flex: 1;
}

.model-name {
  font-size: 14px;
  color: white;
  font-weight: 500;
}

.model-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.model-delete-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(239, 83, 80, 0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.model-delete-btn:hover {
  background: rgba(239, 83, 80, 0.2);
}

.model-delete-btn svg {
  width: 16px;
  height: 16px;
  color: #ef5350;
}
</style>
