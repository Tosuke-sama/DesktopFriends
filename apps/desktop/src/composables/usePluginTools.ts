/**
 * 插件工具桥接 Composable
 *
 * 将插件系统的工具集成到 LLM 聊天系统
 */

import { ref, watch } from 'vue'
import { usePluginSystem } from '../plugins/usePluginSystem'
import type { ExternalToolDefinition, ExternalToolExecutor } from '@desktopfriends/core'

/**
 * 插件工具桥接
 *
 * 自动同步插件工具到 chat 系统
 */
export function usePluginTools() {
  const {
    enabledPlugins,
    getPluginTools,
    executePluginTool,
    initialize,
  } = usePluginSystem()

  // 转换后的外部工具列表
  const externalTools = ref<ExternalToolDefinition[]>([])

  // 是否已初始化
  const isInitialized = ref(false)

  /**
   * 刷新插件工具列表
   */
  const refreshTools = async () => {
    try {
      const tools = await getPluginTools()

      // 转换为 ExternalToolDefinition 格式
      externalTools.value = tools.map(tool => ({
        source: tool.pluginId,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }))

      console.log(`[PluginTools] 已加载 ${externalTools.value.length} 个插件工具`)
    } catch (e) {
      console.error('[PluginTools] 刷新工具列表失败:', e)
      externalTools.value = []
    }
  }

  /**
   * 外部工具执行器
   *
   * 将工具调用路由到对应的插件
   */
  const toolExecutor: ExternalToolExecutor = async (
    source: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> => {
    console.log(`[PluginTools] 执行工具: ${source}.${toolName}`, args)

    const result = await executePluginTool(source, toolName, args)

    if (result.success) {
      // 将结果数据转换为字符串返回给 LLM
      if (typeof result.data === 'string') {
        return result.data
      }
      return JSON.stringify(result.data)
    } else {
      throw new Error(result.error || '工具执行失败')
    }
  }

  /**
   * 初始化插件工具系统
   */
  const init = async () => {
    if (isInitialized.value) return

    await initialize()
    await refreshTools()
    isInitialized.value = true
  }

  // 监听启用插件列表变化，自动刷新工具
  watch(enabledPlugins, () => {
    if (isInitialized.value) {
      refreshTools()
    }
  }, { deep: true })

  return {
    // 状态
    externalTools,
    isInitialized,

    // 方法
    init,
    refreshTools,
    toolExecutor,
  }
}
