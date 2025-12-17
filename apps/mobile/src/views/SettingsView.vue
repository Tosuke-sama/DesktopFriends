<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  MdInput,
  MdTextarea,
  MdSelect,
  MdSwitch,
  MdCard,
  MdButton,
  MdSnackbar,
} from '@desktopfriends/ui'
import {
  useSettings,
  useServerDiscovery,
  useP2P,
  useChatHistory,
  DEFAULT_PET_PROMPT,
  PRESET_BACKGROUNDS,
  type DiscoveredServer,
} from '@desktopfriends/core'
import { useLocalServer } from '../composables/useLocalServer'
import { useModelUpload } from '../composables/useModelUpload'

const emit = defineEmits<{
  back: []
}>()

// 本地服务器管理
const {
  isRunning: isLocalServerRunning,
  serverError: localServerError,
  connectedClients,
  environment,
  startServer,
  stopServer,
  getStartCommand,
  getLocalIP,
  copyToClipboard,
} = useLocalServer()

// 本地服务器状态
const localServerPort = ref(3000)
const localServerIP = ref('')
const showServerGuide = ref(false)
const isStartingServer = ref(false)

// 获取本机 IP
getLocalIP().then(ip => {
  localServerIP.value = ip
})
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
  setBackgroundImage,
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

// P2P 连接状态（使用单例，获取当前连接状态）
const p2p = useP2P()

// 聊天历史记录
const { chatHistory, stats: chatStats, exportHistory, clearHistory: clearChatHistory } = useChatHistory()

// 模型上传
const {
  isUploading: isUploadingModel,
  uploadProgress,
  error: modelUploadError,
  uploadModel,
  getUploadedModels,
  deleteModel,
} = useModelUpload()

// 已上传的模型列表
const uploadedModels = ref<string[]>([])
const modelFileInputRef = ref<HTMLInputElement | null>(null)
const showModelDeleteConfirm = ref(false)
const modelToDelete = ref<string | null>(null)

// 加载已上传的模型列表
onMounted(async () => {
  uploadedModels.value = await getUploadedModels()
})

// 触发模型文件选择
const triggerModelFileSelect = () => {
  modelFileInputRef.value?.click()
}

// 处理模型文件选择
const handleModelFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // 检查文件类型
  if (!file.name.endsWith('.zip')) {
    snackbarMessage.value = '请选择 zip 格式的模型文件'
    snackbarType.value = 'error'
    showSnackbar.value = true
    input.value = ''
    return
  }

  // 使用当前宠物名称作为模型名称
  const modelPath = await uploadModel(file, currentPet.value.name)

  if (modelPath) {
    // 更新宠物的模型路径
    updatePet(currentPet.value.id, { modelPath })
    snackbarMessage.value = '模型上传成功！'
    snackbarType.value = 'success'
    // 刷新已上传模型列表
    uploadedModels.value = await getUploadedModels()
  } else if (modelUploadError.value) {
    snackbarMessage.value = modelUploadError.value
    snackbarType.value = 'error'
  }

  showSnackbar.value = true
  input.value = ''
}

// 使用已上传的模型
const useUploadedModel = async (modelName: string) => {
  // 构建模型路径
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  try {
    // 查找模型目录下的 model.json 文件
    const files = await Filesystem.readdir({
      path: `models/${modelName}`,
      directory: Directory.Data,
    })

    const modelFile = files.files.find(f =>
      f.name.endsWith('.model3.json') || f.name.endsWith('.model.json')
    )

    if (modelFile) {
      const result = await Filesystem.getUri({
        path: `models/${modelName}/${modelFile.name}`,
        directory: Directory.Data,
      })
      updatePet(currentPet.value.id, { modelPath: result.uri })
      snackbarMessage.value = `已切换到模型: ${modelName}`
      snackbarType.value = 'success'
    } else {
      snackbarMessage.value = '未找到模型文件'
      snackbarType.value = 'error'
    }
  } catch (e) {
    console.error('Error loading model:', e)
    snackbarMessage.value = '加载模型失败'
    snackbarType.value = 'error'
  }
  showSnackbar.value = true
}

// 确认删除模型
const confirmDeleteModel = (modelName: string) => {
  modelToDelete.value = modelName
  showModelDeleteConfirm.value = true
}

// 执行删除模型
const handleDeleteModel = async () => {
  if (modelToDelete.value) {
    const success = await deleteModel(modelToDelete.value)
    if (success) {
      snackbarMessage.value = `已删除模型: ${modelToDelete.value}`
      snackbarType.value = 'info'
      uploadedModels.value = await getUploadedModels()
    } else {
      snackbarMessage.value = '删除失败'
      snackbarType.value = 'error'
    }
    showSnackbar.value = true
  }
  showModelDeleteConfirm.value = false
  modelToDelete.value = null
}

// 调试：监听状态变化
watch(
  () => ({
    connected: p2p.isConnected.value,
    registered: p2p.isRegistered.value,
    pets: p2p.onlinePets.value.length,
  }),
  (state) => {
    console.log('[SettingsView] P2P state changed:', state)
  },
  { immediate: true, deep: true }
)

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

const showSnackbar = ref(false)
const snackbarMessage = ref('')
const snackbarType = ref<'success' | 'error' | 'info'>('success')

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
    snackbarMessage.value = '请先输入 API Key'
    snackbarType.value = 'error'
    showSnackbar.value = true
    return
  }

  // 自定义 API 必须填写地址
  if (settings.value.llmProvider === 'custom' && !settings.value.llmBaseUrl) {
    snackbarMessage.value = '自定义 API 需要填写 API 地址'
    snackbarType.value = 'error'
    showSnackbar.value = true
    return
  }

  snackbarMessage.value = '测试连接中...'
  snackbarType.value = 'info'
  showSnackbar.value = true

  // 简单的连接测试
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
      // Claude doesn't have a simple health check endpoint
      snackbarMessage.value = 'Claude API Key 已保存，发送消息时验证'
      snackbarType.value = 'success'
      showSnackbar.value = true
      return
    } else if (config.provider === 'custom') {
      // 自定义 API，尝试获取 models 列表或直接测试
      url = config.baseUrl!.replace('/chat/completions', '/models')
      headers = { Authorization: `Bearer ${config.apiKey}` }
    }

    const response = await fetch(url!, { headers, method: 'GET' })

    if (response.ok) {
      snackbarMessage.value = '连接成功！'
      snackbarType.value = 'success'
    } else {
      snackbarMessage.value = `连接失败: ${response.status}`
      snackbarType.value = 'error'
    }
  } catch (e) {
    snackbarMessage.value = '连接失败，请检查网络或代理设置'
    snackbarType.value = 'error'
  }
  showSnackbar.value = true
}

const handleReset = () => {
  resetSettings()
  snackbarMessage.value = '设置已重置'
  snackbarType.value = 'info'
  showSnackbar.value = true
}

// 恢复默认人设
const resetPrompt = () => {
  updatePet(currentPet.value.id, { prompt: DEFAULT_PET_PROMPT })
  snackbarMessage.value = '已恢复默认人设'
  snackbarType.value = 'success'
  showSnackbar.value = true
}

// ===== 宠物管理 =====
const showDeleteConfirm = ref(false)
const petToDelete = ref<string | null>(null)

// 添加新宠物
const handleAddPet = () => {
  const newPet = addPet()
  switchPet(newPet.id)
  snackbarMessage.value = `已创建新宠物: ${newPet.name}`
  snackbarType.value = 'success'
  showSnackbar.value = true
}

// 切换宠物
const handleSwitchPet = (petId: string) => {
  if (petId === currentPet.value.id) return
  switchPet(petId)
  snackbarMessage.value = `已切换到: ${currentPet.value.name}`
  snackbarType.value = 'success'
  showSnackbar.value = true
}

// 确认删除宠物
const confirmDeletePet = (petId: string) => {
  if (pets.value.length <= 1) {
    snackbarMessage.value = '至少保留一个宠物'
    snackbarType.value = 'error'
    showSnackbar.value = true
    return
  }
  petToDelete.value = petId
  showDeleteConfirm.value = true
}

// 执行删除
const handleDeletePet = () => {
  if (petToDelete.value) {
    const petName = pets.value.find(p => p.id === petToDelete.value)?.name
    removePet(petToDelete.value)
    snackbarMessage.value = `已删除: ${petName}`
    snackbarType.value = 'info'
    showSnackbar.value = true
  }
  showDeleteConfirm.value = false
  petToDelete.value = null
}

// 复制宠物
const handleDuplicatePet = (petId: string) => {
  const newPet = duplicatePet(petId)
  if (newPet) {
    switchPet(newPet.id)
    snackbarMessage.value = `已复制: ${newPet.name}`
    snackbarType.value = 'success'
    showSnackbar.value = true
  }
}

// 扫描局域网服务器
const handleScanServers = async () => {
  snackbarMessage.value = '正在扫描局域网...'
  snackbarType.value = 'info'
  showSnackbar.value = true

  await quickScan()

  if (discoveredServers.value.length > 0) {
    snackbarMessage.value = `找到 ${discoveredServers.value.length} 个服务器`
    snackbarType.value = 'success'
  } else {
    snackbarMessage.value = '未找到服务器'
    snackbarType.value = 'error'
  }
  showSnackbar.value = true
}

// 选择发现的服务器
const selectServer = (server: DiscoveredServer) => {
  settings.value.serverUrl = server.url
  snackbarMessage.value = `已选择: ${server.ip}`
  snackbarType.value = 'success'
  showSnackbar.value = true
}

// 测试当前服务器连接
const testServerConnection = async () => {
  if (!settings.value.serverUrl) {
    snackbarMessage.value = '请先输入或选择服务器地址'
    snackbarType.value = 'error'
    showSnackbar.value = true
    return
  }

  snackbarMessage.value = '测试连接中...'
  snackbarType.value = 'info'
  showSnackbar.value = true

  const result = await testServer(settings.value.serverUrl)
  if (result) {
    snackbarMessage.value = `连接成功！当前有 ${result.pets} 只宠物在线`
    snackbarType.value = 'success'
  } else {
    snackbarMessage.value = '连接失败，请检查服务器地址'
    snackbarType.value = 'error'
  }
  showSnackbar.value = true
}

// ===== 创建房间相关 =====

// 复制启动命令
const handleCopyCommand = async () => {
  const command = getStartCommand()
  const success = await copyToClipboard(command)
  if (success) {
    snackbarMessage.value = '启动命令已复制到剪贴板'
    snackbarType.value = 'success'
  } else {
    snackbarMessage.value = '复制失败，请手动复制'
    snackbarType.value = 'error'
  }
  showSnackbar.value = true
}

// 复制服务器地址
const handleCopyServerUrl = async () => {
  const url = `http://${localServerIP.value}:${localServerPort.value}`
  const success = await copyToClipboard(url)
  if (success) {
    snackbarMessage.value = '服务器地址已复制'
    snackbarType.value = 'success'
  } else {
    snackbarMessage.value = '复制失败'
    snackbarType.value = 'error'
  }
  showSnackbar.value = true
}

// 使用本机作为服务器
const useLocalAsServer = () => {
  settings.value.serverUrl = `http://${localServerIP.value}:${localServerPort.value}`
  snackbarMessage.value = '已设置为本机服务器地址'
  snackbarType.value = 'success'
  showSnackbar.value = true
}

// 一键启动服务器
const handleStartServer = async () => {
  if (!environment.canRunServer) {
    // 非原生环境，显示启动指南
    showServerGuide.value = true
    snackbarMessage.value = '当前环境不支持直接启动，请查看启动指南'
    snackbarType.value = 'info'
    showSnackbar.value = true
    return
  }

  isStartingServer.value = true
  snackbarMessage.value = '正在启动服务器...'
  snackbarType.value = 'info'
  showSnackbar.value = true

  const success = await startServer(localServerPort.value)

  isStartingServer.value = false

  if (success) {
    // 自动设置服务器地址
    settings.value.serverUrl = `http://${localServerIP.value}:${localServerPort.value}`
    snackbarMessage.value = '服务器已启动！其他设备可以连接了'
    snackbarType.value = 'success'
  } else {
    snackbarMessage.value = localServerError.value || '启动失败'
    snackbarType.value = 'error'
  }
  showSnackbar.value = true
}

// 停止服务器
const handleStopServer = async () => {
  const success = await stopServer()

  if (success) {
    snackbarMessage.value = '服务器已停止'
    snackbarType.value = 'info'
  } else {
    snackbarMessage.value = '停止失败'
    snackbarType.value = 'error'
  }
  showSnackbar.value = true
}

// ===== 聊天记录相关 =====

// 导出聊天记录为 JSON
const handleExportJSON = () => {
  if (chatHistory.value.length === 0) {
    snackbarMessage.value = '暂无聊天记录可导出'
    snackbarType.value = 'error'
    showSnackbar.value = true
    return
  }
  exportHistory('json')
  snackbarMessage.value = `已导出 ${chatStats.value.total} 条聊天记录`
  snackbarType.value = 'success'
  showSnackbar.value = true
}

// 导出聊天记录为文本
const handleExportText = () => {
  if (chatHistory.value.length === 0) {
    snackbarMessage.value = '暂无聊天记录可导出'
    snackbarType.value = 'error'
    showSnackbar.value = true
    return
  }
  exportHistory('text')
  snackbarMessage.value = `已导出 ${chatStats.value.total} 条聊天记录`
  snackbarType.value = 'success'
  showSnackbar.value = true
}

// 清空聊天记录
const showClearChatConfirm = ref(false)

const handleClearChatHistory = () => {
  clearChatHistory()
  showClearChatConfirm.value = false
  snackbarMessage.value = '聊天记录已清空'
  snackbarType.value = 'info'
  showSnackbar.value = true
}

// ===== 背景设置相关 =====
const fileInputRef = ref<HTMLInputElement | null>(null)
const isUploadingBackground = ref(false)

// 触发文件选择
const triggerFileSelect = () => {
  fileInputRef.value?.click()
}

// 处理文件选择
const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // 检查文件类型
  if (!file.type.startsWith('image/')) {
    snackbarMessage.value = '请选择图片文件'
    snackbarType.value = 'error'
    showSnackbar.value = true
    return
  }

  // 检查文件大小（限制 5MB）
  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) {
    snackbarMessage.value = '图片大小不能超过 5MB'
    snackbarType.value = 'error'
    showSnackbar.value = true
    return
  }

  isUploadingBackground.value = true

  try {
    // 压缩并转换为 base64
    const compressedImage = await compressImage(file, 1920, 0.8)
    setBackgroundImage(compressedImage)
    snackbarMessage.value = '背景已更新'
    snackbarType.value = 'success'
  } catch (e) {
    console.error('Failed to process image:', e)
    snackbarMessage.value = '图片处理失败'
    snackbarType.value = 'error'
  } finally {
    isUploadingBackground.value = false
    // 清空 input 以便再次选择同一文件
    input.value = ''
  }
  showSnackbar.value = true
}

// 压缩图片
const compressImage = (file: File, maxWidth: number, quality: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // 如果图片宽度大于最大宽度，按比例缩放
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve(dataUrl)
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

// 选择预设背景
const selectPresetBackground = (presetId: string) => {
  setPresetBackground(presetId)
  snackbarMessage.value = '背景已更新'
  snackbarType.value = 'success'
  showSnackbar.value = true
}

// 清除背景
const handleClearBackground = () => {
  clearCustomBackground()
  snackbarMessage.value = '已恢复默认背景'
  snackbarType.value = 'info'
  showSnackbar.value = true
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
      <MdCard title="宠物" class="card-animate" style="--delay: 0">
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

        <div class="current-pet-settings">
          <MdInput
            :modelValue="currentPet.name"
            @update:modelValue="(v: string) => updatePet(currentPet.id, { name: v })"
            label="宠物名称"
            hint="给你的宠物起个名字吧"
          />

          <!-- 模型上传区域 -->
          <div class="model-section">
            <div class="model-section-header">
              <span class="section-label">Live2D 模型</span>
            </div>

            <!-- 隐藏的文件输入 -->
            <input
              ref="modelFileInputRef"
              type="file"
              accept=".zip"
              class="hidden-input"
              @change="handleModelFileSelect"
            />

            <!-- 当前模型路径 -->
            <MdInput
              :modelValue="currentPet.modelPath"
              @update:modelValue="(v: string) => updatePet(currentPet.id, { modelPath: v })"
              label="模型路径"
              hint="上传 zip 模型包或手动输入路径"
            />

            <!-- 上传按钮和进度 -->
            <div class="model-upload-actions">
              <MdButton @click="triggerModelFileSelect" :disabled="isUploadingModel">
                {{ isUploadingModel ? '上传中...' : '上传模型 (zip)' }}
              </MdButton>
            </div>

            <!-- 上传进度条 -->
            <div v-if="isUploadingModel" class="upload-progress">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: `${uploadProgress.progress}%` }"></div>
              </div>
              <span class="progress-text">{{ uploadProgress.message }}</span>
            </div>

            <!-- 已上传的模型列表 -->
            <div v-if="uploadedModels.length > 0" class="uploaded-models">
              <div class="uploaded-models-title">已上传的模型:</div>
              <div class="model-list">
                <div
                  v-for="model in uploadedModels"
                  :key="model"
                  class="model-item"
                >
                  <div class="model-info" @click="useUploadedModel(model)">
                    <span class="model-name">{{ model }}</span>
                    <span class="model-hint">点击使用</span>
                  </div>
                  <button class="model-delete-btn" @click="confirmDeleteModel(model)">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <MdTextarea
            :modelValue="currentPet.prompt"
            @update:modelValue="(v: string) => updatePet(currentPet.id, { prompt: v })"
            label="人设 (Prompt)"
            :rows="5"
            hint="自定义宠物的性格和说话方式，使用 {petName} 代表宠物名称"
            placeholder="例如: 你是一个可爱的桌面宠物，名叫{petName}。你性格活泼、善良..."
          />
          <div class="prompt-actions">
            <MdButton @click="resetPrompt">
              恢复默认人设
            </MdButton>
          </div>
        </div>
      </MdCard>

      <!-- 删除模型确认对话框 -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showModelDeleteConfirm" class="modal-overlay" @click="showModelDeleteConfirm = false">
            <div class="modal-content" @click.stop>
              <div class="modal-title">确认删除</div>
              <div class="modal-body">
                确定要删除模型 "{{ modelToDelete }}" 吗？此操作无法撤销。
              </div>
              <div class="modal-actions">
                <MdButton @click="showModelDeleteConfirm = false">取消</MdButton>
                <MdButton @click="handleDeleteModel" class="delete-btn">删除</MdButton>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- 删除确认对话框 -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showDeleteConfirm" class="modal-overlay" @click="showDeleteConfirm = false">
            <div class="modal-content" @click.stop>
              <div class="modal-title">确认删除</div>
              <div class="modal-body">
                确定要删除这个宠物吗？此操作无法撤销。
              </div>
              <div class="modal-actions">
                <MdButton @click="showDeleteConfirm = false">取消</MdButton>
                <MdButton @click="handleDeletePet" class="delete-btn">删除</MdButton>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- 大模型设置 -->
      <MdCard title="大模型 (LLM)" class="card-animate" style="--delay: 1">
        <MdSelect
          v-model="settings.llmProvider"
          label="模型提供商"
          :options="llmProviders"
        />
        <MdInput
          v-model="settings.llmApiKey"
          label="API Key"
          type="password"
          :hint="showApiKeyHint"
        />
        <MdInput
          v-model="settings.llmBaseUrl"
          label="API 地址 (可选)"
          :hint="showBaseUrlHint"
        />
        <MdInput
          v-model="settings.llmModel"
          label="模型名称 (可选)"
          hint="留空使用默认模型"
        />
        <div class="button-row">
          <MdButton @click="testConnection">测试连接</MdButton>
        </div>
      </MdCard>

      <!-- 服务器设置 -->
      <MdCard title="局域网通信" class="card-animate" style="--delay: 2">
        <MdInput
          v-model="settings.serverUrl"
          label="服务器地址"
          hint="例如: http://192.168.1.100:3000"
        />

        <!-- 扫描按钮和进度 -->
        <div class="scan-section">
          <MdButton
            @click="isScanning ? stopScan() : handleScanServers()"
            :disabled="false"
          >
            {{ isScanning ? '停止扫描' : '扫描局域网' }}
          </MdButton>
          <MdButton @click="testServerConnection">
            测试连接
          </MdButton>
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

        <MdSwitch
          v-model="settings.autoConnect"
          label="自动连接服务器"
        />
      </MdCard>

      <!-- 创建房间 -->
      <MdCard title="创建房间" class="card-animate" style="--delay: 3">
        <div class="create-room-section">
          <p class="create-room-desc">
            {{ environment.canRunServer
              ? '一键启动服务器，让其他设备连接到你的房间。'
              : '在你的电脑上运行服务器，让其他设备连接到你的房间。' }}
          </p>

          <!-- 服务器运行状态 -->
          <div v-if="isLocalServerRunning" class="server-running-status">
            <div class="running-indicator">
              <span class="pulse-dot"></span>
              <span class="running-text">服务器运行中</span>
            </div>
            <div class="running-info">
              已连接 {{ connectedClients }} 个客户端
            </div>
          </div>

          <!-- 本机信息 -->
          <div class="local-info">
            <div class="info-row">
              <span class="info-label">本机 IP</span>
              <span class="info-value">{{ localServerIP || '获取中...' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">端口</span>
              <input
                type="number"
                v-model.number="localServerPort"
                class="port-input"
                min="1000"
                max="65535"
                :disabled="isLocalServerRunning"
              />
            </div>
            <div class="info-row">
              <span class="info-label">服务器地址</span>
              <span class="info-value highlight">
                http://{{ localServerIP }}:{{ localServerPort }}
              </span>
            </div>
          </div>

          <!-- 一键启动/停止按钮 -->
          <div class="server-control">
            <MdButton
              v-if="!isLocalServerRunning"
              @click="handleStartServer"
              :disabled="isStartingServer"
              class="start-server-btn"
            >
              {{ isStartingServer ? '启动中...' : (environment.canRunServer ? '一键启动服务器' : '查看启动指南') }}
            </MdButton>
            <MdButton
              v-else
              @click="handleStopServer"
              class="stop-server-btn"
            >
              停止服务器
            </MdButton>
          </div>

          <!-- 操作按钮 -->
          <div class="create-room-actions">
            <MdButton @click="handleCopyServerUrl">
              复制地址
            </MdButton>
            <MdButton @click="useLocalAsServer">
              使用此地址
            </MdButton>
          </div>

          <!-- 展开/折叠指南（非原生环境显示） -->
          <button v-if="!environment.canRunServer" class="guide-toggle" @click="showServerGuide = !showServerGuide">
            <span>{{ showServerGuide ? '收起' : '查看' }}启动指南</span>
            <svg
              class="toggle-icon"
              :class="{ expanded: showServerGuide }"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
            </svg>
          </button>

          <!-- 启动指南 -->
          <Transition name="guide">
            <div v-if="showServerGuide" class="server-guide">
              <div class="guide-step">
                <div class="step-number">1</div>
                <div class="step-content">
                  <div class="step-title">安装依赖</div>
                  <p>确保电脑已安装 Node.js (18+) 和 pnpm</p>
                </div>
              </div>

              <div class="guide-step">
                <div class="step-number">2</div>
                <div class="step-content">
                  <div class="step-title">启动服务器</div>
                  <p>在项目根目录运行以下命令：</p>
                  <div class="command-box">
                    <code>{{ getStartCommand() }}</code>
                    <button class="copy-btn" @click="handleCopyCommand">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="step-number">3</div>
                <div class="step-content">
                  <div class="step-title">连接房间</div>
                  <p>服务器启动后，其他设备可以通过上方地址连接</p>
                </div>
              </div>

              <div class="guide-note">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                </svg>
                <span>确保电脑和手机在同一局域网内</span>
              </div>
            </div>
          </Transition>
        </div>
      </MdCard>

      <!-- 显示设置 -->
      <MdCard title="显示" class="card-animate" style="--delay: 4">
        <MdSwitch
          v-model="settings.showBubble"
          label="显示对话气泡"
        />
      </MdCard>

      <!-- 背景设置 -->
      <MdCard title="背景" class="card-animate" style="--delay: 5">
        <!-- 隐藏的文件输入 -->
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="hidden-input"
          @change="handleFileSelect"
        />

        <!-- 当前背景预览 -->
        <div class="background-preview-section">
          <div class="preview-label">当前背景</div>
          <div
            class="background-preview"
            :style="settings.backgroundType === 'image' && settings.backgroundImage
              ? { backgroundImage: `url(${settings.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : settings.backgroundType === 'preset' && settings.backgroundPreset
                ? { background: PRESET_BACKGROUNDS.find(p => p.id === settings.backgroundPreset)?.value }
                : { background: settings.backgroundGradient }"
          >
            <div class="preview-overlay">
              <span v-if="settings.backgroundType === 'image'">自定义图片</span>
              <span v-else-if="settings.backgroundType === 'preset'">
                {{ PRESET_BACKGROUNDS.find(p => p.id === settings.backgroundPreset)?.name }}
              </span>
              <span v-else>默认渐变</span>
            </div>
          </div>
        </div>

        <!-- 上传按钮 -->
        <div class="upload-section">
          <MdButton @click="triggerFileSelect" :disabled="isUploadingBackground">
            {{ isUploadingBackground ? '处理中...' : '上传图片' }}
          </MdButton>
          <MdButton v-if="settings.backgroundType !== 'gradient'" @click="handleClearBackground">
            恢复默认
          </MdButton>
        </div>

        <!-- 预设背景 -->
        <div class="preset-section">
          <div class="preset-label">预设背景</div>
          <div class="preset-grid">
            <div
              v-for="preset in PRESET_BACKGROUNDS"
              :key="preset.id"
              class="preset-item"
              :class="{ active: settings.backgroundType === 'preset' && settings.backgroundPreset === preset.id }"
              :style="{ background: preset.value }"
              @click="selectPresetBackground(preset.id)"
            >
              <span class="preset-name">{{ preset.name }}</span>
              <svg v-if="settings.backgroundType === 'preset' && settings.backgroundPreset === preset.id" class="check-icon" viewBox="0 0 24 24">
                <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            </div>
          </div>
        </div>
      </MdCard>

      <!-- 聊天记录 -->
      <MdCard title="聊天记录" class="card-animate" style="--delay: 6">
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

        <div class="export-actions">
          <MdButton @click="handleExportJSON">
            导出 JSON
          </MdButton>
          <MdButton @click="handleExportText">
            导出文本
          </MdButton>
        </div>

        <button class="clear-chat-btn" @click="showClearChatConfirm = true">
          清空聊天记录
        </button>
      </MdCard>

      <!-- 清空聊天记录确认对话框 -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showClearChatConfirm" class="modal-overlay" @click="showClearChatConfirm = false">
            <div class="modal-content" @click.stop>
              <div class="modal-title">确认清空</div>
              <div class="modal-body">
                确定要清空所有聊天记录吗？此操作无法撤销。
              </div>
              <div class="modal-actions">
                <MdButton @click="showClearChatConfirm = false">取消</MdButton>
                <MdButton @click="handleClearChatHistory" class="delete-btn">清空</MdButton>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- 操作按钮 -->
      <div class="actions card-animate" style="--delay: 7">
        <MdButton @click="handleReset">
          重置所有设置
        </MdButton>
      </div>
    </main>

    <!-- Snackbar -->
    <MdSnackbar
      v-model:show="showSnackbar"
      :message="snackbarMessage"
      :type="snackbarType"
    />
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
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1);
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

/* 状态栏样式 */
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 12px 16px;
  margin: 0 16px 0 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: 12px;
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
  transition: all 0.3s ease;
}

.status-icon svg {
  width: 16px;
  height: 16px;
  color: rgba(255, 255, 255, 0.5);
  transition: color 0.3s ease;
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
  letter-spacing: 0.5px;
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

.button-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.scan-section {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 0;
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
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  min-width: 36px;
}

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
  transition: all 0.2s ease;
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

.actions {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.prompt-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

/* Card stagger animation */
.card-animate {
  animation: slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
  animation-delay: calc(var(--delay) * 0.1s);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 创建房间样式 */
.create-room-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.create-room-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
  margin: 0;
}

/* 服务器运行状态 */
.server-running-status {
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.15) 0%, rgba(76, 175, 80, 0.05) 100%);
  border: 1px solid rgba(76, 175, 80, 0.3);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.running-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #4caf50;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.1);
  }
}

.running-text {
  font-size: 14px;
  font-weight: 500;
  color: #4caf50;
}

.running-info {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  padding-left: 18px;
}

/* 服务器控制按钮 */
.server-control {
  display: flex;
  justify-content: center;
}

.server-control :deep(.md-button) {
  flex: 1;
  max-width: 100%;
}

.start-server-btn :deep(.md-button) {
  background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
}

.stop-server-btn :deep(.md-button) {
  background: linear-gradient(135deg, #f44336 0%, #c62828 100%);
}

.local-info {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.info-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.info-value {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'SF Mono', Monaco, monospace;
}

.info-value.highlight {
  color: #667eea;
  font-weight: 500;
}

.port-input {
  width: 80px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 13px;
  text-align: center;
  outline: none;
  transition: border-color 0.2s ease;
}

.port-input:focus {
  border-color: #667eea;
}

.port-input::-webkit-inner-spin-button,
.port-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.create-room-actions {
  display: flex;
  gap: 8px;
}

.guide-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px;
  background: transparent;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.guide-toggle:hover {
  border-color: rgba(255, 255, 255, 0.4);
  color: rgba(255, 255, 255, 0.8);
}

.toggle-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.3s ease;
}

.toggle-icon.expanded {
  transform: rotate(180deg);
}

.server-guide {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.guide-step {
  display: flex;
  gap: 12px;
}

.step-number {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
}

.step-title {
  font-size: 14px;
  font-weight: 500;
  color: white;
  margin-bottom: 4px;
}

.step-content p {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.5;
}

.command-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.command-box code {
  flex: 1;
  font-size: 12px;
  color: #4ade80;
  font-family: 'SF Mono', Monaco, monospace;
  word-break: break-all;
}

.copy-btn {
  padding: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.copy-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.copy-btn:active {
  transform: scale(0.95);
}

.copy-btn svg {
  width: 16px;
  height: 16px;
  color: rgba(255, 255, 255, 0.7);
}

.guide-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(102, 126, 234, 0.2);
}

.guide-note svg {
  width: 18px;
  height: 18px;
  color: #667eea;
  flex-shrink: 0;
}

.guide-note span {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

/* Guide transition */
.guide-enter-active,
.guide-leave-active {
  transition: all 0.3s ease;
}

.guide-enter-from,
.guide-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  padding: 0;
  overflow: hidden;
}

.guide-enter-to,
.guide-leave-from {
  opacity: 1;
  max-height: 500px;
}

/* Pet Selector Styles */
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
  -ms-overflow-style: none;
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
  transition: all 0.2s ease;
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

.pet-card.active .pet-avatar {
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.3);
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
  transition: opacity 0.2s ease;
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
  transition: all 0.2s ease;
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
  background: rgba(255, 255, 255, 0.05);
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

.current-pet-settings {
  display: flex;
  flex-direction: column;
}

/* Modal Styles */
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

.delete-btn :deep(.md-button) {
  background: linear-gradient(135deg, #ef5350 0%, #c62828 100%);
}

/* Modal transition */
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

/* Chat Stats Styles */
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

.export-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.export-actions :deep(.md-button) {
  flex: 1;
}

.clear-chat-btn {
  width: 100%;
  padding: 12px;
  background: transparent;
  border: 1px dashed rgba(239, 83, 80, 0.4);
  border-radius: 8px;
  color: #ef5350;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-chat-btn:hover {
  background: rgba(239, 83, 80, 0.1);
  border-color: rgba(239, 83, 80, 0.6);
}

/* Background Settings Styles */
.hidden-input {
  display: none;
}

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
  height: 120px;
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
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

.upload-section {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.upload-section :deep(.md-button) {
  flex: 1;
}

.preset-section {
  margin-top: 8px;
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
  transition: all 0.2s ease;
}

.preset-item:hover {
  transform: scale(1.05);
  border-color: rgba(255, 255, 255, 0.3);
}

.preset-item.active {
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3);
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

/* Model Upload Styles */
.model-section {
  margin: 12px 0;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.model-section-header {
  margin-bottom: 12px;
}

.section-label {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.model-upload-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.model-upload-actions :deep(.md-button) {
  flex: 1;
}

.upload-progress {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.uploaded-models {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.uploaded-models-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 10px;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.model-item:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(102, 126, 234, 0.3);
}

.model-info {
  flex: 1;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
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
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: rgba(239, 83, 80, 0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
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
