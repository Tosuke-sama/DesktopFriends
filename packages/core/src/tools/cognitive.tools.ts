/**
 * @Description 认知工具定义
 * 使用 @langchain/core 的 tool() 函数（浏览器兼容）
 */
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

/**
 * 认知工具 - 控制宠物的思考和决策过程
 */
export function createCognitiveTools(context: {
  onThinking: (thought: string) => void
  onDecision: (shouldReply: boolean, reason: string) => void
}) {
  /**
   * 内心独白工具
   * 宠物的内心想法，不会说出口
   */
  const innerThoughtTool = tool(
    async ({ thought }) => {
      context.onThinking(thought)
      return `[内心] ${thought}`
    },
    {
      name: 'innerThought',
      description: `记录内心想法（不会说出口的心理活动）。
使用场景：
- 分析用户意图时
- 思考如何回应时
- 产生情绪反应时
- 自我反思时
这些想法会显示在 UI 的思考气泡中，但不会作为对话发送。`,
      schema: z.object({
        thought: z.string().describe('内心的想法内容')
      })
    }
  )

  /**
   * 回复决策工具
   * 决定是否需要回复用户
   */
  const shouldReplyTool = tool(
    async ({ shouldReply, reason }) => {
      context.onDecision(shouldReply, reason)
      return JSON.stringify({ shouldReply, reason })
    },
    {
      name: 'shouldReply',
      description: `决定是否需要回复用户的消息。
不需要回复的情况：
- 用户要求保持安静
- 内容与自己无关（如用户自言自语）
- 用户在和其他宠物说话
- 纯粹的系统通知

需要回复的情况：
- 用户直接询问或对话
- 用户表达情绪需要回应
- 发生了宠物应该注意的事件`,
      schema: z.object({
        shouldReply: z.boolean().describe('是否需要回复'),
        reason: z.string().describe('做出此决定的原因')
      })
    }
  )

  return [innerThoughtTool, shouldReplyTool]
}