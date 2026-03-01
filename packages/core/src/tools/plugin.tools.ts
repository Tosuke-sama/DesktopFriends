/**
 * @Description 插件工具适配层
 * 将外部插件 manifest 中的工具定义转换为 LangChain StructuredToolInterface
 */
import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'

export interface PluginToolDefinition {
  name: string
  description: string
  parameters?: Record<string, { type: string; description?: string; required?: boolean }>
}

export interface PluginManifest {
  id: string
  name: string
  tools: PluginToolDefinition[]
}

export type PluginToolExecutor = (
  pluginId: string,
  toolName: string,
  args: Record<string, unknown>
) => Promise<{ success: boolean; data: unknown; error?: string }>

/**
 * 将插件 manifest 中的工具定义转换为 LangChain 工具
 */
export function createPluginTools(
  manifest: PluginManifest,
  executor: PluginToolExecutor
): StructuredToolInterface[] {
  return manifest.tools.map((toolDef) => {
    const schemaShape: Record<string, z.ZodTypeAny> = {}

    if (toolDef.parameters) {
      for (const [key, param] of Object.entries(toolDef.parameters)) {
        let field: z.ZodTypeAny

        switch (param.type) {
          case 'number':
            field = z.number()
            break
          case 'boolean':
            field = z.boolean()
            break
          case 'string':
          default:
            field = z.string()
            break
        }

        if (param.description) {
          field = field.describe(param.description)
        }

        if (!param.required) {
          field = field.optional()
        }

        schemaShape[key] = field
      }
    }

    const toolName = `${manifest.id}__${toolDef.name}`

    return tool(
      async (args) => {
        try {
          const result = await executor(manifest.id, toolDef.name, args)
          return JSON.stringify(result)
        } catch (error) {
          return JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
      {
        name: toolName,
        description: `[${manifest.name}] ${toolDef.description}`,
        schema: z.object(schemaShape),
      }
    )
  })
}
