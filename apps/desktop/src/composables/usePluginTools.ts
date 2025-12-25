/**
 * 插件工具桥接 Composable
 *
 * 将插件系统的工具集成到 LLM 聊天系统
 */

import { ref, watch } from "vue";
import { usePluginSystem } from "../plugins/usePluginSystem";
import type {
  ExternalToolDefinition,
  ExternalToolExecutor,
} from "@desktopfriends/core";

/**
 * 插件工具桥接
 *
 * 自动同步插件工具到 chat 系统
 */
export function usePluginTools() {
  const { enabledPlugins, getPluginTools, executePluginTool, initialize } =
    usePluginSystem();

  // 转换后的外部工具列表
  const externalTools = ref<ExternalToolDefinition[]>([]);

  // 是否已初始化
  const isInitialized = ref(false);

  /**
   * 刷新插件工具列表
   */
  const refreshTools = async () => {
    try {
      const tools = await getPluginTools();

      // 转换为 ExternalToolDefinition 格式
      externalTools.value = tools.map((tool) => ({
        source: tool.pluginId,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));

      console.log(
        `[PluginTools] 已加载 ${externalTools.value.length} 个插件工具`
      );
    } catch (e) {
      console.error("[PluginTools] 刷新工具列表失败:", e);
      externalTools.value = [];
    }
  };

  /**
   * 外部工具执行器
   *
   * 将工具调用路由到对应的插件
   */
  const toolExecutor: ExternalToolExecutor = async (
    source: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> => {
    console.log(`[PluginTools] 执行工具: ${source}.${toolName}`, args);

    try {
      const result = await executePluginTool(source, toolName, args);

      if (result.success) {
        // 将结果数据转换为字符串返回给 LLM
        let resultString: string;

        if (typeof result.data === "string") {
          resultString = result.data;
        } else if (result.data && typeof result.data === "object") {
          // 如果是对象，检查是否有 action 字段（窗口打开等操作）
          const data = result.data as Record<string, unknown>;

          // 对于窗口打开操作，返回简要信息，并包含 requestId（如果有）
          if (data.action === "open_window") {
            const windowData = data.windowData as Record<string, unknown> | undefined;
            const request = windowData?.request as Record<string, unknown> | undefined;
            const requestId = request?.id as string | undefined;
            
            resultString = JSON.stringify({
              action: "open_window",
              window: data.window,
              title: data.title,
              message: data.message || "等待用户操作",
              requestId: requestId, // 包含 requestId，用于后续获取结果
            });
          } 
          // 如果是工具执行结果（包含 toolResult），直接返回给 AI
          else if (data.toolResult && typeof data.toolResult === "string") {
            // 这是审批完成后的执行结果，直接返回给 AI
            resultString = data.toolResult;
          } else {
            // 其他情况，完整返回但限制大小
            const jsonStr = JSON.stringify(result.data);
            // 如果结果太大（超过 2000 字符），截断并添加提示
            if (jsonStr.length > 2000) {
              resultString =
                jsonStr.substring(0, 2000) +
                "... (结果已截断，详情请查看插件窗口)";
            } else {
              resultString = jsonStr;
            }
          }
        } else {
          resultString = JSON.stringify(result.data);
        }

        console.log(
          `[PluginTools] 工具执行成功，返回结果长度: ${resultString.length}`
        );
        return resultString;
      } else {
        // 工具执行失败，返回错误信息但不抛出异常
        // 让 LLM 知道工具执行失败，而不是让整个请求失败
        const errorMsg = result.error || "工具执行失败";
        console.warn(`[PluginTools] 工具执行失败: ${errorMsg}`);
        return `工具执行失败: ${errorMsg}`;
      }
    } catch (e) {
      // 捕获执行过程中的异常，返回错误信息而不是抛出
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(`[PluginTools] 工具执行异常: ${errorMsg}`);
      return `工具执行异常: ${errorMsg}`;
    }
  };

  /**
   * 初始化插件工具系统
   */
  const init = async () => {
    if (isInitialized.value) return;

    await initialize();
    await refreshTools();
    isInitialized.value = true;
  };

  // 监听启用插件列表变化，自动刷新工具
  watch(
    enabledPlugins,
    () => {
      if (isInitialized.value) {
        refreshTools();
      }
    },
    { deep: true }
  );

  return {
    // 状态
    externalTools,
    isInitialized,

    // 方法
    init,
    refreshTools,
    toolExecutor,
  };
}
