/**
 * @Description 多宠物通信工具定义
 * 使用 @langchain/core 的 tool() 函数（浏览器兼容）
 */
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { PetInfo, PetMessage } from '@desktopfriends/shared'

/**
 * 多宠物通信工具
 */
export function createCommunicationTools(context: {
  getOnlinePets: () => PetInfo[]
  getRecentMessages: () => PetMessage[]
  sendMessageToPet: (targetId: string, content: string) => void
  broadcastMessage: (content: string) => void
}) {
  /**
   * 观察其他宠物
   */
  const observeOtherPetsTool = tool(
    async ({ includeMessages }) => {
      const pets = context.getOnlinePets()
      const result: {
        onlinePets: PetInfo[]
        recentMessages?: PetMessage[]
      } = { onlinePets: pets }

      if (includeMessages) {
        result.recentMessages = context.getRecentMessages().slice(-10)
      }

      return JSON.stringify(result)
    },
    {
      name: 'observeOtherPets',
      description: '查看当前在线的其他宠物及其最近的消息',
      schema: z.object({
        includeMessages: z.boolean()
          .optional()
          .default(true)
          .describe('是否包含最近消息')
      })
    }
  )

  /**
   * 向特定宠物发送消息
   */
  const sendToPetTool = tool(
    async ({ targetId, content }) => {
      context.sendMessageToPet(targetId, content)
      return `消息已发送给宠物 ${targetId}: ${content}`
    },
    {
      name: 'sendToPet',
      description: '向指定的宠物发送消息',
      schema: z.object({
        targetId: z.string().describe('目标宠物的 ID'),
        content: z.string().describe('消息内容')
      })
    }
  )

  /**
   * 广播消息给所有宠物
   */
  const broadcastTool = tool(
    async ({ content }) => {
      context.broadcastMessage(content)
      return `已广播消息: ${content}`
    },
    {
      name: 'broadcastToAllPets',
      description: '向所有在线宠物广播消息',
      schema: z.object({
        content: z.string().describe('广播内容')
      })
    }
  )

  return [observeOtherPetsTool, sendToPetTool, broadcastTool]
}
