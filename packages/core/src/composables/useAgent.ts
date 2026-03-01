/**
 * @Description
 */
/**
 * LangChain Agent Vue Composable
 * 封装 PetAgent 类，提供响应式状态管理
 */
import { ref, shallowRef, computed, onUnmounted } from 'vue'
import { PetAgent, type PetAgentConfig, type AgentResponse } from '../agent'
import type { ModelAnalysisResult, ParsedMotion, ParsedExpression } from '../tools'
import { analyzeMotionsWithLLM } from '../tools'
import type { LLMConfig } from '@desktopfriends/shared'
import type { StructuredToolInterface } from '@langchain/core/tools'

// 表情自动重置时间（毫秒）
const EXPRESSION_RESET_TIMEOUT = 30000 // 30 秒

export interface UseLangChainAgentOptions {
  // 初始 LLM 配置
  initialConfig?: LLMConfig

  // 宠物配置
  petName: string
  customPrompt?: string

  // Live2D 回调
  onPlayMotion?: (name: string) => void
  onSetExpression?: (name: string) => void
  onResetExpression?: () => void

  // 认知回调
  onThinking?: (thought: string) => void
  onDecision?: (shouldReply: boolean, reason: string) => void

  // 可选：小组件上下文
  widgetContext?: PetAgentConfig['widgetContext']

  // 可选：多宠物通信上下文
  p2pContext?: PetAgentConfig['p2pContext']

  // 可选：外部插件工具（桌面端插件系统）
  pluginTools?: StructuredToolInterface[]
}

export function useLangChainAgent(options: UseLangChainAgentOptions) {
  // ============ 响应式状态 ============
  const isLoading = ref(false)
  const error = ref<Error | null>(null)
  const lastResponse = shallowRef<AgentResponse | null>(null)
  const thinking = ref<string | null>(null)
  const shouldReply = ref(true)
  const isInitialized = ref(false)

  // Agent 实例（使用 shallowRef 避免深度响应）
  const agent = shallowRef<PetAgent | null>(null)

  // Live2D 配置
  const motions = ref<string[]>(['Idle', 'Tap', 'Flick', 'FlickDown'])
  const expressions = ref<string[]>([])
  const analysisResult = shallowRef<ModelAnalysisResult | null>(null)

  // 可选上下文（使用传入的初始值）
  const widgetContext = shallowRef<PetAgentConfig['widgetContext']>(options.widgetContext)
  const p2pContext = shallowRef<PetAgentConfig['p2pContext']>(options.p2pContext)
  const pluginTools = shallowRef<StructuredToolInterface[] | undefined>(options.pluginTools)

  // 表情自动重置定时器
  let expressionResetTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 调度表情自动重置
   */
  const scheduleExpressionReset = () => {
    // 取消之前的定时器
    if (expressionResetTimer) {
      clearTimeout(expressionResetTimer)
    }
    // 设置新的定时器
    console.log('[LangChainAgent] 调度表情自动重置，将在 30 秒后执行')
    expressionResetTimer = setTimeout(() => {
      console.log('[LangChainAgent] 定时器触发，重置表情')
      options.onResetExpression?.()
      expressionResetTimer = null
    }, EXPRESSION_RESET_TIMEOUT)
  }

  /**
   * 取消表情重置定时器
   */
  const cancelExpressionReset = () => {
    if (expressionResetTimer) {
      console.log('[LangChainAgent] 取消表情重置定时器')
      clearTimeout(expressionResetTimer)
      expressionResetTimer = null
    }
  }

  // ============ 核心方法 ============

  /**
   * 初始化 Agent
   * @param llmConfig LLM 配置
   */
  const initAgent = async (llmConfig: LLMConfig) => {
    try {
      const config: PetAgentConfig = {
        llmConfig,
        petName: options.petName,
        customPrompt: options.customPrompt,
        // 优先使用分析结果，否则使用简单列表
        analysisResult: analysisResult.value || undefined,
        motions: analysisResult.value ? undefined : motions.value,
        expressions: analysisResult.value ? undefined : expressions.value,
        callbacks: {
          onPlayMotion: options.onPlayMotion || (() => { }),
          onSetExpression: (name: string) => {
            console.log('[LangChainAgent] 设置表情:', name)
            options.onSetExpression?.(name)
            // 设置表情后调度自动重置
            scheduleExpressionReset()
          },
          onResetExpression: () => {
            console.log('[LangChainAgent] 重置表情')
            options.onResetExpression?.()
            // 重置时取消定时器
            cancelExpressionReset()
          },
          onThinking: (thought) => {
            thinking.value = thought
            options.onThinking?.(thought)
          },
          onDecision: (reply, reason) => {
            shouldReply.value = reply
            options.onDecision?.(reply, reason)
          }
        },
        widgetContext: widgetContext.value,
        p2pContext: p2pContext.value,
        pluginTools: pluginTools.value,
      }

      agent.value = new PetAgent(config)
      await agent.value.initialize()
      isInitialized.value = true
    } catch (e) {
      error.value = e as Error
      throw e
    }
  }

  /**
   * 发送消息并获取回复
   * @param content 用户消息内容
   * @returns Agent 响应
   */
  const sendMessage = async (content: string): Promise<AgentResponse> => {
    if (!agent.value) {
      throw new Error('Agent not initialized. Call initAgent first.')
    }

    isLoading.value = true
    error.value = null
    thinking.value = null

    try {
      const response = await agent.value.sendMessage(content)
      lastResponse.value = response
      return response
    } catch (e) {
      error.value = e as Error
      throw e
    } finally {
      isLoading.value = false
    }
  }

  // ============ 配置更新方法 ============

  /**
   * 设置模型分析结果（推荐方式）
   * 使用 parseModelConfig 或 parseModelConfigWithLLM 的结果
   */
  const setModelAnalysis = async (result: ModelAnalysisResult) => {
    analysisResult.value = result
    // 同时更新 motions 和 expressions 列表（用于兼容）
    motions.value = result.motions.map(m => m.id)
    expressions.value = result.expressions.map(e => e.name)

    if (agent.value) {
      await agent.value.updateConfig({ analysisResult: result })
    }
  }

  /**
   * 设置可用动作（简单方式）
   * 直接传入动作和表情列表
   */
  const setAvailableActions = async (
    newMotions: string[],
    newExpressions: string[]
  ) => {
    motions.value = newMotions
    expressions.value = newExpressions
    analysisResult.value = null // 清除分析结果

    if (agent.value) {
      await agent.value.updateConfig({
        motions: newMotions,
        expressions: newExpressions,
        analysisResult: undefined
      })
    }
  }

  /**
   * 使用 LLM 分析动作并设置（推荐方式）
   * 先尝试 LLM 分析，失败时回退到简单模式
   * @param motionInfos 动作详情列表（从 Live2DCanvas 获取）
   * @param expressionNames 表情名称列表
   * @param llmConfig LLM 配置（用于分析，默认使用 agent 的配置）
   */
  const analyzeAndSetActions = async (
    motionInfos: Array<{ name: string; group: string; index: number }>,
    expressionNames: string[],
    llmConfig?: LLMConfig
  ) => {
    const motionNames = motionInfos.map(m => m.name)

    // 如果没有 LLM 配置，直接使用简单模式
    const config = llmConfig || agent.value?.['config']?.llmConfig
    if (!config?.apiKey) {
      console.log('[LangChainAgent] 无 LLM 配置，使用简单动作模式')
      return setAvailableActions(motionNames, expressionNames)
    }

    try {
      console.log('[LangChainAgent] 尝试使用 LLM 分析动作...')
      const motionList = motionInfos.map(m => ({
        group: m.group,
        name: m.name,
        file: '',
      }))

      const llmAnalysis = await analyzeMotionsWithLLM(motionList, {
        invoke: async (prompt: string) => {
          const url = config.baseUrl || (
            config.provider === 'openai' ? 'https://api.openai.com/v1/chat/completions'
              : config.provider === 'deepseek' ? 'https://api.deepseek.com/v1/chat/completions'
                : config.baseUrl || 'https://api.openai.com/v1/chat/completions'
          )
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          }
          if (config.provider === 'claude') {
            headers['x-api-key'] = config.apiKey
            headers['anthropic-version'] = '2023-06-01'
          } else {
            headers['Authorization'] = `Bearer ${config.apiKey}`
          }

          const body = config.provider === 'claude'
            ? {
              model: config.model || 'claude-3-haiku-20240307',
              max_tokens: 1000,
              messages: [{ role: 'user', content: prompt }],
            }
            : {
              model: config.model || 'gpt-4o-mini',
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 1000,
            }

          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          })

          if (!response.ok) throw new Error(`LLM API error: ${response.status}`)

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = await response.json() as any
          if (config.provider === 'claude') {
            return data.content?.[0]?.text || ''
          }
          return data.choices?.[0]?.message?.content || ''
        },
        enableCache: true,
        cacheKeyPrefix: `agent_${options.petName}`,
      })

      console.log('[LangChainAgent] LLM 分析结果:', llmAnalysis)

      // 构建 ModelAnalysisResult
      const parsedMotions: ParsedMotion[] = motionInfos.map(m => {
        const key = `${m.group}:${m.name}`
        const analysis = llmAnalysis.get(key)
        return {
          id: `${m.group}:${m.name}`,
          group: m.group,
          name: m.name,
          file: '',
          emotion: analysis?.emotion || '表达',
          description: analysis?.description || `${m.name} 动作`,
        }
      })

      const parsedExpressions: ParsedExpression[] = expressionNames.map(name => ({
        name,
        file: '',
        emotion: '表情',
        description: `${name} 表情`,
      }))

      // 生成工具描述
      const emotionGroups = new Map<string, ParsedMotion[]>()
      for (const motion of parsedMotions) {
        const existing = emotionGroups.get(motion.emotion) || []
        existing.push(motion)
        emotionGroups.set(motion.emotion, existing)
      }
      const descLines: string[] = ['## 可用动作和表情', '']
      for (const [emotion, items] of emotionGroups) {
        descLines.push(`**${emotion}**: ${items.map(i => i.id).join(', ')}`)
      }
      if (parsedExpressions.length > 0) {
        descLines.push(`\n**表情**: ${parsedExpressions.map(e => e.name).join(', ')}`)
      }

      const result: ModelAnalysisResult = {
        motions: parsedMotions,
        expressions: parsedExpressions,
        motionGroups: [...new Set(motionInfos.map(m => m.group))],
        toolDescription: descLines.join('\n'),
      }

      console.log('[LangChainAgent] LLM 分析成功，应用分析结果')
      return setModelAnalysis(result)
    } catch (e) {
      console.warn('[LangChainAgent] LLM 分析失败，回退到简单模式:', e)
      return setAvailableActions(motionNames, expressionNames)
    }
  }

  /**
   * 设置小组件上下文
   */
  const setWidgetContext = async (context: PetAgentConfig['widgetContext']) => {
    widgetContext.value = context
    if (agent.value) {
      await agent.value.updateConfig({ widgetContext: context })
    }
  }

  /**
   * 设置多宠物通信上下文
   */
  const setP2PContext = async (context: PetAgentConfig['p2pContext']) => {
    p2pContext.value = context
    if (agent.value) {
      await agent.value.updateConfig({ p2pContext: context })
    }
  }

  /**
   * 设置外部插件工具
   */
  const setPluginTools = async (tools: StructuredToolInterface[]) => {
    pluginTools.value = tools
    if (agent.value) {
      await agent.value.updateConfig({ pluginTools: tools })
    }
  }

  /**
   * 更新 LLM 配置
   */
  const updateLLMConfig = async (config: LLMConfig) => {
    if (agent.value) {
      await agent.value.updateConfig({ llmConfig: config })
    }
  }

  /**
   * 更新宠物信息
   */
  const updatePetInfo = async (petName: string, customPrompt?: string) => {
    if (agent.value) {
      await agent.value.updateConfig({ petName, customPrompt })
    }
  }

  /**
   * 清空对话历史
   */
  const clearHistory = () => {
    if (agent.value) {
      agent.value.clearHistory()
    }
    lastResponse.value = null
    thinking.value = null
  }

  // ============ 计算属性 ============

  /**
   * 获取当前工具列表
   */
  const tools = computed(() => {
    return agent.value?.getTools() || []
  })

  /**
   * 获取可用动作列表
   */
  const availableMotions = computed(() => motions.value)

  /**
   * 获取可用表情列表
   */
  const availableExpressions = computed(() => expressions.value)

  // ============ 自动初始化 ============

  // 如果有初始配置，自动初始化
  if (options.initialConfig) {
    initAgent(options.initialConfig)
  }

  // ============ 清理 ============

  // 组件卸载时清理定时器
  onUnmounted(() => {
    cancelExpressionReset()
  })

  // ============ 返回 ============

  return {
    // 状态
    isLoading,
    isInitialized,
    error,
    lastResponse,
    thinking,
    shouldReply,

    // 计算属性
    tools,
    availableMotions,
    availableExpressions,

    // 核心方法
    initAgent,
    sendMessage,

    // 配置方法
    setModelAnalysis,
    setAvailableActions,
    analyzeAndSetActions,
    setWidgetContext,
    setP2PContext,
    setPluginTools,
    updateLLMConfig,
    updatePetInfo,
    clearHistory
  }
}
