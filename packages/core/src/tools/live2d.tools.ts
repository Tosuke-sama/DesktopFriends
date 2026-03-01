/**
 * @Description Live2D 工具定义
 * 使用 @langchain/core 的 tool() 函数（浏览器兼容）
 */
import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface as Tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { ParsedMotion, ParsedExpression, ModelAnalysisResult } from './modelAnalyzer'

// ============ 类型定义 ============

/** 表情状态 */
export interface ExpressionState {
  expression: string | null
  expressionSetAt: number | null
}

export interface Live2DToolCallbacks {
  onPlayMotion: (motionId: string) => void
  onSetExpression: (name: string) => void
  onResetExpression: () => void
  /** 状态更新回调（可选，用于状态追踪） */
  onStateChange?: (state: ExpressionState) => void
}

export interface CreateLive2DToolsOptions {
  /** 使用模型分析结果（推荐） */
  analysisResult?: ModelAnalysisResult

  /** 或者直接传入动作/表情列表 */
  motions?: string[]
  expressions?: string[]

  /** 回调函数 */
  callbacks: Live2DToolCallbacks
}

// ============ 工具创建函数 ============

/**
 * 创建 Live2D 相关工具
 *
 * @example 使用模型分析结果（推荐）
 * ```ts
 * const analysis = parseModelConfig(modelConfig)
 * const tools = createLive2DTools({
 *   analysisResult: analysis,
 *   callbacks: { onPlayMotion, onSetExpression }
 * })
 * ```
 *
 * @example 直接传入列表
 * ```ts
 * const tools = createLive2DTools({
 *   motions: ['Idle', 'Flick', 'FlickDown'],
 *   expressions: ['happy', 'sad'],
 *   callbacks: { onPlayMotion, onSetExpression }
 * })
 * ```
 */
export function createLive2DTools(options: CreateLive2DToolsOptions) {
  const { analysisResult, callbacks } = options
  const tools: Tool[] = []

  // 获取动作列表
  let motionIds: string[] = []
  let motionDescription = ''

  if (analysisResult) {
    // 使用分析结果生成丰富的描述
    motionIds = analysisResult.motions.map(m => m.id)
    motionDescription = generateMotionToolDescription(analysisResult.motions)
  } else if (options.motions && options.motions.length > 0) {
    // 使用简单列表
    motionIds = options.motions
    motionDescription = `可用动作: ${motionIds.join(', ')}`
  }

  // 创建 playMotion 工具
  if (motionIds.length > 0) {
    const playMotionTool = tool(
      async ({ motionId }) => {
        callbacks.onPlayMotion(motionId)

        const motion = analysisResult?.motions.find(m => m.id === motionId)
        const desc = motion ? `(${motion.emotion}: ${motion.description})` : ''

        return `已播放动作: ${motionId} ${desc}`
      },
      {
        name: 'playMotion',
        description: `播放宠物动作来表达情绪。必须根据对话情绪选择合适的动作。

${motionDescription}

使用规则:
1. 每次回复都应该调用此工具表达情绪
2. 根据对话内容选择匹配的情绪动作
3. 动作 ID 格式为 "组名:动作名" 或简单名称`,
        schema: z.object({
          motionId: z.enum(motionIds as [string, ...string[]])
            .describe('要播放的动作 ID')
        })
      }
    )

    tools.push(playMotionTool)
  }

  // 获取表情列表
  let expressionNames: string[] = []
  let expressionDescription = ''

  if (analysisResult && analysisResult.expressions.length > 0) {
    expressionNames = analysisResult.expressions.map(e => e.name)
    expressionDescription = generateExpressionToolDescription(analysisResult.expressions)
  } else if (options.expressions && options.expressions.length > 0) {
    expressionNames = options.expressions
    expressionDescription = `可用表情: ${expressionNames.join(', ')}`
  }

  // 创建 setExpression 工具
  if (expressionNames.length > 0) {
    const setExpressionTool = tool(
      async ({ name }) => {
        callbacks.onSetExpression(name)
        // 更新状态
        callbacks.onStateChange?.({ expression: name, expressionSetAt: Date.now() })

        const expr = analysisResult?.expressions.find(e => e.name === name)
        const desc = expr ? `(${expr.emotion}: ${expr.description})` : ''

        return `已设置表情: ${name} ${desc}`
      },
      {
        name: 'setExpression',
        description: `设置宠物表情。表情会持续显示直到被更改或重置。

${expressionDescription}`,
        schema: z.object({
          name: z.enum(expressionNames as [string, ...string[]])
            .describe('要设置的表情名称')
        })
      }
    )

    tools.push(setExpressionTool)
  }

  // 创建 resetExpression 工具（始终创建，不依赖表情列表）
  const resetExpressionTool = tool(
    async () => {
      callbacks.onResetExpression()
      // 清除状态
      callbacks.onStateChange?.({ expression: null, expressionSetAt: null })

      return '已重置为默认表情'
    },
    {
      name: 'resetExpression',
      description: '重置宠物表情为默认状态。当不需要保持特定表情时使用，比如对话结束后或想要恢复自然状态时。表情已持续超过30秒时应该考虑使用此工具。',
      schema: z.object({})
    }
  )

  tools.push(resetExpressionTool)

  return tools
}

// ============ 描述生成辅助函数 ============

/**
 * 生成动作工具的详细描述
 */
function generateMotionToolDescription(motions: ParsedMotion[]): string {
  // 按情绪分组
  const groups = new Map<string, ParsedMotion[]>()

  for (const motion of motions) {
    const existing = groups.get(motion.emotion) || []
    existing.push(motion)
    groups.set(motion.emotion, existing)
  }

  const lines: string[] = ['动作列表（按情绪分类）:']

  for (const [emotion, items] of groups) {
    const motionList = items.map(m => m.id).join(', ')
    lines.push(`- ${emotion}: ${motionList}`)
  }

  lines.push('')
  lines.push('动作详情:')

  // 只列出前 10 个动作的详情，避免描述过长
  const detailItems = motions.slice(0, 10)
  for (const motion of detailItems) {
    lines.push(`- ${motion.id}: ${motion.description}`)
  }

  if (motions.length > 10) {
    lines.push(`- ... 还有 ${motions.length - 10} 个动作`)
  }

  return lines.join('\n')
}

/**
 * 生成表情工具的详细描述
 */
function generateExpressionToolDescription(expressions: ParsedExpression[]): string {
  const lines: string[] = ['可用表情:']

  for (const expr of expressions) {
    lines.push(`- ${expr.name}: ${expr.description}`)
  }

  return lines.join('\n')
}

// ============ 快捷函数 ============

/**
 * 根据情绪推荐动作
 * 供 Agent 在不确定时使用
 */
export function suggestMotionByEmotion(
  emotion: string,
  motions: ParsedMotion[]
): string | null {
  const matching = motions.filter(m =>
    m.emotion.includes(emotion) || emotion.includes(m.emotion)
  )

  if (matching.length > 0) {
    // 返回第一个匹配的动作
    return matching[0].id
  }

  // 尝试模糊匹配
  const emotionMap: Record<string, string[]> = {
    '开心': ['开心', '快乐', '高兴', '愉快', 'happy', 'joy'],
    '难过': ['难过', '悲伤', '伤心', 'sad', 'unhappy'],
    '生气': ['生气', '愤怒', '恼火', 'angry', 'mad'],
    '惊讶': ['惊讶', '震惊', '意外', 'surprise', 'shock'],
    '害羞': ['害羞', '腼腆', '不好意思', 'shy', 'embarrassed'],
    '平静': ['平静', '正常', '待机', 'idle', 'normal', 'calm'],
  }

  for (const [category, keywords] of Object.entries(emotionMap)) {
    if (keywords.some(k => emotion.includes(k) || k.includes(emotion))) {
      const categoryMotions = motions.filter(m => m.emotion === category)
      if (categoryMotions.length > 0) {
        return categoryMotions[0].id
      }
    }
  }

  // 默认返回第一个动作（通常是 Idle）
  return motions[0]?.id || null
}
