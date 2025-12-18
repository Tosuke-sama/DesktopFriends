<!--
  PDF 阅读器插件 UI 面板

  此组件显示在侧边栏，提供：
  - 当前打开的 PDF 信息
  - 页面导航
  - 文本搜索功能
-->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/tauri'
import { open } from '@tauri-apps/api/dialog'

// 插件 ID
const props = defineProps<{
  pluginId: string
}>()

// 状态
const pdfInfo = ref<{
  path: string
  page_count: number
  title?: string
  author?: string
} | null>(null)
const currentPage = ref(1)
const pageContent = ref('')
const searchQuery = ref('')
const searchResults = ref<Array<{ page: number; context: string }>>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

// 文件名
const fileName = computed(() => {
  if (!pdfInfo.value?.path) return ''
  return pdfInfo.value.path.split('/').pop() || pdfInfo.value.path
})

// 打开 PDF 文件
const openPdf = async () => {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }]
    })

    if (!selected || Array.isArray(selected)) return

    isLoading.value = true
    error.value = null

    const result = await invoke<{ success: boolean; data: any; error?: string }>(
      'plugin_execute_tool',
      {
        pluginId: props.pluginId,
        toolName: 'open_pdf',
        arguments: { path: selected }
      }
    )

    if (result.success) {
      pdfInfo.value = result.data
      currentPage.value = 1
      await loadPage(1)
    } else {
      error.value = result.error || '打开失败'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isLoading.value = false
  }
}

// 加载页面内容
const loadPage = async (page: number) => {
  if (!pdfInfo.value) return

  try {
    isLoading.value = true
    const result = await invoke<{ success: boolean; data: any; error?: string }>(
      'plugin_execute_tool',
      {
        pluginId: props.pluginId,
        toolName: 'read_pdf_page',
        arguments: { page }
      }
    )

    if (result.success) {
      pageContent.value = result.data.content
      currentPage.value = page
    } else {
      error.value = result.error || '读取失败'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isLoading.value = false
  }
}

// 搜索文本
const searchText = async () => {
  if (!pdfInfo.value || !searchQuery.value.trim()) return

  try {
    isLoading.value = true
    const result = await invoke<{ success: boolean; data: any; error?: string }>(
      'plugin_execute_tool',
      {
        pluginId: props.pluginId,
        toolName: 'search_pdf',
        arguments: { query: searchQuery.value }
      }
    )

    if (result.success) {
      searchResults.value = result.data.results
    } else {
      error.value = result.error || '搜索失败'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isLoading.value = false
  }
}

// 跳转到搜索结果页
const goToSearchResult = (page: number) => {
  loadPage(page)
  searchResults.value = []
}

// 上一页
const prevPage = () => {
  if (currentPage.value > 1) {
    loadPage(currentPage.value - 1)
  }
}

// 下一页
const nextPage = () => {
  if (pdfInfo.value && currentPage.value < pdfInfo.value.page_count) {
    loadPage(currentPage.value + 1)
  }
}

// 初始化 - 尝试获取当前打开的 PDF 信息
onMounted(async () => {
  try {
    const result = await invoke<{ success: boolean; data: any; error?: string }>(
      'plugin_execute_tool',
      {
        pluginId: props.pluginId,
        toolName: 'get_pdf_info',
        arguments: {}
      }
    )

    if (result.success && result.data.path) {
      pdfInfo.value = result.data
      await loadPage(1)
    }
  } catch {
    // 没有打开的 PDF，忽略错误
  }
})
</script>

<template>
  <div class="pdf-panel">
    <!-- 标题栏 -->
    <div class="panel-header">
      <svg class="panel-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
      </svg>
      <span class="panel-title">PDF 阅读器</span>
    </div>

    <!-- 打开文件按钮 -->
    <button class="open-btn" @click="openPdf" :disabled="isLoading">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h4v-2H5V8h14v10h-4v2h4c1.1 0 2-.9 2-2V6c0-1.1-.89-2-2-2zm-7 6l-4 4h3v6h2v-6h3l-4-4z"/>
      </svg>
      打开 PDF
    </button>

    <!-- 错误提示 -->
    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- PDF 信息 -->
    <div v-if="pdfInfo" class="pdf-info">
      <div class="info-row">
        <span class="info-label">文件</span>
        <span class="info-value" :title="pdfInfo.path">{{ fileName }}</span>
      </div>
      <div v-if="pdfInfo.title" class="info-row">
        <span class="info-label">标题</span>
        <span class="info-value">{{ pdfInfo.title }}</span>
      </div>
      <div v-if="pdfInfo.author" class="info-row">
        <span class="info-label">作者</span>
        <span class="info-value">{{ pdfInfo.author }}</span>
      </div>

      <!-- 页面导航 -->
      <div class="page-nav">
        <button class="nav-btn" @click="prevPage" :disabled="currentPage <= 1">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/>
          </svg>
        </button>
        <span class="page-info">{{ currentPage }} / {{ pdfInfo.page_count }}</span>
        <button class="nav-btn" @click="nextPage" :disabled="currentPage >= pdfInfo.page_count">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
        </button>
      </div>

      <!-- 搜索框 -->
      <div class="search-box">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索文本..."
          @keyup.enter="searchText"
        />
        <button class="search-btn" @click="searchText" :disabled="!searchQuery.trim()">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
        </button>
      </div>

      <!-- 搜索结果 -->
      <div v-if="searchResults.length > 0" class="search-results">
        <div class="results-header">找到 {{ searchResults.length }} 个结果</div>
        <div
          v-for="(result, idx) in searchResults"
          :key="idx"
          class="result-item"
          @click="goToSearchResult(result.page)"
        >
          <span class="result-page">第 {{ result.page }} 页</span>
          <span class="result-context">{{ result.context }}</span>
        </div>
      </div>

      <!-- 页面内容预览 -->
      <div v-if="pageContent" class="page-content">
        <div class="content-header">页面内容</div>
        <div class="content-text">{{ pageContent }}</div>
      </div>
    </div>

    <!-- 无文件提示 -->
    <div v-else class="no-pdf">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
      </svg>
      <p>未打开 PDF 文档</p>
      <p class="hint">点击上方按钮打开 PDF 文件</p>
    </div>

    <!-- 加载指示器 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="spinner"></div>
    </div>
  </div>
</template>

<style scoped>
.pdf-panel {
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

.open-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 12px 16px;
  padding: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.open-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.open-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.open-btn svg {
  width: 18px;
  height: 18px;
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

.pdf-info {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.info-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}

.info-label {
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
  width: 40px;
}

.info-value {
  color: white;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin: 16px 0;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.nav-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-btn svg {
  width: 20px;
  height: 20px;
}

.page-info {
  font-size: 14px;
  font-weight: 500;
}

.search-box {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.search-box input {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: white;
  font-size: 12px;
}

.search-box input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.search-box input:focus {
  outline: none;
  border-color: #667eea;
}

.search-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.search-btn:hover:not(:disabled) {
  background: rgba(102, 126, 234, 0.3);
}

.search-btn:disabled {
  opacity: 0.3;
}

.search-btn svg {
  width: 18px;
  height: 18px;
}

.search-results {
  margin-bottom: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  overflow: hidden;
}

.results-header {
  padding: 8px 12px;
  background: rgba(102, 126, 234, 0.2);
  font-size: 11px;
  font-weight: 500;
}

.result-item {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: background 0.2s ease;
}

.result-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.result-item:last-child {
  border-bottom: none;
}

.result-page {
  display: block;
  font-size: 11px;
  color: #667eea;
  margin-bottom: 4px;
}

.result-context {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.page-content {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  overflow: hidden;
}

.content-header {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
}

.content-text {
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.8);
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
}

.no-pdf {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
}

.no-pdf svg {
  width: 48px;
  height: 48px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.no-pdf p {
  margin: 0 0 4px;
}

.hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
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
