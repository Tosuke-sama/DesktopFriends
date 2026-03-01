/**
 * @Description 宠物 Agent 核心类
 * 使用原生 fetch 调用 LLM API，保留 LangChain 工具执行层
 * 解决 LangChain bindTools() 在 @langchain/core@1.1.17 上 tool_calls 失效的问题
 */
import type { StructuredToolInterface } from '@langchain/core/tools'

import { createPetSystemPrompt } from './prompts'
import { createAgentMemory, generateSessionId, type AgentMessage } from './memory'
import {
  createLive2DTools,
  createWidgetTools,
  createCognitiveTools,
  createCommunicationTools,
  type LangChainTool,
} from '../tools'

import type { LLMConfig, PetInfo, TodoItem, WidgetContext, PetMessage } from '@desktopfriends/shared'

export interface PetAgentConfig {
  llmConfig: LLMConfig
  petName: string
  customPrompt?: string
  analysisResult?: import('../tools').ModelAnalysisResult
  motions?: string[]
  expressions?: string[]
  callbacks: {
    onPlayMotion: (name: string) => void
    onSetExpression: (name: string) => void
    onResetExpression: () => void
    onThinking: (thought: string) => void
    onDecision: (shouldReply: boolean, reason: string) => void
  }
  widgetContext?: {
    getTodos: () => TodoItem[]
    addTodo: (text: string) => TodoItem
    completeTodo: (id: string) => boolean
    getWidgetContexts: () => WidgetContext[]
  }
  p2pContext?: {
    getOnlinePets: () => PetInfo[]
    getRecentMessages: () => PetMessage[]
    sendMessageToPet: (targetId: string, content: string) => void
    broadcastMessage: (content: string) => void
  }
  pluginTools?: StructuredToolInterface[]
  maxIterations?: number
}

export interface AgentResponse {
  content: string | null
  thinking: string | null
  toolCalls: Array<{
    name: string
    arguments: Record<string, unknown>
    result?: string
  }>
  shouldReply: boolean
}

/** OpenAI 原生 tools 格式 */
interface OpenAIToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required: string[]
    }
  }
}

/** LLM API 原始响应中的 tool call */
interface RawToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/**
 * 宠物 Agent 核心类
 * 原生 fetch 调用 LLM + LangChain 工具执行
 */
export class PetAgent {
  private tools: LangChainTool[] = []
  private toolsMap: Map<string, StructuredToolInterface> = new Map()
  /** 原生 OpenAI 格式的工具定义 */
  private nativeToolDefs: OpenAIToolDefinition[] = []
  private memoryManager: ReturnType<typeof createAgentMemory>
  private config: PetAgentConfig
  private sessionId: string
  private systemPrompt: string = ''

  // 状态追踪
  private lastThinking: string | null = null
  private lastDecision: { shouldReply: boolean; reason: string } | null = null
  private toolCallResults: Array<{ name: string; arguments: Record<string, unknown>; result?: string }> = []

  // 表情状态追踪
  private currentExpression: string | null = null
  private expressionSetAt: number | null = null

  constructor(config: PetAgentConfig) {
    this.config = config
    this.memoryManager = createAgentMemory({
      persistKey: `pet-agent-${config.petName}`,
    })
    this.sessionId = generateSessionId()
    this.initializeTools()
  }

  /**
   * 初始化工具集
   */
  private initializeTools() {
    const { analysisResult, motions, expressions, callbacks, widgetContext, p2pContext } = this.config
    this.tools = []
    this.toolsMap.clear()
    this.nativeToolDefs = []

    // Live2D 工具
    const live2dTools = createLive2DTools({
      analysisResult,
      motions,
      expressions,
      callbacks: {
        onPlayMotion: callbacks.onPlayMotion,
        onSetExpression: callbacks.onSetExpression,
        onResetExpression: callbacks.onResetExpression,
        onStateChange: (state) => {
          this.currentExpression = state.expression
          this.expressionSetAt = state.expressionSetAt
        },
      },
    })
    this.tools.push(...live2dTools)

    // 认知工具
    const cognitiveTools = createCognitiveTools({
      onThinking: (thought) => {
        this.lastThinking = thought
        callbacks.onThinking(thought)
      },
      onDecision: (shouldReply, reason) => {
        this.lastDecision = { shouldReply, reason }
        callbacks.onDecision(shouldReply, reason)
      },
    })
    this.tools.push(...cognitiveTools)

    // 小组件工具
    if (widgetContext) {
      this.tools.push(...createWidgetTools(widgetContext))
    }

    // 多宠物通信工具
    if (p2pContext) {
      this.tools.push(...createCommunicationTools(p2pContext))
    }

    // 外部插件工具
    if (this.config.pluginTools?.length) {
      this.tools.push(...this.config.pluginTools)
    }

    // 构建工具映射
    for (const tool of this.tools) {
      this.toolsMap.set(tool.name, tool)
    }

    // 生成原生 OpenAI 格式的工具定义
    this.nativeToolDefs = this.tools.map(t => this.langchainToolToOpenAI(t))

    console.log('[PetAgent] Tools initialized:', this.nativeToolDefs.map(t => t.function.name))
  }

  /**
   * 将 LangChain tool 转换为原生 OpenAI function calling 格式
   */
  private langchainToolToOpenAI(tool: StructuredToolInterface): OpenAIToolDefinition {
    let parameters: OpenAIToolDefinition['function']['parameters'] = {
      type: 'object',
      properties: {},
      required: [],
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolAny = tool as any
      if (toolAny.schema && typeof toolAny.schema.shape === 'object') {
        const shape = toolAny.schema.shape
        const props: Record<string, unknown> = {}
        const required: string[] = []

        for (const [key, zodField] of Object.entries(shape)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const field = zodField as any
          const prop: Record<string, unknown> = {}

          // 解包 ZodOptional（兼容 Zod v3 和 v4）
          let innerField = field
          let isOptional = false
          const defType = field._def?.typeName || field._def?.type
          if (defType === 'ZodOptional' || defType === 'optional') {
            isOptional = true
            innerField = field._def.innerType
          }

          // 获取内部类型标识（兼容 Zod v3 和 v4）
          const innerType = innerField._def?.typeName || innerField._def?.type

          // 检查是否是 enum 类型
          if (innerType === 'ZodEnum' || innerType === 'enum') {
            prop.type = 'string'
            // Zod v4: field.options (数组); Zod v3: _def.values (数组)
            prop.enum = innerField.options || innerField._def?.values
              || (innerField._def?.entries ? Object.values(innerField._def.entries) : undefined)
          } else if (innerType === 'ZodString' || innerType === 'string') {
            prop.type = 'string'
          } else if (innerType === 'ZodBoolean' || innerType === 'boolean') {
            prop.type = 'boolean'
          } else if (innerType === 'ZodNumber' || innerType === 'number') {
            prop.type = 'number'
          } else {
            prop.type = 'string'
          }

          // 获取描述（Zod v4: field.description; Zod v3: _def.description）
          if (innerField.description) {
            prop.description = innerField.description
          } else if (innerField._def?.description) {
            prop.description = innerField._def.description
          }

          props[key] = prop

          if (!isOptional) {
            required.push(key)
          }
        }

        parameters = { type: 'object', properties: props, required }
      }
    } catch (e) {
      console.warn(`[PetAgent] Failed to convert tool schema for "${tool.name}":`, e)
    }

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters,
      },
    }
  }

  /**
   * 初始化 Agent（设置系统提示词）
   */
  async initialize() {
    const { petName, customPrompt, widgetContext } = this.config

    let widgetContextStr = ''
    if (widgetContext) {
      const contexts = widgetContext.getWidgetContexts()
      widgetContextStr = contexts.map((c) => `- ${c.type}: ${c.summary}`).join('\n')
    }

    this.systemPrompt = createPetSystemPrompt({
      petName,
      customPrompt,
      widgetContext: widgetContextStr,
    })
  }

  /**
   * 刷新系统提示（包含最新状态）
   */
  private refreshSystemPrompt() {
    const { petName, customPrompt, widgetContext } = this.config

    let widgetContextStr = ''
    if (widgetContext) {
      const contexts = widgetContext.getWidgetContexts()
      widgetContextStr = contexts.map((c) => `- ${c.type}: ${c.summary}`).join('\n')
    }

    const expressionState = this.getExpressionState()

    this.systemPrompt = createPetSystemPrompt({
      petName,
      customPrompt,
      widgetContext: widgetContextStr,
      expressionState: expressionState.expression
        ? {
          expression: expressionState.expression,
          durationSeconds: expressionState.durationSeconds,
        }
        : undefined,
    })
  }

  // ============ 原生 fetch LLM 调用 ============

  /**
   * 构建 API 请求参数
   */
  private buildRequestParams(messages: AgentMessage[], withTools: boolean): {
    url: string
    headers: Record<string, string>
    body: Record<string, unknown>
  } {
    const { provider, apiKey, baseUrl, model } = this.config.llmConfig

    // 格式化消息
    const formattedMessages = messages.map(m => {
      if (m.role === 'tool') {
        return { role: 'tool', content: m.content, tool_call_id: m.tool_call_id }
      }
      if (m.tool_calls) {
        return { role: 'assistant', content: m.content, tool_calls: m.tool_calls }
      }
      return { role: m.role, content: m.content }
    })

    let url: string
    let headers: Record<string, string>
    let body: Record<string, unknown>

    const toolsPayload = withTools && this.nativeToolDefs.length > 0
      ? { tools: this.nativeToolDefs, tool_choice: 'auto' as const }
      : {}

    switch (provider) {
      case 'openai':
      case 'deepseek':
        url = baseUrl || (provider === 'openai'
          ? 'https://api.openai.com/v1/chat/completions'
          : 'https://api.deepseek.com/v1/chat/completions')
        headers = {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
        body = {
          model: model || (provider === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat'),
          messages: formattedMessages,
          max_tokens: 200,
          ...toolsPayload,
        }
        break

      case 'claude':
        url = baseUrl || 'https://api.anthropic.com/v1/messages'
        headers = {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        }
        body = {
          model: model || 'claude-3-haiku-20240307',
          max_tokens: 200,
          system: this.systemPrompt,
          messages: formattedMessages.filter(m => m.role !== 'system'),
          ...(withTools && this.nativeToolDefs.length > 0
            ? { tools: this.nativeToolDefs.map(t => this.openAIToolToClaude(t)) }
            : {}),
        }
        break

      case 'custom':
      default:
        if (provider === 'custom' && !baseUrl) {
          throw new Error('自定义 API 需要填写 API 地址')
        }
        url = baseUrl || 'https://api.openai.com/v1/chat/completions'
        headers = {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
        body = {
          model: model || 'gpt-4o-mini',
          messages: formattedMessages,
          max_tokens: 200,
          ...toolsPayload,
        }
        break
    }

    return { url, headers, body }
  }

  /**
   * 将 OpenAI 工具格式转换为 Claude 工具格式
   */
  private openAIToolToClaude(tool: OpenAIToolDefinition) {
    return {
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }
  }

  /**
   * 调用 LLM API
   */
  private async callLLM(messages: AgentMessage[], withTools: boolean): Promise<{
    content: string
    toolCalls: RawToolCall[]
  }> {
    const { url, headers, body } = this.buildRequestParams(messages, withTools)

    // console.log('[PetAgent] LLM Request:', {
    //   url,
    //   toolCount: this.nativeToolDefs.length,
    //   withTools,
    //   hasToolsInBody: 'tools' in body,
    //   toolNames: (body.tools as Array<OpenAIToolDefinition> | undefined)?.map(t => t.function.name),
    // })
    // console.log('[PetAgent] Request body:', JSON.stringify(body, null, 2))

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`API request failed: ${response.status} - ${JSON.stringify(errorData)}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as any
    console.log('[PetAgent] LLM Raw Response:', JSON.stringify(data, null, 2))

    return this.parseResponse(this.config.llmConfig.provider, data)
  }

  /**
   * 解析 LLM API 响应
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseResponse(provider: string, data: any): { content: string; toolCalls: RawToolCall[] } {
    const toolCalls: RawToolCall[] = []
    let content = ''
    let toolIdCounter = 0

    if (provider === 'claude') {
      // Claude 响应格式
      for (const block of data.content) {
        if (block.type === 'text') {
          content += block.text
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id || `tool_${toolIdCounter++}`,
            name: block.name,
            arguments: block.input,
          })
        }
      }
    } else {
      // OpenAI / DeepSeek / Custom 响应格式
      const message = data.choices[0].message
      content = message.content || ''

      if (message.tool_calls) {
        for (const tc of message.tool_calls) {
          toolCalls.push({
            id: tc.id || `tool_${toolIdCounter++}`,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          })
        }
      }
    }

    // 解析 DeepSeek DSML 格式的函数调用
    const dsmlPattern = /<｜DSML｜function_calls>([\s\S]*?)<\/｜DSML｜function_calls>/g
    const dsmlInvokePattern = /<｜DSML｜invoke name="([^"]+)">([\s\S]*?)<\/｜DSML｜invoke>/g
    const dsmlArgPattern1 = /<｜DSML｜function_arg name="([^"]+)">([^<]*)<\/｜DSML｜function_arg>/g
    const dsmlArgPattern2 = /<｜DSML｜parameter name="([^"]+)"[^>]*>([^<]*)<\/｜DSML｜parameter>/g

    let dsmlMatch
    while ((dsmlMatch = dsmlPattern.exec(content)) !== null) {
      const dsmlContent = dsmlMatch[1]
      let invokeMatch
      while ((invokeMatch = dsmlInvokePattern.exec(dsmlContent)) !== null) {
        const funcName = invokeMatch[1]
        const argsContent = invokeMatch[2]
        const args: Record<string, string> = {}

        let argMatch
        dsmlArgPattern1.lastIndex = 0
        while ((argMatch = dsmlArgPattern1.exec(argsContent)) !== null) {
          args[argMatch[1]] = argMatch[2]
        }

        dsmlArgPattern2.lastIndex = 0
        while ((argMatch = dsmlArgPattern2.exec(argsContent)) !== null) {
          args[argMatch[1]] = argMatch[2]
        }

        toolCalls.push({
          id: `dsml_${toolIdCounter++}`,
          name: funcName,
          arguments: args,
        })
      }
    }

    // 移除 DSML 标签
    content = content.replace(dsmlPattern, '').trim()

    return { content, toolCalls }
  }

  // ============ 工具执行 ============

  /**
   * 执行单个工具调用
   */
  private async executeToolCall(toolCall: {
    name: string
    args: Record<string, unknown>
    id?: string
  }): Promise<string> {
    const tool = this.toolsMap.get(toolCall.name)
    if (!tool) {
      return `Error: Tool "${toolCall.name}" not found`
    }

    try {
      const result = await tool.invoke(toolCall.args)
      return typeof result === 'string' ? result : JSON.stringify(result)
    } catch (error) {
      console.error(`Tool "${toolCall.name}" execution error:`, error)
      return `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  /**
   * 执行工具调用循环
   */
  private async executeToolCallLoop(
    initialMessages: AgentMessage[],
    maxIterations: number = 5
  ): Promise<{
    content: string
    allToolCalls: Array<{ name: string; arguments: Record<string, unknown>; result?: string }>
  }> {
    let currentMessages = [...initialMessages]
    const allToolCalls: Array<{ name: string; arguments: Record<string, unknown>; result?: string }> = []
    let iterations = 0
    let lastContent = ''

    while (iterations < maxIterations) {
      iterations++

      const { content, toolCalls } = await this.callLLM(currentMessages, true)
      lastContent = content

      console.log('[PetAgent] LLM response:', {
        iteration: iterations,
        contentPreview: content.substring(0, 80),
        toolCallCount: toolCalls.length,
        toolCallNames: toolCalls.map(tc => tc.name),
      })

      if (toolCalls.length === 0) {
        return { content, allToolCalls }
      }

      // 将 AI 响应（含 tool_calls）添加到消息
      const assistantMsg: AgentMessage = {
        role: 'assistant',
        content: content,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      }
      currentMessages.push(assistantMsg)

      // 执行所有工具调用并添加 tool 消息
      for (const toolCall of toolCalls) {
        console.log('[PetAgent] Executing tool:', toolCall.name, toolCall.arguments)
        const result = await this.executeToolCall({
          name: toolCall.name,
          args: toolCall.arguments,
          id: toolCall.id,
        })

        allToolCalls.push({
          name: toolCall.name,
          arguments: toolCall.arguments,
          result,
        })

        currentMessages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        })
      }
    }

    // 达到最大迭代次数，最后一次不带 tools 获取文字回复
    const { content: finalContent } = await this.callLLM(currentMessages, false)
    return { content: finalContent || lastContent, allToolCalls }
  }

  // ============ 公开方法 ============

  /**
   * 发送消息并获取回复
   */
  async sendMessage(content: string): Promise<AgentResponse> {
    if (!this.systemPrompt) {
      await this.initialize()
    }

    // 重置状态
    this.lastThinking = null
    this.lastDecision = null
    this.toolCallResults = []

    // 刷新系统提示
    this.refreshSystemPrompt()

    try {
      // 构建消息列表
      const messages: AgentMessage[] = [
        { role: 'system', content: this.systemPrompt },
        ...this.memoryManager.getMessages(),
        { role: 'user', content },
      ]

      // 保存用户消息到记忆
      this.memoryManager.addUserMessage(content)

      // 执行工具调用循环
      const { content: responseContent, allToolCalls } = await this.executeToolCallLoop(
        messages,
        this.config.maxIterations || 5
      )

      this.toolCallResults = allToolCalls

      let finalContent = responseContent

      // 检查是否选择不回复
      const decision = this.lastDecision as { shouldReply: boolean; reason: string } | null
      let shouldReply = decision?.shouldReply ?? true

      // 检查 <no-answer> 标签
      if (finalContent?.includes('<no-answer>')) {
        shouldReply = false
        finalContent = ''
      }

      // 提取 <thinking> 标签内容
      const thinkingMatch = finalContent?.match(/<thinking>([\s\S]*?)<\/thinking>/)
      if (thinkingMatch) {
        this.lastThinking = thinkingMatch[1].trim()
        finalContent = finalContent.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim()
      }

      // 保存 AI 回复到记忆
      if (finalContent) {
        this.memoryManager.addAIMessage(finalContent)
      }

      return {
        content: shouldReply && finalContent ? finalContent : null,
        thinking: this.lastThinking,
        toolCalls: this.toolCallResults,
        shouldReply,
      }
    } catch (error) {
      console.error('Agent execution error:', error)
      throw error
    }
  }

  /**
   * 更新配置
   */
  async updateConfig(newConfig: Partial<PetAgentConfig>) {
    Object.assign(this.config, newConfig)

    const toolsChanged = !!(newConfig.analysisResult || newConfig.motions || newConfig.expressions || newConfig.callbacks || newConfig.widgetContext || newConfig.p2pContext || newConfig.pluginTools)

    if (toolsChanged) {
      this.initializeTools()
    }

    // LLM 配置变化时不需要重建模型实例了（每次请求都用 fetch）
  }

  /**
   * 清空对话历史
   */
  clearHistory() {
    this.memoryManager.clearHistory()
    this.sessionId = generateSessionId()
  }

  /**
   * 获取当前工具列表
   */
  getTools() {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
    }))
  }

  /**
   * 获取当前表情状态
   */
  getExpressionState() {
    return {
      expression: this.currentExpression,
      setAt: this.expressionSetAt,
      durationSeconds: this.expressionSetAt
        ? Math.floor((Date.now() - this.expressionSetAt) / 1000)
        : null,
    }
  }
}
