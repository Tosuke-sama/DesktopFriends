/**
 * Live2D 模型分析器
 * 解析模型配置文件，提取动作和表情信息并生成语义描述
 *
 * 支持两种分析模式：
 * 1. 规则模式（默认）：使用预定义的情绪映射表
 * 2. LLM 模式：使用大模型智能分析动作含义
 */

// ============ 类型定义 ============

/** Live2D 模型配置文件结构 */
export interface Live2DModelConfig {
  Version?: number
  FileReferences?: {
    Motions?: Record<string, MotionEntry[]>
    Expressions?: ExpressionEntry[]
  }
  // Cubism 2.x 格式
  motions?: Record<string, MotionEntry[]>
  expressions?: ExpressionEntry[]
}

/** 动作条目 */
export interface MotionEntry {
  File: string
  Name?: string        // 部分模型有显式名称
  FadeInTime?: number
  FadeOutTime?: number
}

/** 表情条目 */
export interface ExpressionEntry {
  Name: string
  File: string
}

/** 解析后的动作信息 */
export interface ParsedMotion {
  id: string           // LLM 可读标识符 (group:name 或 group:index)
  group: string        // 动作组名
  name: string         // 动作名称（显式或从文件名推断）
  file: string         // 文件路径
  emotion: string      // 推断的情绪类别
  description: string  // 生成的描述
}

/** 解析后的表情信息 */
export interface ParsedExpression {
  name: string
  file: string
  emotion: string
  description: string
}

/** 模型分析结果 */
export interface ModelAnalysisResult {
  motions: ParsedMotion[]
  expressions: ParsedExpression[]
  motionGroups: string[]
  toolDescription: string  // 生成给 LLM 的工具描述
}

/** LLM 分析器配置 */
export interface LLMAnalyzerConfig {
  /** LLM 调用函数 */
  invoke: (prompt: string) => Promise<string>
  /** 是否启用缓存 */
  enableCache?: boolean
  /** 缓存键前缀 */
  cacheKeyPrefix?: string
}

/** LLM 分析单个动作的结果 */
interface LLMMotionAnalysis {
  emotion: string
  description: string
  usageScenario: string  // 使用场景
}

// ============ 情绪映射表（规则模式） ============

/**
 * 常见动作名 → 情绪映射
 * 支持中英文和常见变体
 */
const MOTION_EMOTION_MAP: Record<string, { emotion: string; description: string }> = {
  // 英文动作
  'idle': { emotion: '平静', description: '待机/放松状态，表示平静或等待' },
  'flick': { emotion: '开心', description: '轻弹动作，表示开心、兴奋或惊讶' },
  'flickdown': { emotion: '难过', description: '向下动作，表示难过、沮丧或失落' },
  'tap': { emotion: '注意', description: '点击反应，表示回应或注意到什么' },
  'shake': { emotion: '拒绝', description: '摇头动作，表示拒绝或不同意' },
  'nod': { emotion: '同意', description: '点头动作，表示同意或理解' },
  'wave': { emotion: '友好', description: '挥手动作，表示打招呼或告别' },
  'dance': { emotion: '开心', description: '跳舞动作，表示非常开心' },
  'sleep': { emotion: '疲惫', description: '睡觉动作，表示困倦或疲惫' },
  'angry': { emotion: '生气', description: '生气动作，表示愤怒或不满' },
  'sad': { emotion: '难过', description: '难过动作，表示悲伤或失望' },
  'happy': { emotion: '开心', description: '开心动作，表示快乐或满足' },
  'surprise': { emotion: '惊讶', description: '惊讶动作，表示意外或震惊' },
  'think': { emotion: '思考', description: '思考动作，表示在想事情' },
  'shy': { emotion: '害羞', description: '害羞动作，表示腼腆或不好意思' },

  // 中文动作
  '笑': { emotion: '开心', description: '笑容动作，表示开心或愉悦' },
  '哭': { emotion: '难过', description: '哭泣动作，表示悲伤' },
  '震惊': { emotion: '惊讶', description: '震惊表情，表示非常意外' },
  '生气': { emotion: '生气', description: '生气动作，表示愤怒' },
  '害羞': { emotion: '害羞', description: '害羞动作，表示腼腆' },
  '红晕': { emotion: '害羞', description: '脸红效果，表示害羞或激动' },
  '脸红': { emotion: '害羞', description: '脸红效果，表示害羞' },
  '眼泪': { emotion: '难过', description: '眼泪效果，表示悲伤或感动' },
  '汗': { emotion: '尴尬', description: '冒汗效果，表示紧张或尴尬' },
  '问号': { emotion: '疑惑', description: '问号效果，表示疑惑或不解' },
  '脸黑': { emotion: '无语', description: '黑脸效果，表示无语或震惊' },
  '挥手': { emotion: '友好', description: '挥手动作，表示打招呼' },
  '挥双手': { emotion: '热情', description: '双手挥动，表示热情打招呼' },
  '挥左手': { emotion: '友好', description: '左手挥动，表示招呼' },
  '挥右手': { emotion: '友好', description: '右手挥动，表示招呼' },
  '点头': { emotion: '同意', description: '点头动作，表示同意' },
  '摇头': { emotion: '拒绝', description: '摇头动作，表示拒绝' },
  '待机': { emotion: '平静', description: '待机状态，正常状态' },
}

// ============ LLM 分析器 ============

/**
 * 使用 LLM 分析动作列表
 * 一次性分析所有动作，减少 API 调用次数
 */
export async function analyzeMotionsWithLLM(
  motions: Array<{ group: string; name: string; file: string }>,
  config: LLMAnalyzerConfig
): Promise<Map<string, LLMMotionAnalysis>> {
  const cacheKey = config.cacheKeyPrefix
    ? `${config.cacheKeyPrefix}_motions_${hashMotions(motions)}`
    : null

  // 尝试从缓存读取
  if (config.enableCache && cacheKey) {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        return new Map(Object.entries(parsed))
      } catch {
        // 缓存无效，继续分析
      }
    }
  }

  // 构建分析提示词
  const prompt = buildAnalysisPrompt(motions)

  try {
    const response = await config.invoke(prompt)
    const analysisMap = parseAnalysisResponse(response, motions)

    // 保存到缓存
    if (config.enableCache && cacheKey) {
      const cacheData = Object.fromEntries(analysisMap)
      localStorage.setItem(cacheKey, JSON.stringify(cacheData))
    }

    return analysisMap
  } catch (error) {
    console.error('LLM 分析失败，回退到规则模式:', error)
    // 回退到规则模式
    return fallbackToRules(motions)
  }
}

/**
 * 构建 LLM 分析提示词
 */
function buildAnalysisPrompt(
  motions: Array<{ group: string; name: string; file: string }>
): string {
  const motionList = motions
    .map((m, i) => `${i + 1}. 组: "${m.group}", 名称: "${m.name}"`)
    .join('\n')

  return `你是一个 Live2D 动作分析专家。请分析以下动作列表，为每个动作推断其表达的情绪和使用场景。

## 动作列表
${motionList}

## 输出格式
请为每个动作输出 JSON 格式的分析结果，格式如下：
\`\`\`json
[
  {
    "index": 1,
    "emotion": "开心",
    "description": "轻弹动作，表示开心、兴奋或惊讶",
    "usageScenario": "当用户说了开心的话、夸奖宠物、或发生令人惊喜的事情时使用"
  },
  ...
]
\`\`\`

## 分析规则
1. **emotion** 应该是简短的情绪标签（如：开心、难过、生气、惊讶、害羞、平静、思考、疑惑、尴尬等）
2. **description** 应该是一句话描述动作的视觉效果和情绪含义
3. **usageScenario** 应该描述在什么对话场景下使用这个动作
4. 注意识别 ON/OFF 后缀的动作，它们用于切换状态（如表情开关）
5. 如果动作名是文件名格式（如 m01, motion_01），根据同组其他动作推断含义
6. 考虑动作组名的提示作用（如 "表情" 组的动作通常是表情变化）

请直接输出 JSON，不要添加其他说明。`
}

/**
 * 解析 LLM 分析响应
 */
function parseAnalysisResponse(
  response: string,
  motions: Array<{ group: string; name: string }>
): Map<string, LLMMotionAnalysis> {
  const result = new Map<string, LLMMotionAnalysis>()

  try {
    // 提取 JSON 部分
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error('未找到 JSON 数组')
    }

    const analyses = JSON.parse(jsonMatch[0]) as Array<{
      index: number
      emotion: string
      description: string
      usageScenario: string
    }>

    for (const analysis of analyses) {
      const motion = motions[analysis.index - 1]
      if (motion) {
        const key = `${motion.group}:${motion.name}`
        result.set(key, {
          emotion: analysis.emotion,
          description: analysis.description,
          usageScenario: analysis.usageScenario
        })
      }
    }
  } catch (error) {
    console.error('解析 LLM 响应失败:', error)
  }

  return result
}

/**
 * 回退到规则模式
 */
function fallbackToRules(
  motions: Array<{ group: string; name: string }>
): Map<string, LLMMotionAnalysis> {
  const result = new Map<string, LLMMotionAnalysis>()

  for (const motion of motions) {
    const { emotion, description } = inferMotionEmotion(motion.name, motion.group)
    const key = `${motion.group}:${motion.name}`
    result.set(key, {
      emotion,
      description,
      usageScenario: `当需要表达${emotion}情绪时使用`
    })
  }

  return result
}

/**
 * 生成动作列表的哈希（用于缓存键）
 */
function hashMotions(motions: Array<{ group: string; name: string }>): string {
  const str = motions.map(m => `${m.group}:${m.name}`).join('|')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

// ============ 核心函数 ============

/**
 * 从文件名推断动作名称
 */
function inferNameFromFile(file: string): string {
  // 移除路径和扩展名
  const basename = file.split('/').pop() || file
  const nameWithoutExt = basename.replace(/\.(motion3|exp3)?\.json$/i, '')

  // 移除常见前缀（如 hiyori_m01 → m01）
  const cleaned = nameWithoutExt.replace(/^[a-z]+_/i, '')

  return cleaned || nameWithoutExt
}

/**
 * 推断动作的情绪和描述（规则模式）
 */
function inferMotionEmotion(name: string, group: string): { emotion: string; description: string } {
  // 标准化名称（小写，移除特殊字符）
  const normalizedName = name.toLowerCase().replace(/[@_\-\d]/g, '')
  const normalizedGroup = group.toLowerCase().replace(/[@_\-\d]/g, '')

  // 1. 尝试精确匹配动作名
  if (MOTION_EMOTION_MAP[normalizedName]) {
    return MOTION_EMOTION_MAP[normalizedName]
  }

  // 2. 尝试匹配原始名称（中文）
  const originalNormalized = name.replace(/ON|OFF$/i, '').trim()
  if (MOTION_EMOTION_MAP[originalNormalized]) {
    return MOTION_EMOTION_MAP[originalNormalized]
  }

  // 3. 尝试匹配动作组名
  if (MOTION_EMOTION_MAP[normalizedGroup]) {
    return MOTION_EMOTION_MAP[normalizedGroup]
  }

  // 4. 检查是否包含关键词
  for (const [keyword, info] of Object.entries(MOTION_EMOTION_MAP)) {
    if (normalizedName.includes(keyword) || name.includes(keyword)) {
      return info
    }
  }

  // 5. 默认返回通用描述
  return {
    emotion: '表达',
    description: `${name} 动作，可用于表达情绪`
  }
}

/**
 * 推断表情的情绪和描述
 */
function inferExpressionEmotion(name: string): { emotion: string; description: string } {
  const normalizedName = name.toLowerCase().replace(/[@_\-\d]/g, '')

  if (MOTION_EMOTION_MAP[normalizedName]) {
    return MOTION_EMOTION_MAP[normalizedName]
  }

  // 检查原始名称（中文）
  const originalNormalized = name.replace(/ON|OFF$/i, '').trim()
  if (MOTION_EMOTION_MAP[originalNormalized]) {
    return MOTION_EMOTION_MAP[originalNormalized]
  }

  return {
    emotion: '表情',
    description: `${name} 表情`
  }
}

/**
 * 解析 Live2D 模型配置文件（规则模式）
 */
export function parseModelConfig(config: Live2DModelConfig): ModelAnalysisResult {
  const motions: ParsedMotion[] = []
  const expressions: ParsedExpression[] = []
  const motionGroups: string[] = []

  // 获取动作配置（兼容 Cubism 2.x 和 3.x）
  const motionConfig = config.FileReferences?.Motions || config.motions || {}

  // 解析动作
  for (const [group, entries] of Object.entries(motionConfig)) {
    motionGroups.push(group)

    entries.forEach((entry, index) => {
      // 确定动作名称
      const name = entry.Name || inferNameFromFile(entry.File)
      const { emotion, description } = inferMotionEmotion(name, group)

      // 生成 ID：有显式 Name 用 group:Name，否则用 group:index
      const id = entry.Name ? `${group}:${name}` : `${group}:${index}`

      motions.push({
        id,
        group,
        name,
        file: entry.File,
        emotion,
        description
      })
    })
  }

  // 获取表情配置
  const expressionConfig = config.FileReferences?.Expressions || config.expressions || []

  // 解析表情
  for (const entry of expressionConfig) {
    const { emotion, description } = inferExpressionEmotion(entry.Name)
    expressions.push({
      name: entry.Name,
      file: entry.File,
      emotion,
      description
    })
  }

  // 生成工具描述
  const toolDescription = generateToolDescription(motions, expressions, motionGroups)

  return {
    motions,
    expressions,
    motionGroups,
    toolDescription
  }
}

/**
 * 解析 Live2D 模型配置文件（LLM 增强模式）
 *
 * @example
 * ```ts
 * const analysis = await parseModelConfigWithLLM(modelConfig, {
 *   invoke: async (prompt) => {
 *     // 调用你的 LLM API
 *     const response = await openai.chat.completions.create({
 *       model: 'gpt-4o-mini',
 *       messages: [{ role: 'user', content: prompt }]
 *     })
 *     return response.choices[0].message.content
 *   },
 *   enableCache: true,
 *   cacheKeyPrefix: 'model_tanben'
 * })
 * ```
 */
export async function parseModelConfigWithLLM(
  config: Live2DModelConfig,
  llmConfig: LLMAnalyzerConfig
): Promise<ModelAnalysisResult> {
  const motions: ParsedMotion[] = []
  const expressions: ParsedExpression[] = []
  const motionGroups: string[] = []

  // 获取动作配置
  const motionConfig = config.FileReferences?.Motions || config.motions || {}

  // 收集所有动作用于批量分析
  const motionList: Array<{ group: string; name: string; file: string; index: number; hasExplicitName: boolean }> = []

  for (const [group, entries] of Object.entries(motionConfig)) {
    motionGroups.push(group)

    entries.forEach((entry, index) => {
      const name = entry.Name || inferNameFromFile(entry.File)
      motionList.push({ group, name, file: entry.File, index, hasExplicitName: !!entry.Name })
    })
  }

  // 使用 LLM 分析所有动作
  const llmAnalysis = await analyzeMotionsWithLLM(motionList, llmConfig)

  // 构建解析结果
  for (const item of motionList) {
    const key = `${item.group}:${item.name}`
    const analysis = llmAnalysis.get(key)

    const id = item.hasExplicitName ? `${item.group}:${item.name}` : `${item.group}:${item.index}`

    motions.push({
      id,
      group: item.group,
      name: item.name,
      file: item.file,
      emotion: analysis?.emotion || '表达',
      description: analysis?.description || `${item.name} 动作`
    })
  }

  // 表情分析（使用规则模式，因为通常表情较少且命名清晰）
  const expressionConfig = config.FileReferences?.Expressions || config.expressions || []

  for (const entry of expressionConfig) {
    const { emotion, description } = inferExpressionEmotion(entry.Name)
    expressions.push({
      name: entry.Name,
      file: entry.File,
      emotion,
      description
    })
  }

  // 生成增强的工具描述（包含使用场景）
  const toolDescription = generateEnhancedToolDescription(motions, expressions, llmAnalysis)

  return {
    motions,
    expressions,
    motionGroups,
    toolDescription
  }
}

/**
 * 生成给 LLM 的工具描述
 */
function generateToolDescription(
  motions: ParsedMotion[],
  expressions: ParsedExpression[],
  groups: string[]
): string {
  const lines: string[] = []

  lines.push('## 可用动作和表情')
  lines.push('')

  // 按情绪分组动作
  const emotionGroups = new Map<string, ParsedMotion[]>()
  for (const motion of motions) {
    const existing = emotionGroups.get(motion.emotion) || []
    existing.push(motion)
    emotionGroups.set(motion.emotion, existing)
  }

  lines.push('### 动作列表（按情绪分类）')
  lines.push('')

  for (const [emotion, items] of emotionGroups) {
    lines.push(`**${emotion}**:`)
    for (const item of items) {
      lines.push(`- \`${item.id}\`: ${item.description}`)
    }
    lines.push('')
  }

  if (expressions.length > 0) {
    lines.push('### 表情列表')
    lines.push('')
    for (const expr of expressions) {
      lines.push(`- \`${expr.name}\`: ${expr.description}`)
    }
  }

  lines.push('')
  lines.push('### 使用建议')
  lines.push('- 根据对话情绪选择合适的动作')
  lines.push('- 可以组合动作和表情一起使用')
  lines.push('- ON/OFF 后缀的动作用于切换状态')

  return lines.join('\n')
}

/**
 * 生成增强的工具描述（包含 LLM 分析的使用场景）
 */
function generateEnhancedToolDescription(
  motions: ParsedMotion[],
  expressions: ParsedExpression[],
  llmAnalysis: Map<string, LLMMotionAnalysis>
): string {
  const lines: string[] = []

  lines.push('## 可用动作和表情')
  lines.push('')

  // 按情绪分组动作
  const emotionGroups = new Map<string, ParsedMotion[]>()
  for (const motion of motions) {
    const existing = emotionGroups.get(motion.emotion) || []
    existing.push(motion)
    emotionGroups.set(motion.emotion, existing)
  }

  lines.push('### 动作列表（按情绪分类）')
  lines.push('')

  for (const [emotion, items] of emotionGroups) {
    lines.push(`**${emotion}**:`)
    for (const item of items) {
      const key = `${item.group}:${item.name}`
      const analysis = llmAnalysis.get(key)
      const scenario = analysis?.usageScenario ? ` (${analysis.usageScenario})` : ''
      lines.push(`- \`${item.id}\`: ${item.description}${scenario}`)
    }
    lines.push('')
  }

  if (expressions.length > 0) {
    lines.push('### 表情列表')
    lines.push('')
    for (const expr of expressions) {
      lines.push(`- \`${expr.name}\`: ${expr.description}`)
    }
  }

  lines.push('')
  lines.push('### 使用建议')
  lines.push('- 根据对话情绪和场景选择最合适的动作')
  lines.push('- 可以组合动作和表情一起使用增强表达')
  lines.push('- ON/OFF 后缀的动作用于切换状态（如红晕ON开启脸红效果）')

  return lines.join('\n')
}

/**
 * 从动作列表中提取简化的动作名（用于 LLM 工具参数）
 */
export function getMotionNames(motions: ParsedMotion[]): string[] {
  return motions.map(m => m.id)
}

/**
 * 从表情列表中提取表情名
 */
export function getExpressionNames(expressions: ParsedExpression[]): string[] {
  return expressions.map(e => e.name)
}

/**
 * 创建情绪到动作的快速映射
 * 便于 Agent 根据情绪选择动作
 */
export function createEmotionToMotionMap(
  motions: ParsedMotion[]
): Record<string, string[]> {
  const map: Record<string, string[]> = {}

  for (const motion of motions) {
    if (!map[motion.emotion]) {
      map[motion.emotion] = []
    }
    map[motion.emotion].push(motion.id)
  }


  return map
}