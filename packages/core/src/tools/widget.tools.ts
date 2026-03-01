/**
 * @Description 小组件工具定义
 * 使用 @langchain/core 的 tool() 函数（浏览器兼容）
 */
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { TodoItem, WidgetContext } from '@desktopfriends/shared'

/**
 * 创建小组件相关工具
 */
export function createWidgetTools(context: {
  getTodos: () => TodoItem[]
  addTodo: (text: string) => TodoItem
  completeTodo: (id: string) => boolean
  getWidgetContexts: () => WidgetContext[]
}) {
  const getCurrentTimeTool = tool(
    async () => {
      const now = new Date()
      return JSON.stringify({
        time: now.toLocaleTimeString('zh-CN'),
        date: now.toLocaleDateString('zh-CN'),
        weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()],
        hour: now.getHours(),
        minute: now.getMinutes()
      })
    },
    {
      name: 'getCurrentTime',
      description: '获取当前时间信息，包括日期、星期、时分秒',
      schema: z.object({})
    }
  )

  const getTodosTool = tool(
    async ({ showCompleted }) => {
      const todos = context.getTodos()
      const filtered = showCompleted
        ? todos
        : todos.filter(t => !t.completed)
      return JSON.stringify({
        count: filtered.length,
        items: filtered.map(t => ({
          id: t.id,
          text: t.text,
          completed: t.completed,
          priority: t.priority
        }))
      })
    },
    {
      name: 'getTodos',
      description: '获取待办事项列表',
      schema: z.object({
        showCompleted: z.boolean()
          .optional()
          .default(false)
          .describe('是否包含已完成的待办')
      })
    }
  )

  const addTodoTool = tool(
    async ({ text }) => {
      const todo = context.addTodo(text)
      return JSON.stringify({
        success: true,
        id: todo.id,
        text: todo.text
      })
    },
    {
      name: 'addTodo',
      description: '添加新的待办事项',
      schema: z.object({
        text: z.string().describe('待办事项内容')
      })
    }
  )

  const completeTodoTool = tool(
    async ({ id }) => {
      const success = context.completeTodo(id)
      return JSON.stringify({ success, id })
    },
    {
      name: 'completeTodo',
      description: '将待办事项标记为完成',
      schema: z.object({
        id: z.string().describe('待办事项的 ID')
      })
    }
  )

  const getWidgetContextTool = tool(
    async () => {
      const contexts = context.getWidgetContexts()
      return JSON.stringify(contexts)
    },
    {
      name: 'getWidgetContext',
      description: '获取所有小组件的当前状态（时钟、天气、待办等）',
      schema: z.object({})
    }
  )

  return [
    getCurrentTimeTool,
    getTodosTool,
    addTodoTool,
    completeTodoTool,
    getWidgetContextTool
  ]
}