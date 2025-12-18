/**
 * 插件系统 Composable
 *
 * 提供插件管理的 Vue 响应式 API
 */

import { ref, computed, shallowRef } from 'vue'
import { invoke } from '@tauri-apps/api/tauri'
import { open } from '@tauri-apps/api/dialog'
import type { PluginInfo, ToolDefinition, ToolResult, HookResult } from './types'

/** 插件系统状态 */
const plugins = shallowRef<PluginInfo[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

/** 初始化标志 */
let initialized = false

/**
 * 插件系统 Composable
 */
export function usePluginSystem() {
  /**
   * 初始化插件系统
   * 自动获取已安装的插件列表
   */
  const initialize = async () => {
    if (initialized) return
    initialized = true
    await refreshPlugins()
  }

  /**
   * 刷新插件列表
   */
  const refreshPlugins = async () => {
    try {
      isLoading.value = true
      error.value = null
      plugins.value = await invoke<PluginInfo[]>('plugin_list')
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('获取插件列表失败:', e)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 安装插件
   * 打开文件选择对话框选择 zip 文件
   */
  const installPlugin = async (): Promise<PluginInfo | null> => {
    try {
      // 打开文件选择对话框
      const selected = await open({
        multiple: false,
        filters: [{ name: '插件包', extensions: ['zip'] }],
      })

      if (!selected || Array.isArray(selected)) {
        return null
      }

      isLoading.value = true
      error.value = null

      const info = await invoke<PluginInfo>('plugin_install', { zipPath: selected })
      await refreshPlugins()
      return info
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('安装插件失败:', e)
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 安装插件（指定路径）
   */
  const installPluginFromPath = async (zipPath: string): Promise<PluginInfo | null> => {
    try {
      isLoading.value = true
      error.value = null

      const info = await invoke<PluginInfo>('plugin_install', { zipPath })
      await refreshPlugins()
      return info
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('安装插件失败:', e)
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 卸载插件
   */
  const uninstallPlugin = async (pluginId: string): Promise<boolean> => {
    try {
      isLoading.value = true
      error.value = null

      await invoke('plugin_uninstall', { pluginId })
      await refreshPlugins()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('卸载插件失败:', e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 启用插件
   */
  const enablePlugin = async (pluginId: string): Promise<boolean> => {
    try {
      error.value = null
      await invoke('plugin_enable', { pluginId })
      await refreshPlugins()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('启用插件失败:', e)
      return false
    }
  }

  /**
   * 禁用插件
   */
  const disablePlugin = async (pluginId: string): Promise<boolean> => {
    try {
      error.value = null
      await invoke('plugin_disable', { pluginId })
      await refreshPlugins()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('禁用插件失败:', e)
      return false
    }
  }

  /**
   * 切换插件启用状态
   */
  const togglePlugin = async (pluginId: string, enabled: boolean): Promise<boolean> => {
    return enabled ? enablePlugin(pluginId) : disablePlugin(pluginId)
  }

  /**
   * 获取所有启用插件的工具
   */
  const getPluginTools = async (): Promise<ToolDefinition[]> => {
    try {
      return await invoke<ToolDefinition[]>('plugin_get_tools')
    } catch (e) {
      console.error('获取插件工具失败:', e)
      return []
    }
  }

  /**
   * 执行插件工具
   */
  const executePluginTool = async (
    pluginId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> => {
    try {
      return await invoke<ToolResult>('plugin_execute_tool', {
        pluginId,
        toolName,
        arguments: args,
      })
    } catch (e) {
      return {
        success: false,
        data: null,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }

  /**
   * 触发钩子
   */
  const triggerHook = async (
    hookName: string,
    data: Record<string, unknown>
  ): Promise<HookResult[]> => {
    try {
      return await invoke<HookResult[]>('plugin_trigger_hook', { hookName, data })
    } catch (e) {
      console.error('触发钩子失败:', e)
      return []
    }
  }

  /**
   * 读取插件 UI 文件
   */
  const readPluginUI = async (pluginId: string, path: string): Promise<string | null> => {
    try {
      return await invoke<string>('plugin_read_ui', { pluginId, path })
    } catch (e) {
      console.error('读取插件 UI 失败:', e)
      return null
    }
  }

  /**
   * 读取插件 README
   */
  const readPluginReadme = async (pluginId: string): Promise<string | null> => {
    try {
      // 首先尝试读取 README.md
      let content = await invoke<string>('plugin_read_ui', { pluginId, path: 'README.md' })
      if (content) return content

      // 如果没有找到，尝试 readme.md（小写）
      content = await invoke<string>('plugin_read_ui', { pluginId, path: 'readme.md' })
      return content
    } catch (e) {
      console.error('读取插件 README 失败:', e)
      return null
    }
  }

  /**
   * 更新插件配置
   */
  const setPluginConfig = async (
    pluginId: string,
    config: Record<string, unknown>
  ): Promise<boolean> => {
    try {
      await invoke('plugin_set_config', { pluginId, config })
      return true
    } catch (e) {
      console.error('更新插件配置失败:', e)
      return false
    }
  }

  /**
   * 打开插件窗口
   */
  const openPluginWindow = async (
    pluginId: string,
    windowName: string,
    title?: string,
    data?: Record<string, unknown>
  ): Promise<string | null> => {
    try {
      return await invoke<string>('open_plugin_window', {
        pluginId,
        windowName,
        title,
        data,
      })
    } catch (e) {
      console.error('打开插件窗口失败:', e)
      return null
    }
  }

  /**
   * 处理插件钩子响应中的动作
   */
  const handleHookAction = async (
    pluginId: string,
    response: Record<string, unknown>
  ): Promise<void> => {
    const action = response.action as string
    console.log(`[PluginSystem] 处理钩子动作:`, { pluginId, action, response })

    switch (action) {
      case 'open_window':
        // 打开插件窗口
        const windowName = response.window as string
        const title = response.title as string | undefined
        const data = response.data as Record<string, unknown> | undefined
        console.log(`[PluginSystem] 打开插件窗口:`, { pluginId, windowName, title, data })
        try {
          const result = await openPluginWindow(pluginId, windowName, title, data)
          console.log(`[PluginSystem] 窗口打开结果:`, result)
        } catch (e) {
          console.error(`[PluginSystem] 打开窗口失败:`, e)
        }
        break

      case 'error':
        console.error(`[Plugin ${pluginId}] 错误:`, response.message)
        break

      case 'notify':
        console.log(`[Plugin ${pluginId}] 通知:`, response.message)
        break

      default:
        console.log(`[Plugin ${pluginId}] 未知动作:`, action)
    }
  }

  /**
   * 触发钩子并处理响应中的动作
   */
  const triggerHookWithActions = async (
    hookName: string,
    data: Record<string, unknown>
  ): Promise<HookResult[]> => {
    const results = await triggerHook(hookName, data)
    console.log(`[PluginSystem] 钩子 ${hookName} 响应结果:`, results)

    // 处理每个插件的响应动作
    for (const result of results) {
      console.log(`[PluginSystem] 处理结果:`, result)
      if (result.data && typeof result.data === 'object' && 'action' in result.data) {
        await handleHookAction(result.pluginId, result.data as Record<string, unknown>)
      }
    }

    return results
  }

  // 计算属性
  const enabledPlugins = computed(() => plugins.value.filter((p) => p.enabled))

  const pluginsWithUI = computed(() => enabledPlugins.value.filter((p) => p.ui))

  const sidebarPlugins = computed(() =>
    pluginsWithUI.value.filter((p) => p.ui?.position === 'sidebar')
  )

  const toolbarPlugins = computed(() =>
    pluginsWithUI.value.filter((p) => p.ui?.position === 'toolbar')
  )

  const floatingPlugins = computed(() =>
    pluginsWithUI.value.filter((p) => p.ui?.position === 'floating')
  )

  return {
    // 状态
    plugins,
    enabledPlugins,
    pluginsWithUI,
    sidebarPlugins,
    toolbarPlugins,
    floatingPlugins,
    isLoading,
    error,

    // 方法
    initialize,
    refreshPlugins,
    installPlugin,
    installPluginFromPath,
    uninstallPlugin,
    enablePlugin,
    disablePlugin,
    togglePlugin,
    getPluginTools,
    executePluginTool,
    triggerHook,
    triggerHookWithActions,
    readPluginUI,
    readPluginReadme,
    setPluginConfig,
    openPluginWindow,
  }
}
