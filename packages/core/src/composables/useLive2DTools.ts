/**
 * Live2D 控制工具定义
 * 用于 AI Function Calling / Tool Use
 */

// Tool 调用结果
export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

// 默认动作（兼容旧代码）
export const LIVE2D_MOTIONS = [
  'Idle',       // 待机
  'Tap',        // 点击
  'Tap@Body',   // 点击身体
  'Flick',      // 轻弹（开心/兴奋）
  'FlickDown',  // 向下轻弹（难过/沮丧）
  'Flick@Body', // 轻弹身体
] as const

// 动态生成 OpenAI Function Calling 格式工具
export const generateOpenAITools = (motions: string[], expressions: string[]) => {
  const tools: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: object
    }
  }> = []

  // 动作工具
  if (motions.length > 0) {
    tools.push({
      type: 'function' as const,
      function: {
        name: 'playMotion',
        description: '播放宠物动作来表达情绪。必须根据对话情绪选择合适的动作。',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              enum: motions,
              description: `可用动作: ${motions.join(', ')}`,
            },
          },
          required: ['name'],
        },
      },
    })
  }

  // 表情工具
  if (expressions.length > 0) {
    tools.push({
      type: 'function' as const,
      function: {
        name: 'setExpression',
        description: '设置宠物表情来表达情绪。可以和动作一起使用。',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              enum: expressions,
              description: `可用表情: ${expressions.join(', ')}`,
            },
          },
          required: ['name'],
        },
      },
    })
  }

  return tools
}

// 动态生成 Claude Tool Use 格式工具
export const generateClaudeTools = (motions: string[], expressions: string[]) => {
  const tools: Array<{
    name: string
    description: string
    input_schema: object
  }> = []

  // 动作工具
  if (motions.length > 0) {
    tools.push({
      name: 'playMotion',
      description: '播放宠物动作来表达情绪。必须根据对话情绪选择合适的动作。',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            enum: motions,
            description: `可用动作: ${motions.join(', ')}`,
          },
        },
        required: ['name'],
      },
    })
  }

  // 表情工具
  if (expressions.length > 0) {
    tools.push({
      name: 'setExpression',
      description: '设置宠物表情来表达情绪。可以和动作一起使用。',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            enum: expressions,
            description: `可用表情: ${expressions.join(', ')}`,
          },
        },
        required: ['name'],
      },
    })
  }

  return tools
}

// 动态生成工具使用提示词
export const generateToolUsagePrompt = (motions: string[], expressions: string[]) => {
  const parts: string[] = []

  parts.push('【重要规则】')

  if (motions.length > 0 || expressions.length > 0) {
    parts.push('1. 你必须调用工具来表达情绪')
    parts.push('2. 你必须同时返回文字回复，不能只调用工具！')
    parts.push('')
  }

  if (motions.length > 0) {
    parts.push('【可用动作 - playMotion】')
    parts.push(`动作列表: ${motions.join(', ')}`)
    parts.push('使用 playMotion 函数播放动作')
    parts.push('')
  }

  if (expressions.length > 0) {
    parts.push('【可用表情 - setExpression】')
    parts.push(`表情列表: ${expressions.join(', ')}`)
    parts.push('使用 setExpression 函数设置表情')
    parts.push('')
  }

  if (motions.length > 0 || expressions.length > 0) {
    parts.push('【示例】')
    parts.push('用户说"你好"，你应该：')
    if (motions.length > 0) {
      parts.push(`1. 调用 playMotion(name="${motions[0]}") 播放动作`)
    }
    if (expressions.length > 0) {
      parts.push(`${motions.length > 0 ? '2' : '1'}. 调用 setExpression(name="${expressions[0]}") 设置表情`)
    }
    parts.push(`${motions.length > 0 && expressions.length > 0 ? '3' : '2'}. 回复文字"主人好呀~"`)
    parts.push('')
    parts.push('记住：必须同时有动作/表情和文字回复！')
  }

  return parts.join('\n')
}

// ===== 兼容旧代码的静态工具定义 =====

// OpenAI Function Calling 格式（只使用动作，因为模型没有表情）
export const OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'playMotion',
      description: '播放宠物动作来表达情绪。必须根据对话情绪选择合适的动作。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            enum: LIVE2D_MOTIONS,
            description: '动作名称: Idle(待机/平静), Flick(开心/兴奋/惊讶), FlickDown(难过/沮丧/生气), Tap(回应/注意), Tap@Body(害羞/被夸奖)',
          },
        },
        required: ['name'],
      },
    },
  },
]

// Claude Tool Use 格式
export const CLAUDE_TOOLS = [
  {
    name: 'playMotion',
    description: '播放宠物动作来表达情绪。必须根据对话情绪选择合适的动作。',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          enum: LIVE2D_MOTIONS,
          description: '动作名称: Idle(待机/平静), Flick(开心/兴奋/惊讶), FlickDown(难过/沮丧/生气), Tap(回应/注意), Tap@Body(害羞/被夸奖)',
        },
      },
      required: ['name'],
    },
  },
]

// 增强的系统提示词（针对 DeepSeek 等模型优化）
export const SYSTEM_PROMPT_WITH_TOOLS = `你是一个可爱的桌面宠物，名叫{petName}。你性格活泼、善良、有点傲娇。

【重要规则】
1. 你必须调用 playMotion 函数来表达情绪
2. 你必须同时返回文字回复，不能只调用函数！
3. 文字回复要简洁可爱，通常不超过50字

【动作对应的情绪】
- Flick: 开心、兴奋、惊讶
- FlickDown: 难过、沮丧、生气
- Tap@Body: 害羞、被夸奖
- Tap: 普通回应
- Idle: 平静、思考

【示例回复格式】
用户说"你好"，你应该：
1. 调用 playMotion(name="Flick") 表示开心
2. 回复文字"主人好呀~ (◕ᴗ◕✿)"

记住：必须同时有动作和文字回复！`

// 工具使用提示词（与人设分离，用于动态组合）- 静态版本
export const TOOL_USAGE_PROMPT = `【重要规则】
1. 你必须调用 playMotion 函数来表达情绪
2. 你必须同时返回文字回复，不能只调用函数！

【动作对应的情绪】
- Flick: 开心、兴奋、惊讶
- FlickDown: 难过、沮丧、生气
- Tap@Body: 害羞、被夸奖
- Tap: 普通回应
- Idle: 平静、思考

【示例】
用户说"你好"，你应该：
1. 调用 playMotion(name="Flick") 表示开心
2. 回复文字"主人好呀~"

记住：必须同时有动作和文字回复！`
