/**
 * 系统事件监听 Composable
 *
 * 监听来自 Rust 后端的系统事件：
 * - file-open: 文件打开事件
 * - text-select: 文本选择事件（划词）
 */

import { ref } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/** 文件打开事件数据 */
export interface FileOpenEvent {
  path: string
  file_type: string
  file_name: string
}

/** 文本选择事件数据 */
export interface TextSelectEvent {
  text: string
  source: string
}

/** 系统事件回调 */
export interface SystemEventCallbacks {
  onFileOpen?: (event: FileOpenEvent) => void
  onTextSelect?: (event: TextSelectEvent) => void
}

/**
 * 系统事件监听 Composable
 */
export function useSystemEvents(callbacks: SystemEventCallbacks = {}) {
  const lastFileEvent = ref<FileOpenEvent | null>(null)
  const lastTextEvent = ref<TextSelectEvent | null>(null)

  const unlisteners: UnlistenFn[] = []

  /**
   * 初始化事件监听
   */
  const init = async () => {
    try {
      // 监听文件打开事件
      const unlistenFileOpen = await listen<FileOpenEvent>('file-open', (event) => {
        console.log('[SystemEvents] 文件打开事件:', event.payload)
        lastFileEvent.value = event.payload
        callbacks.onFileOpen?.(event.payload)
      })
      unlisteners.push(unlistenFileOpen)

      // 监听文本选择事件
      const unlistenTextSelect = await listen<TextSelectEvent>('text-select', (event) => {
        console.log('[SystemEvents] 文本选择事件:', event.payload)
        lastTextEvent.value = event.payload
        callbacks.onTextSelect?.(event.payload)
      })
      unlisteners.push(unlistenTextSelect)

      console.log('[SystemEvents] 事件监听已初始化')
    } catch (e) {
      console.error('[SystemEvents] 初始化失败:', e)
    }
  }

  /**
   * 清理事件监听
   */
  const cleanup = () => {
    unlisteners.forEach((unlisten) => unlisten())
    unlisteners.length = 0
    console.log('[SystemEvents] 事件监听已清理')
  }

  return {
    lastFileEvent,
    lastTextEvent,
    init,
    cleanup,
  }
}

/**
 * 生成文件打开的系统提示
 */
export function generateFileOpenPrompt(event: FileOpenEvent): string {
  const typeDescriptions: Record<string, string> = {
    pdf: 'PDF 文档',
    txt: '文本文件',
    md: 'Markdown 文档',
    doc: 'Word 文档',
    docx: 'Word 文档',
    jpg: '图片',
    jpeg: '图片',
    png: '图片',
    gif: '图片',
  }

  const typeDesc = typeDescriptions[event.file_type] || `${event.file_type.toUpperCase()} 文件`

  return `[系统提示] 主人打开了一个${typeDesc}：「${event.file_name}」（路径：${event.path}）。请根据文件类型与名字做出适当的反应。`
}

/**
 * 生成文本选择的系统提示
 */
export function generateTextSelectPrompt(event: TextSelectEvent): string {
  // 如果文本过长，截断显示
  const maxLength = 200
  const displayText =
    event.text.length > maxLength ? event.text.slice(0, maxLength) + '...' : event.text

  return `[系统提示] 主人选中了一段文字：「${displayText}」。请按照要求帮助主人理解或处理这段文字，如果没有特别要求，就返回你的人设对此的反应，注意无论是内心独白还是回复都不能涉及到这段[系统提示] 除选中文字外的内容。`
}
