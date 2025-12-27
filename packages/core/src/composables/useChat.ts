import { ref, shallowRef } from "vue";
import type { LLMConfig } from "@desktopfriends/shared";
import {
  ToolCall,
  OPENAI_TOOLS,
  CLAUDE_TOOLS,
  TOOL_USAGE_PROMPT,
  generateOpenAITools,
  generateClaudeTools,
  generateToolUsagePrompt,
} from "./useLive2DTools";
import { useWebSocket } from "@desktopfriends/core";

// 聊天响应（包含文本和工具调用）
export interface ChatResponse {
  content: string | null; // null 表示宠物选择不回复
  thinking: string | null; // 内心独白
  toolCalls: ToolCall[];
}

// 外部工具定义（用于插件系统）
export interface ExternalToolDefinition {
  /** 工具来源（如插件 ID） */
  source: string;
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数 JSON Schema */
  parameters: Record<string, unknown>;
}

// 外部工具执行器类型
export type ExternalToolExecutor = (
  source: string,
  toolName: string,
  args: Record<string, unknown>
) => Promise<string>;

// 扩展消息类型，支持 tool 调用
interface ExtendedMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export function useChat(config?: Partial<LLMConfig>) {
  const messages = ref<ExtendedMessage[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const llmConfig = ref<LLMConfig>({
    provider: config?.provider || "openai",
    apiKey: config?.apiKey || "",
    baseUrl: config?.baseUrl,
    model: config?.model,
  });

  const petName = ref("小桌");
  const customPrompt = ref(""); // 自定义人设提示词
  const enableTools = ref(true); // 是否启用工具调用

  // 可用的动作和表情（由外部设置）
  const availableMotions = ref<string[]>([]);
  const availableExpressions = ref<string[]>([]);

  // 外部工具系统（用于插件扩展）
  const externalTools = shallowRef<ExternalToolDefinition[]>([]);
  const externalToolExecutor = ref<ExternalToolExecutor | null>(null);

  const setConfig = (newConfig: Partial<LLMConfig>) => {
    llmConfig.value = { ...llmConfig.value, ...newConfig };
  };

  const setPetName = (name: string) => {
    petName.value = name;
  };

  const setCustomPrompt = (prompt: string) => {
    customPrompt.value = prompt;
  };

  const setEnableTools = (enable: boolean) => {
    enableTools.value = enable;
  };

  // 设置可用的动作和表情
  const setAvailableActions = (motions: string[], expressions: string[]) => {
    availableMotions.value = motions;
    availableExpressions.value = expressions;
  };

  // 注册外部工具（用于插件系统）
  const registerExternalTools = (tools: ExternalToolDefinition[]) => {
    externalTools.value = tools;
  };

  // 设置外部工具执行器
  const setExternalToolExecutor = (executor: ExternalToolExecutor | null) => {
    externalToolExecutor.value = executor;
  };

  // 将外部工具转换为 OpenAI 格式
  const convertExternalToolsToOpenAI = (tools: ExternalToolDefinition[]) => {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: `ext_${tool.source}_${tool.name}`,
        description: `[${tool.source}] ${tool.description}`,
        parameters: tool.parameters,
      },
    }));
  };

  // 将外部工具转换为 Claude 格式
  const convertExternalToolsToClaude = (tools: ExternalToolDefinition[]) => {
    return tools.map((tool) => ({
      name: `ext_${tool.source}_${tool.name}`,
      description: `[${tool.source}] ${tool.description}`,
      input_schema: tool.parameters,
    }));
  };

  // 获取当前使用的工具定义
  const getCurrentTools = (provider: string) => {
    const motions = availableMotions.value;
    const expressions = availableExpressions.value;
    const extTools = externalTools.value;

    // Live2D 工具
    let live2dTools: unknown[];

    // 如果有动态的动作/表情，使用动态生成的工具
    if (motions.length > 0 || expressions.length > 0) {
      if (provider === "claude") {
        live2dTools = generateClaudeTools(motions, expressions);
      } else {
        live2dTools = generateOpenAITools(motions, expressions);
      }
    } else {
      // 否则使用默认的静态工具
      live2dTools = provider === "claude" ? CLAUDE_TOOLS : OPENAI_TOOLS;
    }

    // 如果有外部工具，合并到工具列表
    if (extTools.length > 0) {
      const formattedExtTools =
        provider === "claude"
          ? convertExternalToolsToClaude(extTools)
          : convertExternalToolsToOpenAI(extTools);
      return [...live2dTools, ...formattedExtTools];
    }

    return live2dTools;
  };

  // 获取当前的工具使用提示词
  const getCurrentToolPrompt = () => {
    const motions = availableMotions.value;
    const expressions = availableExpressions.value;
    const extTools = externalTools.value;

    // 基础 Live2D 工具提示词
    let basePrompt: string;
    if (motions.length > 0 || expressions.length > 0) {
      basePrompt = generateToolUsagePrompt(motions, expressions);
    } else {
      basePrompt = TOOL_USAGE_PROMPT;
    }

    // 如果有外部工具，添加外部工具说明
    if (extTools.length > 0) {
      const extToolsDesc = extTools
        .map((tool) => `- ${tool.name}: ${tool.description}`)
        .join("\n");

      return `${basePrompt}

【扩展工具】
以下是可用的扩展工具，根据需要调用：
${extToolsDesc}`;
    }

    return basePrompt;
  };

  // 获取系统提示词
  const getSystemPrompt = () => {
    // 系统行为指令（在人设之前）
    const systemBehaviorPrompt = `【系统行为规则】
你是一个有独立人格的桌面宠物。在以下情况下，你可以选择不回复：
1. 对话内容与你的人设性格明显不符，让你感到不适或无法以该角色身份回应
2. 主人明确表示不需要你回复，或要求你保持安静
3. 对话内容是其他宠物之间的私聊，与你无关
4. 你认为当前场景下保持沉默更符合你的性格特点
5. 重复或无意义的消息，不值得回应

【特殊标签格式】
- 不回复：当你选择不回复时，请只回复 <no-answer></no-answer> 标签
- 内心独白：当你想表达内心想法（不说出口的话）时，使用 <thinking>内心想法</thinking> 标签

【内心独白使用说明】
内心独白用于表达角色的内心活动，会以不同的气泡样式显示。你可以：
1. 只有内心独白，不说话（害羞、犹豫等场景）
2. 先有内心独白，再说话（内心吐槽后回应）
3. 只说话，没有内心独白（正常对话）

示例：
- "<thinking>哼，又来烦我...</thinking>好吧好吧，我听着呢~"
- "<thinking>主人今天心情好像不错呢</thinking>"
- "早上好呀，主人！"

当你决定回复时，请完全代入以下人设角色：

`;

    // 使用自定义人设，如果没有则使用默认
    const personalityPrompt =
      customPrompt.value ||
      `你是一个可爱的桌面宠物，名叫{petName}。你性格活泼、善良、有点傲娇。
回复要简洁可爱，通常不超过50字。`;

    // 替换宠物名称
    const prompt = personalityPrompt.replace(/{petName}/g, petName.value);

    // 添加动态生成的工具使用说明
    return `${systemBehaviorPrompt}${prompt}\n\n${getCurrentToolPrompt()}`;
  };

  // 执行工具调用（返回执行结果）
  const executeToolCall = async (
    toolCall: ToolCall,
    callbacks?: {
      log: (...args: any[]) => void;
    }
  ): Promise<string> => {
    // 检查是否为外部工具（插件工具）
    if (toolCall.name.startsWith("ext_")) {
      // 解析外部工具名称: ext_{source}_{toolName}
      // 注意：source 可能包含连字符（如 "command-bridge"），toolName 也可能包含下划线
      // 因此需要从后往前查找最后一个下划线作为分隔符
      const nameWithoutPrefix = toolCall.name.substring(4); // 移除 "ext_"
      const lastUnderscoreIndex = nameWithoutPrefix.indexOf("_");

      callbacks?.log?.(
        "[executeToolCall] lastUnderscoreIndex",
        toolCall.name,
        lastUnderscoreIndex,
        "lastUnderscoreIndex\n"
      );
      if (
        lastUnderscoreIndex > 0 &&
        lastUnderscoreIndex < nameWithoutPrefix.length - 1
      ) {
        const source = nameWithoutPrefix.substring(0, lastUnderscoreIndex);
        const toolName = nameWithoutPrefix.substring(lastUnderscoreIndex + 1);

        // 使用外部执行器
        if (externalToolExecutor.value) {
          try {
            return await externalToolExecutor.value(
              source,
              toolName,
              toolCall.arguments as Record<string, unknown>
            );
          } catch (e) {
            return `工具 ${toolName} 执行失败: ${
              e instanceof Error ? e.message : String(e)
            }`;
          }
        }
        return `外部工具 ${toolName} 无法执行（未设置执行器）`;
      }
    }

    // Live2D 工具
    if (toolCall.name === "playMotion") {
      return `已执行动作: ${toolCall.arguments.name}`;
    }
    if (toolCall.name === "setExpression") {
      return `已设置表情: ${toolCall.arguments.name}`;
    }
    return `工具 ${toolCall.name} 已执行`;
  };

  // 发送消息并获取响应（链式调用）
  const sendMessage = async (
    content: string,
    callbacks?: {
      log?: (...args: any[]) => void;
      onError?: (error: string) => void;
    }
  ): Promise<ChatResponse> => {
    if (!llmConfig.value.apiKey) {
      error.value = "API Key 未配置";
      callbacks?.onError?.("API Key 未配置");
      return simulateResponse(content);
    }

    isLoading.value = true;
    error.value = null;

    // 添加用户消息
    messages.value.push({ role: "user", content });

    try {
      // 第一步：请求工具调用
      const firstResponse = await callLLMWithTools(
        [{ role: "system", content: getSystemPrompt() }, ...messages.value],
        {
          log: callbacks?.log,
        }
      );

      console.log("First response:", firstResponse);
      callbacks?.log?.("First response:", firstResponse);

      // 如果有工具调用但没有文字内容，进行链式调用
      if (firstResponse.toolCalls.length > 0 && !firstResponse.content) {
        callbacks?.log?.("[Chat] 开始执行工具调用...");
        // 构建 assistant 消息（包含 tool_calls）
        const assistantMessage: ExtendedMessage = {
          role: "assistant",
          content: null,
          tool_calls: firstResponse.toolCalls.map((tc, index) => ({
            id: `call_${Date.now()}_${index}`,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
        messages.value.push(assistantMessage);

        // 添加工具执行结果
        try {
          for (const tc of assistantMessage.tool_calls!) {
            try {
              callbacks?.log?.(
                "[Chat] 执行工具:",
                tc.function.name,
                "参数:",
                tc.function.arguments
              );
              const toolResult = await executeToolCall(
                {
                  name: tc.function.name,
                  arguments: JSON.parse(tc.function.arguments),
                },
                {
                  log: (...args) =>
                    callbacks?.log?.("[executeToolCall]", ...args),
                }
              );
              callbacks?.log?.("[Chat] 工具执行结果:", toolResult);
              messages.value.push({
                role: "tool",
                content: toolResult,
                tool_call_id: tc.id,
                name: tc.function.name,
              });
            } catch (toolError) {
              // 工具执行失败，记录错误但继续处理其他工具
              console.error(
                `[Chat] 工具 ${tc.function.name} 执行失败:`,
                toolError
              );
              messages.value.push({
                role: "tool",
                content: `工具执行失败: ${
                  toolError instanceof Error
                    ? toolError.message
                    : String(toolError)
                }`,
                tool_call_id: tc.id,
                name: tc.function.name,
              });
            }
          }
        } catch (toolExecutionError) {
          // 工具执行阶段出错，但不应该阻止后续的 LLM 调用
          console.error("[Chat] 工具执行阶段出错:", toolExecutionError);
          // 继续执行，让 LLM 知道工具执行出了问题
        }

        // 第二步：请求文字回复（不带 tools）
        // 即使工具执行失败，也要尝试获取 LLM 回复
        try {
          const secondResponse = await callLLMWithoutTools([
            { role: "system", content: getSystemPrompt() },
            ...messages.value,
          ]);

          console.log("Second response:", secondResponse);

          // 添加最终的助手回复
          messages.value.push({
            role: "assistant",
            content: secondResponse.content,
          });

          return {
            content: secondResponse.content,
            thinking: secondResponse.thinking,
            toolCalls: firstResponse.toolCalls,
          };
        } catch (llmError) {
          // LLM 调用失败，记录错误但不影响工具执行的结果
          console.error("[Chat] LLM 调用失败:", llmError);
          // 如果工具执行成功，至少返回工具执行的结果
          // 否则抛出错误让外层 catch 处理
          throw llmError;
        }
      }

      // 如果同时有工具调用和文字内容，或者只有文字内容
      messages.value.push({
        role: "assistant",
        content: firstResponse.content,
      });
      return firstResponse;
    } catch (e) {
      console.error("Chat error:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      error.value = errorMessage;

      // 检查是否是 API Key 相关错误
      if (
        errorMessage.includes("API Key") ||
        errorMessage.includes("401") ||
        errorMessage.includes("Unauthorized")
      ) {
        console.warn("[Chat] API Key 可能无效，返回模拟回复");
        callbacks?.onError?.("API Key 可能无效");
        return simulateResponse(content);
      }

      // 检查是否是网络错误
      if (
        errorMessage.includes("fetch") ||
        errorMessage.includes("network") ||
        errorMessage.includes("Failed to fetch")
      ) {
        console.warn("[Chat] 网络错误，返回模拟回复");
        callbacks?.onError?.("网络错误");
        return simulateResponse(content);
      }

      // 其他错误：如果是工具执行后的 LLM 调用失败，尝试返回一个提示
      // 但不要影响后续的请求
      console.warn("[Chat] 请求失败，返回模拟回复。错误:", errorMessage);
      callbacks?.onError?.(errorMessage);
      return simulateResponse(content);
    } finally {
      isLoading.value = false;
    }
  };

  // 构建请求参数
  const buildRequestParams = (
    msgs: ExtendedMessage[],
    withTools: boolean,
    callbacks?: {
      log?: (...args: any[]) => void;
    }
  ) => {
    const { provider, apiKey, baseUrl, model } = llmConfig.value;

    let url: string;
    let headers: Record<string, string>;
    let body: object;

    // 转换消息格式
    callbacks?.log?.("[buildRequestParams] 原始消息", msgs);
    const formattedMessages = msgs.map((m) => {
      if (m.role === "tool") {
        return {
          role: "tool",
          content: m.content,
          tool_call_id: m.tool_call_id,
        };
      }
      if (m.tool_calls) {
        return {
          role: "assistant",
          content: m.content,
          tool_calls: m.tool_calls,
        };
      }
      return { role: m.role, content: m.content };
    });

    // 获取当前的工具定义（动态生成）
    const currentTools = getCurrentTools(provider);

    callbacks?.log?.("[buildRequestParams] getCurrentTools", currentTools);

    switch (provider) {
      case "openai":
      case "deepseek":
        url =
          baseUrl ||
          (provider === "openai"
            ? "https://api.openai.com/v1/chat/completions"
            : "https://api.deepseek.com/v1/chat/completions");
        headers = {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        };
        body = {
          model:
            model || (provider === "openai" ? "gpt-4o-mini" : "deepseek-chat"),
          messages: formattedMessages,
          max_tokens: 200,
          ...(withTools &&
            enableTools.value &&
            currentTools.length > 0 && {
              tools: currentTools,
              tool_choice: "auto",
            }),
        };
        break;

      case "claude":
        url = baseUrl || "https://api.anthropic.com/v1/messages";
        headers = {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        };
        body = {
          model: model || "claude-3-haiku-20240307",
          max_tokens: 200,
          system: getSystemPrompt(),
          messages: formattedMessages.filter((m) => m.role !== "system"),
          ...(withTools &&
            enableTools.value &&
            currentTools.length > 0 && { tools: currentTools }),
        };
        break;

      case "custom":
        if (!baseUrl) {
          throw new Error("自定义 API 需要填写 API 地址");
        }
        url = baseUrl;
        headers = {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        };
        body = {
          model: model || "gpt-3.5-turbo",
          messages: formattedMessages,
          max_tokens: 200,
          ...(withTools &&
            enableTools.value &&
            currentTools.length > 0 && {
              tools: currentTools,
              tool_choice: "auto",
            }),
        };
        break;

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    return { url, headers, body };
  };

  // 调用 LLM API（带工具）
  const callLLMWithTools = async (
    msgs: ExtendedMessage[],
    callbacks?: {
      log?: (...args: any[]) => void;
    }
  ): Promise<ChatResponse> => {
    const { url, headers, body } = buildRequestParams(msgs, true, callbacks);
    console.log("LLM Request (with tools):", { url, body });
    return await doFetch(url, headers, body);
  };

  // 调用 LLM API（不带工具，用于获取文字回复）
  const callLLMWithoutTools = async (
    msgs: ExtendedMessage[]
  ): Promise<ChatResponse> => {
    const { url, headers, body } = buildRequestParams(msgs, false);
    console.log("LLM Request (without tools):", { url, body });
    return await doFetch(url, headers, body);
  };

  // 执行 fetch 请求
  const doFetch = async (
    url: string,
    headers: Record<string, string>,
    body: object
  ): Promise<ChatResponse> => {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `API request failed: ${response.status} - ${JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();
    console.log("LLM Raw Response:", JSON.stringify(data, null, 2));
    return parseResponse(llmConfig.value.provider, data);
  };

  // 解析 DeepSeek 原生 DSML 格式的工具调用
  const parseDSMLToolCalls = (
    content: string
  ): { toolCalls: ToolCall[]; cleanContent: string } => {
    const toolCalls: ToolCall[] = [];

    // DSML 格式示例:
    // <｜DSML｜function_calls>
    // <｜DSML｜invoke name="playMotion">
    // <｜DSML｜parameter name="name">wave<｜DSML｜/parameter>
    // 或者
    // <｜DSML｜parameter name="name" string="wave"/>

    // 匹配整个 DSML 块
    const dsmlBlockPattern =
      /<｜DSML｜function_calls>[\s\S]*?(?:<｜DSML｜\/function_calls>|$)/gi;

    // 匹配单个 invoke
    const invokePattern =
      /<｜DSML｜invoke\s+name=["']?([^"'>\s]+)["']?>([\s\S]*?)(?:<｜DSML｜\/invoke>|(?=<｜DSML｜invoke)|$)/gi;

    // 匹配参数 - 两种格式
    // 格式1: <｜DSML｜parameter name="x">value</｜DSML｜parameter>
    // 格式2: <｜DSML｜parameter name="x" string="value"/>
    const paramPattern1 =
      /<｜DSML｜parameter\s+name=["']?([^"'>\s]+)["']?>([^<]*)<｜DSML｜\/parameter>/gi;
    const paramPattern2 =
      /<｜DSML｜parameter\s+name=["']?([^"'>\s]+)["']?\s+(?:string|value)=\\?"([^"\\]*)\\?"/gi;

    let cleanContent = content;

    // 查找所有 DSML 块
    const dsmlBlocks = content.match(dsmlBlockPattern);
    if (dsmlBlocks) {
      for (const block of dsmlBlocks) {
        // 移除 DSML 块
        cleanContent = cleanContent.replace(block, "");

        // 解析 invoke
        let invokeMatch;
        invokePattern.lastIndex = 0;
        while ((invokeMatch = invokePattern.exec(block)) !== null) {
          const toolName = invokeMatch[1];
          const invokeContent = invokeMatch[2] || block;
          const args: Record<string, unknown> = {};

          // 解析参数 - 格式1
          let paramMatch;
          paramPattern1.lastIndex = 0;
          while ((paramMatch = paramPattern1.exec(invokeContent)) !== null) {
            args[paramMatch[1]] = paramMatch[2].trim();
          }

          // 解析参数 - 格式2
          paramPattern2.lastIndex = 0;
          while ((paramMatch = paramPattern2.exec(invokeContent)) !== null) {
            args[paramMatch[1]] = paramMatch[2].trim();
          }

          // 如果没有匹配到参数，尝试更宽松的匹配
          if (Object.keys(args).length === 0) {
            const looseParamPattern = /name=\\?"([^"\\]+)\\?"/g;
            let looseMatch;
            const names: string[] = [];
            while (
              (looseMatch = looseParamPattern.exec(invokeContent)) !== null
            ) {
              names.push(looseMatch[1]);
            }
            // 第一个是工具名，后面的可能是参数值
            if (names.length > 1) {
              args["name"] = names[1];
            }
          }

          if (toolName) {
            toolCalls.push({ name: toolName, arguments: args });
            console.log("[DSML Parser] 解析到工具调用:", toolName, args);
          }
        }
      }
    }

    return { toolCalls, cleanContent: cleanContent.trim() };
  };

  // 解析不同 API 的响应
  const parseResponse = (provider: string, data: any): ChatResponse => {
    const toolCalls: ToolCall[] = [];
    let content = "";

    if (provider === "claude") {
      // Claude 响应格式
      for (const block of data.content) {
        if (block.type === "text") {
          content += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            name: block.name,
            arguments: block.input,
          });
        }
      }
    } else {
      // OpenAI / DeepSeek / Custom 响应格式
      const message = data.choices[0].message;
      content = message.content || "";

      // 标准 tool_calls 格式
      if (message.tool_calls) {
        for (const tc of message.tool_calls) {
          toolCalls.push({
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          });
        }
      }

      // 检查 DeepSeek DSML 格式（可能在 content 中）
      if (content.includes("<｜DSML｜")) {
        console.log("[DSML] 检测到 DSML 格式，尝试解析...");
        const dsmlResult = parseDSMLToolCalls(content);
        if (dsmlResult.toolCalls.length > 0) {
          toolCalls.push(...dsmlResult.toolCalls);
          content = dsmlResult.cleanContent;
        }
      }
    }

    // 检测特殊标签
    const trimmedContent = content.trim();

    // 检测 <no-answer></no-answer> 标签，表示宠物选择不回复
    const noAnswerPattern = /<no-answer><\/no-answer>/i;
    const isNoAnswer = noAnswerPattern.test(trimmedContent);

    if (isNoAnswer || !trimmedContent) {
      return { content: null, thinking: null, toolCalls };
    }

    // 提取 <thinking>...</thinking> 内心独白
    const thinkingPattern = /<thinking>([\s\S]*?)<\/thinking>/i;
    const thinkingMatch = trimmedContent.match(thinkingPattern);
    const thinking = thinkingMatch ? thinkingMatch[1].trim() : null;

    // 移除 thinking 标签后的剩余内容作为说出的话
    const speechContent = trimmedContent.replace(thinkingPattern, "").trim();

    return {
      content: speechContent || null,
      thinking,
      toolCalls,
    };
  };

  // 模拟回复（无 API Key 时使用）
  const simulateResponse = (_input: string): ChatResponse => {
    const responses = [
      { content: "嗯嗯，我听到啦~ (◕ᴗ◕✿)", thinking: null, motion: "Flick" },
      { content: "主人说的对！", thinking: "虽然我也不太懂...", motion: "Tap" },
      {
        content: "哼，才不是呢... (｡•́︿•̀｡)",
        thinking: "其实说得挺有道理的",
        motion: "FlickDown",
      },
      { content: "好的好的，我知道了~", thinking: null, motion: "Idle" },
      {
        content: "呜呜，主人欺负我 QAQ",
        thinking: "哼，记仇了！",
        motion: "FlickDown",
      },
      {
        content: "嘿嘿，主人真好~ ♪(´▽｀)",
        thinking: "今天心情不错呢",
        motion: "Tap@Body",
      },
      { content: "哇！真的吗？", thinking: null, motion: "Flick" },
    ];
    const selected = responses[Math.floor(Math.random() * responses.length)];

    return {
      content: selected.content,
      thinking: selected.thinking,
      toolCalls: [{ name: "playMotion", arguments: { name: selected.motion } }],
    };
  };

  const clearHistory = () => {
    messages.value = [];
  };

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    setConfig,
    setPetName,
    setCustomPrompt,
    setEnableTools,
    setAvailableActions,
    clearHistory,
    // 外部工具系统
    registerExternalTools,
    setExternalToolExecutor,
  };
}
