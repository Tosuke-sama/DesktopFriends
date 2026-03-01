<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import {
  ChatInput,
  ChatBubble,
  ChatHistory,
  VoiceButton,
} from "@desktopfriends/ui";
import {
  useLangChainAgent,
  useSettings,
  useP2P,
  useChatHistory,
  useXiaoZhi,
  useWidgetEvents,
  useWidgets,
  type PetMessage,
  type PetInfo,
} from "@desktopfriends/core";
import Live2DCanvas from "../components/Live2DCanvas.vue";
import { useKeyboard } from "../composables/useKeyboard";
import { widgetInfo } from "@desktopfriends/shared";
import WidgetContainer from "../components/widgets/WidgetContainer.vue";
import type { WidgetType, WidgetEvent } from "@desktopfriends/shared";

// 组件名称，用于 KeepAlive
defineOptions({
  name: "HomeView",
});

const emit = defineEmits<{
  openSettings: [];
}>();

const { settings, currentPet, live2dTransform, backgroundStyle } =
  useSettings();

// 聊天历史记录
const { chatHistory, addUserMessage, addPetMessage, addOtherPetMessage, addThinkingMessage } =
  useChatHistory();

// 键盘处理
const { keyboardHeight } = useKeyboard();

// XiaoZhi 集成
const xiaozhi = useXiaoZhi();

// 是否使用 XiaoZhi 后端
const useXiaozhiBackend = computed(() => settings.value.xiaozhiEnabled);

// XiaoZhi 事件处理器注销函数
const xiaozhiUnsubscribers: Array<() => void> = [];

// 小组件系统
const { editMode, addWidget, todos, addTodo, toggleTodo, getWidgetContexts } = useWidgets();
const showAddWidgetDialog = ref(false);

// 小组件事件
const { subscribe: subscribeWidgetEvent } = useWidgetEvents();

// 处理小组件事件（整点报时等）
const handleWidgetEvent = async (event: WidgetEvent) => {
  console.log("Widget event:", event);

  // 只有在配置了 LLM 时才响应
  if (!isLLMConfigured.value) return;

  // 构建事件消息
  let eventMessage = "";
  if (event.type === "hourlyChime") {
    eventMessage = `[系统提示: ${event.data.message}] 请简短地提醒主人现在的时间`;
  } else if (event.type === "halfHourlyChime") {
    eventMessage = `[系统提示: ${event.data.message}]`;
  } else if (event.type === "photoChanged") {
    eventMessage = `[系统提示: 照片切换了] 可以对当前照片发表一下评论`;
  }

  if (!eventMessage) return;

  try {
    // 初始化 agent（仅首次）
    if (!agent.isInitialized.value) {
      const llmConfig = {
        provider: settings.value.llmProvider,
        apiKey: settings.value.llmApiKey,
        baseUrl: settings.value.llmBaseUrl,
        model: settings.value.llmModel,
      };
      await agent.analyzeAndSetActions(
        motionDetails.value,
        availableExpressions.value,
        llmConfig,
      );
      await agent.initAgent(llmConfig);
    }

    // 发送事件消息 - agent 自动处理工具调用
    const response = await agent.sendMessage(eventMessage);

    // 显示回复
    if (response.content) {
      isShowingThinking.value = false;
      currentSpeaker.value = null;
      currentMessage.value = response.content;
    }
  } catch (error) {
    console.error("Widget event error:", error);
  }
};

// 订阅小组件事件
onMounted(() => {
  subscribeWidgetEvent("hourlyChime", handleWidgetEvent);
  subscribeWidgetEvent("halfHourlyChime", handleWidgetEvent);
  subscribeWidgetEvent("photoChanged", handleWidgetEvent);
});

// 切换小组件编辑模式
const toggleWidgetEditMode = () => {
  editMode.value = !editMode.value;
};

// 打开添加小组件对话框
const openAddWidgetDialog = () => {
  showAddWidgetDialog.value = true;
};

// 关闭添加小组件对话框
const closeAddWidgetDialog = () => {
  showAddWidgetDialog.value = false;
};

// 添加小组件
const handleAddWidget = (type: WidgetType) => {
  const info = widgetInfo[type];

  // 检查是否禁用
  if (info.disabled) {
    // 显示提示
    currentMessage.value = info.disabledReason || '该小组件暂不可用';
    currentSpeaker.value = null;

    // 震动反馈
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }

    // 3秒后清除提示
    setTimeout(() => {
      currentMessage.value = '';
    }, 3000);

    return;
  }

  // 原有逻辑
  const widget = addWidget(type);
  if (widget) {
    console.log("Added widget:", widget);
    // 添加成功后关闭对话框
    closeAddWidgetDialog();
  } else {
    console.warn("Failed to add widget, no space available");
    currentMessage.value = '没有足够空间添加小组件';
    currentSpeaker.value = null;
    setTimeout(() => {
      currentMessage.value = '';
    }, 2000);
  }
};

// P2P 连接
const {
  isConnected,
  isRegistered,
  onlinePets,
  otherPets,
  autoChat,
  connect,
  register,
  sendMessage: sendP2PMessage,
  sendAction,
} = useP2P({
  onPetMessage: handlePetMessage,
  onPetOnline: handlePetOnline,
});

// 测试面板显示状态
const showTestPanel = ref(false);
// 在线宠物面板
const showPetsPanel = ref(false);
// 调整面板显示状态
const showAdjustPanel = ref(false);
// 是否正在自动回复
const isAutoReplying = ref(false);
// 自动对话冷却时间
const autoChatCooldown = ref(false);

const currentMessage = ref("");
const currentThinking = ref<string | null>(null); // 当前内心独白
const isShowingThinking = ref(false); // 是否正在显示内心独白
const currentSpeaker = ref<string | null>(null); // 当前说话者（null 表示自己）
const live2dRef = ref<InstanceType<typeof Live2DCanvas> | null>(null);

// XiaoZhi 气泡清除定时器
let bubbleClearTimer: ReturnType<typeof setTimeout> | null = null;

// 是否已配置大模型
const isLLMConfigured = computed(() => !!settings.value.llmApiKey);

// XiaoZhi 状态（直接使用 composable 的状态）
const isXiaozhiConnected = computed(() => xiaozhi.isConnected.value);

// 从 Live2D 组件获取可用的动作和表情
const availableExpressions = computed(
  () => live2dRef.value?.availableExpressions ?? []
);
const motionDetails = computed(() => live2dRef.value?.motionDetails ?? []);

// 按组分类的动作详情
const motionsByGroup = computed(() => {
  const groups: Record<string, Array<{ name: string; index: number }>> = {};
  for (const motion of motionDetails.value) {
    if (!groups[motion.group]) {
      groups[motion.group] = [];
    }
    groups[motion.group].push({ name: motion.name, index: motion.index });
  }
  return groups;
});

// LangChain Agent - 替代 useChat
const agent = useLangChainAgent({
  petName: currentPet.value.name,
  customPrompt: currentPet.value.prompt,
  onPlayMotion: (motionId: string) => {
    // 先尝试按 name 查找
    let motionInfo = motionDetails.value.find((m) => m.name === motionId);
    if (!motionInfo && motionId.includes(":")) {
      // 再尝试 group:name 格式
      const [group, name] = motionId.split(":");
      motionInfo = motionDetails.value.find(
        (m) => m.group === group && m.name === name,
      );
    }
    if (motionInfo) {
      live2dRef.value?.playMotionByIndex(motionInfo.group, motionInfo.index);
    } else {
      live2dRef.value?.playMotion(motionId);
    }
    // 同步动作给其他宠物
    if (isConnected.value && isRegistered.value) {
      sendAction("motion", motionId);
    }
  },
  onSetExpression: (name: string) => {
    live2dRef.value?.setExpression(name);
    // 同步表情给其他宠物
    if (isConnected.value && isRegistered.value) {
      sendAction("expression", name);
    }
  },
  onResetExpression: () => {
    const defaultExpression = availableExpressions.value[0];
    if (defaultExpression) {
      live2dRef.value?.setExpression(defaultExpression);
    }
  },
  onThinking: (thought: string) => {
    console.log("[Agent Thinking]", thought);
    addThinkingMessage(currentPet.value.name, thought);
    isShowingThinking.value = true;
    currentMessage.value = thought;
  },
  widgetContext: {
    getTodos: () => todos.value,
    addTodo: (text: string) => addTodo(text),
    completeTodo: (id: string) => {
      toggleTodo(id);
      return true;
    },
    getWidgetContexts: () => getWidgetContexts(),
  },
});

// 监听 Live2D 模型动作/表情变化，自动更新 agent 工具
watch(
  [motionDetails, availableExpressions],
  ([newMotions, newExpressions]) => {
    if (
      agent.isInitialized.value &&
      (newMotions.length > 0 || newExpressions.length > 0)
    ) {
      agent.analyzeAndSetActions(newMotions, newExpressions, {
        provider: settings.value.llmProvider,
        apiKey: settings.value.llmApiKey,
        baseUrl: settings.value.llmBaseUrl,
        model: settings.value.llmModel,
      });
    }
  }
);

// 处理用户发送的消息
const handleSendMessage = async (message: string) => {
  if (!message.trim()) return;

  // XiaoZhi 模式
  if (useXiaozhiBackend.value && xiaozhi.isConnected.value) {
    currentMessage.value = "";
    currentThinking.value = null;
    isShowingThinking.value = false;
    currentSpeaker.value = null;

    // 添加用户消息到历史记录
    addUserMessage("我", `对 ${currentPet.value.name} 说: ${message}`);

    // 发送到 XiaoZhi 后端
    xiaozhi.sendText(message);
    return;
  }

  // 原有 LLM 逻辑
  if (agent.isLoading.value) return;

  currentMessage.value = "";
  currentThinking.value = null;
  isShowingThinking.value = false;
  currentSpeaker.value = null;

  // 添加用户消息到历史记录（主人对宠物说）
  addUserMessage("我", `对 ${currentPet.value.name} 说: ${message}`);

  // 如果已连接服务器，广播用户消息给其他宠物
  // 其他人看到：[主人] 对 [宠物名] 说: message
  if (isConnected.value && isRegistered.value) {
    sendP2PMessage(message, undefined, {
      messageType: "master_to_pet",
      toName: currentPet.value.name,
    });
  }

  try {
    // 初始化 agent（仅首次）
    if (!agent.isInitialized.value) {
      const llmConfig = {
        provider: settings.value.llmProvider,
        apiKey: settings.value.llmApiKey,
        baseUrl: settings.value.llmBaseUrl,
        model: settings.value.llmModel,
      };
      await agent.analyzeAndSetActions(
        motionDetails.value,
        availableExpressions.value,
        llmConfig,
      );
      await agent.initAgent(llmConfig);
    }

    // 发送消息 - agent 会自动处理工具调用
    const response = await agent.sendMessage(message);

    // 显示回复（工具调用已在 agent 内部通过回调自动处理）
    if (response.content) {
      isShowingThinking.value = false;
      currentMessage.value = response.content;
      currentSpeaker.value = null;
      addPetMessage(currentPet.value.name, response.content);
    }
  } catch (error) {
    console.error("Chat error:", error);
    const errorMsg = "抱歉，出了点问题...";
    currentMessage.value = errorMsg;
    currentSpeaker.value = null;
    addPetMessage(currentPet.value.name, errorMsg);
  }
};

// 处理其他宠物的消息（自动回复）
async function handlePetMessage(message: PetMessage) {
  console.log("Received pet message:", message);

  // 忽略来自自己宠物的消息（避免收到自己发出的广播）
  if (message.from === currentPet.value.name) {
    console.log("Ignoring message from self:", message.from);
    return;
  }

  // 根据 isDirectTarget 决定显示格式
  // - 直接目标：只显示原始内容
  // - 旁观者：显示格式化内容 [发送者] 对 [目标] 说: 内容
  let displayContent = message.content;
  let historyContent = message.content;

  if (message.isDirectTarget) {
    // 我是直接目标，只显示原始消息
    displayContent = message.content;
    historyContent = message.content;
  } else {
    // 我是旁观者，显示格式化消息
    if (message.messageType === "master_to_pet") {
      // 主人对宠物说的话
      displayContent = `[主人] 对 [${message.toName || message.from}] 说: ${
        message.content
      }`;
    } else if (message.messageType === "pet_to_pet") {
      // 宠物对宠物说的话
      displayContent = `[${message.from}] 对 [${message.toName}] 说: ${message.content}`;
    }
    historyContent = displayContent;
  }

  // 添加其他宠物消息到历史记录（不显示气泡，气泡只显示自己宠物的发言）
  addOtherPetMessage(message.from, historyContent);

  // 无论是直接目标还是旁观者，都需要调用 LLM 判断是否回复
  if (
    autoChat.value &&
    !autoChatCooldown.value &&
    !isAutoReplying.value &&
    isLLMConfigured.value
  ) {
    // 设置冷却，避免频繁回复
    autoChatCooldown.value = true;
    isAutoReplying.value = true;

    // 随机延迟 1-3 秒，模拟思考
    const delay = 1000 + Math.random() * 2000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      // 初始化 agent（仅首次）
      if (!agent.isInitialized.value) {
        const llmConfig = {
          provider: settings.value.llmProvider,
          apiKey: settings.value.llmApiKey,
          baseUrl: settings.value.llmBaseUrl,
          model: settings.value.llmModel,
        };
        await agent.analyzeAndSetActions(
          motionDetails.value,
          availableExpressions.value,
          llmConfig,
        );
        await agent.initAgent(llmConfig);
      }

      // 根据是否为直接目标，构造不同的上下文消息
      let contextMessage: string;
      if (message.isDirectTarget) {
        // 直接目标：对方在和我说话
        contextMessage = `[${message.from}对你说]: ${message.content}`;
      } else {
        // 旁观者：听到了别人的对话
        if (message.messageType === "master_to_pet") {
          contextMessage = `[你听到主人对${message.toName}说]: ${message.content}`;
        } else {
          contextMessage = `[你听到${message.from}对${message.toName}说]: ${message.content}`;
        }
      }

      const response = await agent.sendMessage(contextMessage);

      // 如果宠物选择不回复（content 为 null），则不显示文字
      if (!response.content) {
        console.log("Pet chose not to reply to:", message.from);
        return;
      }

      // 显示气泡
      currentSpeaker.value = null;
      isShowingThinking.value = false;
      currentMessage.value = response.content;

      // 添加宠物回复到历史记录
      if (message.isDirectTarget) {
        // 直接回复对方
        addPetMessage(
          currentPet.value.name,
          `对 [${message.from}] 说: ${response.content}`
        );
        // 广播回复，指定目标
        sendP2PMessage(response.content, message.fromId, {
          messageType: "pet_to_pet",
          toName: message.from,
        });
      } else {
        // 旁观者插话（广播给所有人）
        addPetMessage(currentPet.value.name, response.content);
        sendP2PMessage(response.content, undefined, {
          messageType: "pet_to_pet",
          toName: undefined,
        });
      }
    } catch (e) {
      console.error("Auto reply error:", e);
    } finally {
      isAutoReplying.value = false;
      // 冷却 5 秒
      setTimeout(() => {
        autoChatCooldown.value = false;
      }, 5000);
    }
  }
}

// 根据字数计算显示时间
const calculateDisplayDuration = (message: string): number => {
  const charCount = message.length;
  // 基础时间 3 秒 + 每个字符 80ms，最小 3 秒，最大 15 秒
  const baseDuration = 3000;
  const perCharDuration = 80;
  const minDuration = 3000;
  const maxDuration = 15000;

  const duration = baseDuration + charCount * perCharDuration;
  return Math.max(minDuration, Math.min(maxDuration, duration));
};

// ============ 语音录制相关 ============

// 处理语音按钮按下
const handleVoiceStart = async () => {
  if (!xiaozhi.isConnected.value) {
    console.warn("[HomeView] XiaoZhi 未连接，无法录音");
    return;
  }

  console.log("[HomeView] 开始语音录制");
  currentMessage.value = "正在录音...";
  currentSpeaker.value = null;

  const success = await xiaozhi.startRecording();
  if (!success) {
    currentMessage.value = "录音启动失败";
    setTimeout(() => {
      currentMessage.value = "";
    }, 2000);
  }
};

// 处理语音按钮松开
const handleVoiceEnd = () => {
  if (!xiaozhi.isRecording.value) return;

  console.log("[HomeView] 停止语音录制");
  xiaozhi.stopRecording();

  // 显示等待识别的提示
  currentMessage.value = "正在识别...";

  // 设置超时清除（如果服务器没有响应）
  setTimeout(() => {
    if (currentMessage.value === "正在识别...") {
      currentMessage.value = "";
    }
  }, 10000);
};

// 处理新宠物上线
function handlePetOnline(pet: PetInfo) {
  // 可以播放一个欢迎动作
  if (autoChat.value && !autoChatCooldown.value) {
    live2dRef.value?.playMotion("Flick");
    const welcomeMsg = `${pet.name} 来了~`;
    currentMessage.value = welcomeMsg;
    currentSpeaker.value = null;

    setTimeout(() => {
      currentMessage.value = "";
    }, calculateDisplayDuration(welcomeMsg));
  }
}

// 自动清除消息
const clearMessage = () => {
  if (
    settings.value.showBubble &&
    currentMessage.value &&
    !currentSpeaker.value
  ) {
    const duration = calculateDisplayDuration(currentMessage.value);
    setTimeout(() => {
      currentMessage.value = "";
    }, duration);
  }
};

// 测试：播放指定动作（通过组和索引）
const testMotionByIndex = (group: string, index: number) => {
  console.log("Test playing motion:", group, "index:", index);
  live2dRef.value?.playMotionByIndex(group, index);
};

// 测试：设置表情
const testExpression = (expressionName: string) => {
  console.log("Test setting expression:", expressionName);
  live2dRef.value?.setExpression(expressionName);
};

// 切换测试面板
const toggleTestPanel = () => {
  showTestPanel.value = !showTestPanel.value;
  if (showTestPanel.value) showPetsPanel.value = false;
  if (showTestPanel.value) showAdjustPanel.value = false;
};

// 切换宠物面板
const togglePetsPanel = () => {
  showPetsPanel.value = !showPetsPanel.value;
  if (showPetsPanel.value) showTestPanel.value = false;
  if (showPetsPanel.value) showAdjustPanel.value = false;
};

// 切换调整面板
const toggleAdjustPanel = () => {
  showAdjustPanel.value = !showAdjustPanel.value;
  if (showAdjustPanel.value) showTestPanel.value = false;
  if (showAdjustPanel.value) showPetsPanel.value = false;
};

// 重置 Live2D 变换
const resetTransform = () => {
  live2dTransform.value = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };
};

// 主动打招呼
const sayHelloTo = (pet: PetInfo) => {
  if (!isConnected.value || !isRegistered.value) return;

  const greetings = [
    `${pet.name}，你好呀~`,
    `嘿，${pet.name}！`,
    `${pet.name}，在干嘛呢？`,
  ];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  // 添加到自己的历史记录
  addPetMessage(currentPet.value.name, `对 [${pet.name}] 说: ${greeting}`);

  // 发送宠物对宠物的消息，指定目标宠物 ID
  sendP2PMessage(greeting, pet.id, {
    messageType: "pet_to_pet",
    toName: pet.name,
  });

  currentMessage.value = greeting;
  currentSpeaker.value = null;
  live2dRef.value?.playMotion("Flick");
};

// 监听设置变化，自动连接/断开服务器
watch(
  () => [settings.value.serverUrl, settings.value.autoConnect] as const,
  ([serverUrl, autoConnect]) => {
    if (autoConnect && serverUrl && !isConnected.value) {
      console.log("Auto connecting to server:", serverUrl);
      connect(serverUrl);
    }
  },
  { immediate: true }
);

// 连接成功后自动注册
watch(isConnected, (connected) => {
  if (connected && !isRegistered.value) {
    register({
      name: currentPet.value.name,
      modelPath: currentPet.value.modelPath,
    });
  }
});

// 注意：不要在组件卸载时断开连接
// P2P 连接应该在整个应用生命周期内保持
// 只有在用户明确关闭应用或禁用自动连接时才断开

// P2P 注册成功后，接入 agent 的通信上下文
watch(isRegistered, (registered) => {
  if (registered) {
    agent.setP2PContext({
      getOnlinePets: () => onlinePets.value,
      getRecentMessages: () => [],
      sendMessageToPet: (targetId, content) =>
        sendP2PMessage(content, targetId),
      broadcastMessage: (content) => sendP2PMessage(content),
    });
  }
});

// ===== XiaoZhi 集成 =====

// 初始化 XiaoZhi 事件监听
const setupXiaozhiListeners = () => {
  // 清理旧的监听器
  xiaozhiUnsubscribers.forEach((unsub) => unsub());
  xiaozhiUnsubscribers.length = 0;

  // TTS 开始播放 - 显示文字气泡并添加到历史记录
  xiaozhiUnsubscribers.push(
    xiaozhi.onTTSStart((text) => {
      console.log("[HomeView] XiaoZhi TTS sentence_start:", text);
      // 取消之前的气泡清除定时器（因为新句子开始了）
      if (bubbleClearTimer) {
        clearTimeout(bubbleClearTimer);
        bubbleClearTimer = null;
      }
      currentSpeaker.value = null;
      isShowingThinking.value = false;
      // 直接显示文字
      currentMessage.value = text;
      // 添加到历史记录
      addPetMessage(currentPet.value.name, text);
    })
  );

  // TTS 结束（服务器发送的 stop 信号）- 渐进消失气泡
  xiaozhiUnsubscribers.push(
    xiaozhi.onTTSEnd(() => {
      console.log("[HomeView] XiaoZhi TTS stop 信号，开始清除气泡");
      // 延迟清除消息，给用户一点阅读时间
      bubbleClearTimer = setTimeout(() => {
        bubbleClearTimer = null;
        currentMessage.value = "";
      }, 1500);
    })
  );

  // LLM 回复 - 仅记录日志（历史记录由 TTS sentence_start 添加）
  xiaozhiUnsubscribers.push(
    xiaozhi.onLLM((text) => {
      console.log("[HomeView] XiaoZhi LLM 回复:", text);
      // 不在这里添加历史记录，因为 TTS sentence_start 已经添加了
    })
  );

  // STT 识别结果 - 添加到历史记录
  xiaozhiUnsubscribers.push(
    xiaozhi.onSTT((text) => {
      console.log("[HomeView] XiaoZhi STT:", text);
      // 语音识别的文本显示为用户消息
      addUserMessage("我", `对 ${currentPet.value.name} 说: ${text}`);
    })
  );
};

// 连接到 XiaoZhi 后端（简化版，连接状态由 composable 管理）
const connectXiaozhi = async () => {
  // 使用 composable 中已有的 MAC 地址，或从设置中获取
  const deviceMac = settings.value.xiaozhiDeviceMac || undefined;

  const result = await xiaozhi.connect({
    otaUrl: settings.value.xiaozhiOtaUrl,
    deviceMac: deviceMac,
    deviceName: settings.value.xiaozhiDeviceName || currentPet.value.name,
    autoPlayAudio: settings.value.xiaozhiAutoPlayAudio,
  });

  // 如果自动生成了 MAC 地址，保存到设置中
  if (result.generatedMac) {
    settings.value.xiaozhiDeviceMac = result.generatedMac;
    console.log("[HomeView] 保存自动生成的 MAC 地址:", result.generatedMac);
  }
};

// 断开 XiaoZhi 连接
const disconnectXiaozhi = () => {
  xiaozhi.disconnect();
};

// 监听 XiaoZhi 设置变化，自动连接/断开
watch(
  () => [settings.value.xiaozhiEnabled, settings.value.xiaozhiOtaUrl] as const,
  ([enabled, otaUrl]) => {
    if (enabled && otaUrl) {
      // 启用且有 URL，自动连接
      if (!xiaozhi.isConnected.value && !xiaozhi.isConnecting.value) {
        connectXiaozhi();
      }
    } else {
      // 禁用，断开连接
      if (xiaozhi.isConnected.value) {
        disconnectXiaozhi();
      }
    }
  },
  { immediate: true }
);

// 组件挂载时设置 XiaoZhi 监听器
onMounted(() => {
  setupXiaozhiListeners();
});

// 组件卸载时清理
onUnmounted(() => {
  xiaozhiUnsubscribers.forEach((unsub) => unsub());
  xiaozhiUnsubscribers.length = 0;
  // 清理气泡清除定时器
  if (bubbleClearTimer) {
    clearTimeout(bubbleClearTimer);
    bubbleClearTimer = null;
  }
  // 注意：不断开 XiaoZhi 连接，因为可能还需要继续使用
});
</script>

<template>
  <div class="home-view" :style="backgroundStyle">
    <!-- 设置按钮 -->
    <button class="settings-btn" @click="emit('openSettings')">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
        />
      </svg>
    </button>

    <!-- 调整按钮 -->
    <button class="adjust-btn" @click="toggleAdjustPanel">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"
        />
      </svg>
    </button>

    <!-- 测试按钮 -->
    <button class="test-btn" @click="toggleTestPanel">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3h7zM7 9H4V5h3v4zm10 6h3v4h-3v-4zm0-10v4h3V5h-3z"
        />
      </svg>
    </button>

    <!-- 在线宠物按钮 -->
    <button
      class="pets-btn"
      @click="togglePetsPanel"
      :class="{ connected: isConnected }"
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
        />
      </svg>
      <span v-if="otherPets.length > 0" class="pet-count">{{
        otherPets.length
      }}</span>
    </button>

    <!-- 小组件按钮 -->
    <button
      class="widget-btn"
      @click="toggleWidgetEditMode"
      :class="{ active: editMode }"
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10 0h8v8h-8v-8zm0-10h8v8h-8V3z" />
      </svg>
    </button>

    <!-- 添加小组件按钮（编辑模式下显示） -->
    <Transition name="fade">
      <button
        v-if="editMode"
        class="add-widget-btn-float"
        @click="openAddWidgetDialog"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </button>
    </Transition>

    <!-- 添加小组件对话框 -->
    <Transition name="dialog">
      <div v-if="showAddWidgetDialog" class="dialog-overlay" @click="closeAddWidgetDialog">
        <div class="add-widget-dialog" @click.stop>
          <div class="dialog-header">
            <h3>添加小组件</h3>
            <button class="close-btn" @click="closeAddWidgetDialog">✕</button>
          </div>
          <div class="widget-selector">
            <div
              v-for="(info, type) in widgetInfo"
              :key="type"
              class="widget-option"
              :class="{ disabled: info.disabled }"
              @click="handleAddWidget(type as WidgetType)"
            >
              <span class="widget-icon">{{ info.icon }}</span>
              <div class="widget-option-info">
                <span class="widget-option-name">
                  {{ info.name }}
                  <span v-if="info.disabled" class="dev-tag">开发中</span>
                </span>
                <span class="widget-option-desc">{{ info.description }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 测试面板 -->
    <Transition name="panel">
      <div v-if="showTestPanel" class="test-panel">
        <div class="panel-title">动作测试</div>

        <!-- 按组显示动作 -->
        <template v-if="Object.keys(motionsByGroup).length > 0">
          <div
            v-for="(motions, groupName) in motionsByGroup"
            :key="groupName"
            class="motion-section"
          >
            <div class="section-label">{{ groupName }}</div>
            <div class="motion-buttons">
              <button
                v-for="motion in motions"
                :key="`${groupName}-${motion.index}`"
                class="motion-btn"
                @click="testMotionByIndex(String(groupName), motion.index)"
              >
                {{ motion.name }}
              </button>
            </div>
          </div>
        </template>

        <!-- 表情列表 -->
        <div v-if="availableExpressions.length > 0" class="motion-section">
          <div class="section-label">表情</div>
          <div class="motion-buttons">
            <button
              v-for="expression in availableExpressions"
              :key="expression"
              class="motion-btn expression"
              @click="testExpression(expression)"
            >
              {{ expression }}
            </button>
          </div>
        </div>

        <!-- 无可用动作时的提示 -->
        <div
          v-if="
            Object.keys(motionsByGroup).length === 0 &&
            availableExpressions.length === 0
          "
          class="no-motions"
        >
          <p>暂无可用动作</p>
          <p class="hint">请先在设置中配置 Live2D 模型</p>
        </div>
      </div>
    </Transition>

    <!-- 在线宠物面板 -->
    <Transition name="panel">
      <div v-if="showPetsPanel" class="pets-panel">
        <div class="panel-title">
          在线宠物
          <span class="connection-status" :class="{ connected: isConnected }">
            {{ isConnected ? "已连接" : "未连接" }}
          </span>
        </div>

        <div v-if="!isConnected" class="no-connection">
          <p>未连接到服务器</p>
          <p class="hint">请在设置中配置服务器地址</p>
        </div>

        <template v-else>
          <!-- 自己的信息 -->
          <div v-if="isRegistered" class="my-pet-info">
            <div class="pet-avatar me">
              {{ currentPet.name.charAt(0) }}
            </div>
            <div class="pet-details">
              <span class="pet-name">{{ currentPet.name }}</span>
              <span class="pet-hint me-tag">（我）</span>
            </div>
          </div>

          <!-- 其他宠物 -->
          <div v-if="otherPets.length === 0" class="no-pets">
            <p>暂无其他宠物在线</p>
            <p class="hint">等待其他宠物加入...</p>
          </div>

          <div v-else class="pet-list">
            <div
              v-for="pet in otherPets"
              :key="pet.id"
              class="pet-item"
              @click="sayHelloTo(pet)"
            >
              <div class="pet-avatar">
                {{ pet.name.charAt(0) }}
              </div>
              <div class="pet-details">
                <span class="pet-name">{{ pet.name }}</span>
                <span class="pet-hint">点击打招呼</span>
              </div>
            </div>
          </div>

          <!-- 在线统计 -->
          <div class="online-stats">共 {{ onlinePets.length }} 只宠物在线</div>
        </template>

        <div class="auto-chat-toggle">
          <label class="toggle-label">
            <input type="checkbox" v-model="autoChat" />
            <span class="toggle-text">自动对话</span>
          </label>
        </div>
      </div>
    </Transition>

    <!-- Live2D 调整面板 -->
    <Transition name="panel">
      <div v-if="showAdjustPanel" class="adjust-panel">
        <div class="panel-title">Live2D 调整</div>

        <div class="slider-group">
          <div class="slider-label">
            <span>缩放</span>
            <span class="slider-value"
              >{{ live2dTransform.scale.toFixed(1) }}x</span
            >
          </div>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            v-model.number="live2dTransform.scale"
            class="slider"
          />
        </div>

        <div class="slider-group">
          <div class="slider-label">
            <span>水平位置</span>
            <span class="slider-value">{{ live2dTransform.offsetX }}%</span>
          </div>
          <input
            type="range"
            min="-50"
            max="50"
            step="1"
            v-model.number="live2dTransform.offsetX"
            class="slider"
          />
        </div>

        <div class="slider-group">
          <div class="slider-label">
            <span>垂直位置</span>
            <span class="slider-value">{{ live2dTransform.offsetY }}%</span>
          </div>
          <input
            type="range"
            min="-50"
            max="50"
            step="1"
            v-model.number="live2dTransform.offsetY"
            class="slider"
          />
        </div>

        <button class="reset-btn" @click="resetTransform">重置</button>
      </div>
    </Transition>

    <!-- Live2D 模型展示区域 -->
    <Live2DCanvas ref="live2dRef" class="live2d-area" />

    <!-- 小组件容器 -->
    <WidgetContainer />

    <!-- 对话气泡 -->
    <Transition name="bubble">
      <ChatBubble
        v-if="
          (currentMessage || agent.isLoading.value || isAutoReplying) && settings.showBubble
        "
        :message="currentMessage"
        :is-thinking="(agent.isLoading.value || isAutoReplying) && !isShowingThinking"
        :is-inner-monologue="isShowingThinking"
        :speaker="currentSpeaker"
        class="bubble"
        @vue:mounted="clearMessage"
      />
    </Transition>

    <!-- 宠物名称标签 -->
    <div class="pet-info">
      <span class="pet-name">{{ currentPet.name }}</span>
      <span
        v-if="useXiaozhiBackend"
        class="xiaozhi-status"
        :class="{ active: isXiaozhiConnected }"
      >
        {{ xiaozhi.statusText.value }}
      </span>
      <span v-else class="ai-status" :class="{ active: isLLMConfigured }">
        {{ isLLMConfigured ? "AI" : "离线" }}
      </span>
      <span v-if="isConnected" class="p2p-status"> P2P </span>
    </div>

    <!-- 聊天历史记录 -->
    <ChatHistory :messages="chatHistory" :pet-name="currentPet.name" />

    <!-- 输入区域 -->
    <div
      class="input-area-wrapper"
      :style="{
        bottom: keyboardHeight > 0 ? `${keyboardHeight + 12}px` : undefined,
      }"
    >
      <ChatInput
        class="input-area"
        @send="handleSendMessage"
        :disabled="agent.isLoading.value || isAutoReplying || xiaozhi.isRecording.value"
      />
      <!-- 语音输入按钮 -->
      <VoiceButton
        v-if="isXiaozhiConnected"
        :recording="xiaozhi.isRecording.value"
        @start="handleVoiceStart"
        @end="handleVoiceEnd"
      />
    </div>
  </div>
</template>

<style scoped>
.home-view {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); /* fallback */
  position: relative;
  overflow: hidden;
}

.settings-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.settings-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: rotate(30deg);
}

.settings-btn:active {
  transform: rotate(30deg) scale(0.95);
}

.settings-btn svg {
  width: 24px;
  height: 24px;
  color: white;
}

.adjust-btn {
  position: absolute;
  top: 16px;
  right: 70px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.adjust-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.adjust-btn:active {
  transform: scale(0.95);
}

.adjust-btn svg {
  width: 24px;
  height: 24px;
  color: white;
}

.test-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.test-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.test-btn:active {
  transform: scale(0.95);
}

.test-btn svg {
  width: 24px;
  height: 24px;
  color: white;
}

.pets-btn {
  position: absolute;
  top: 16px;
  left: 70px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.pets-btn.connected {
  background: rgba(76, 175, 80, 0.3);
}

.pets-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.pets-btn.connected:hover {
  background: rgba(76, 175, 80, 0.4);
}

.pets-btn svg {
  width: 24px;
  height: 24px;
  color: white;
}

.pet-count {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ff5722;
  color: white;
  font-size: 10px;
  font-weight: 600;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.test-panel,
.pets-panel,
.adjust-panel {
  position: absolute;
  top: 70px;
  left: 16px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 16px;
  z-index: 30;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  min-width: 220px;
  max-width: 280px;
}

.adjust-panel {
  right: 16px;
  left: auto;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.connection-status {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #ffebee;
  color: #c62828;
}

.connection-status.connected {
  background: #e8f5e9;
  color: #2e7d32;
}

/* Slider styles for adjust panel */
.slider-group {
  margin-bottom: 16px;
}

.slider-label {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #333;
  margin-bottom: 8px;
}

.slider-value {
  color: #667eea;
  font-weight: 500;
}

.slider {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: #e0e0e0;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.4);
  transition: transform 0.2s ease;
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.4);
}

.reset-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: #f5f5f5;
  color: #666;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 8px;
}

.reset-btn:hover {
  background: #eeeeee;
  color: #333;
}

.reset-btn:active {
  transform: scale(0.98);
}

.motion-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.motion-btn {
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.motion-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.motion-btn:active {
  transform: translateY(0);
}

.motion-section {
  margin-bottom: 12px;
}

.motion-section:last-child {
  margin-bottom: 0;
}

.section-label {
  font-size: 11px;
  color: #888;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.motion-btn.expression {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.motion-btn.expression:hover {
  box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
}

.no-motions {
  text-align: center;
  padding: 16px 0;
  color: #666;
}

.no-motions p {
  margin: 0;
}

.no-motions .hint {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.no-connection,
.no-pets {
  text-align: center;
  padding: 16px 0;
  color: #666;
}

.no-connection p,
.no-pets p {
  margin: 0;
}

.hint {
  font-size: 12px;
  color: #999;
  margin-top: 4px !important;
}

.pet-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pet-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pet-item:hover {
  background: #eeeeee;
  transform: translateX(4px);
}

.pet-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}

.pet-details {
  display: flex;
  flex-direction: column;
}

.pet-details .pet-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.pet-hint {
  font-size: 11px;
  color: #999;
}

.my-pet-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: linear-gradient(
    135deg,
    rgba(102, 126, 234, 0.1) 0%,
    rgba(118, 75, 162, 0.1) 100%
  );
  border-radius: 10px;
  margin-bottom: 12px;
  border: 1px solid rgba(102, 126, 234, 0.2);
}

.pet-avatar.me {
  background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
}

.me-tag {
  color: #4caf50;
  font-weight: 500;
}

.online-stats {
  text-align: center;
  font-size: 12px;
  color: #666;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px dashed #eee;
}

.auto-chat-toggle {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eee;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.toggle-label input {
  width: 16px;
  height: 16px;
  accent-color: #667eea;
}

.toggle-text {
  font-size: 13px;
  color: #333;
}

/* Panel animation */
.panel-enter-active,
.panel-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

.live2d-area {
  flex: 1;
  position: relative;
}

.bubble {
  position: absolute;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 80%;
  z-index: 50;
}

.pet-info {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  padding: 6px 12px 6px 16px;
  border-radius: 16px;
}

.pet-info .pet-name {
  color: white;
  font-size: 14px;
  font-weight: 500;
}

.ai-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.8);
}

.ai-status.active {
  background: #4caf50;
  color: white;
}

.xiaozhi-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 8px;
  background: rgba(255, 152, 0, 0.3);
  color: rgba(255, 255, 255, 0.8);
}

.xiaozhi-status.active {
  background: #ff9800;
  color: white;
}

.p2p-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 8px;
  background: #2196f3;
  color: white;
}

.input-area-wrapper {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: bottom 0.25s ease-out;
}

.input-area {
  flex: 1;
}

/* Bubble animation */
.bubble-enter-active,
.bubble-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.bubble-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px) scale(0.9);
}

.bubble-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px) scale(0.95);
}

/* 横屏适配 */
@media (orientation: landscape) {
  .settings-btn {
    top: 12px;
    right: max(12px, env(safe-area-inset-right, 12px));
  }

  .adjust-btn {
    top: 12px;
    right: calc(max(12px, env(safe-area-inset-right, 12px)) + 54px);
  }

  .test-btn {
    top: 12px;
    left: max(12px, env(safe-area-inset-left, 12px));
  }

  .pets-btn {
    top: 12px;
    left: calc(max(12px, env(safe-area-inset-left, 12px)) + 54px);
  }

  .test-panel,
  .pets-panel {
    top: 66px;
    left: max(12px, env(safe-area-inset-left, 12px));
    max-height: calc(100vh - 80px);
    overflow-y: auto;
  }

  .adjust-panel {
    top: 66px;
    right: max(12px, env(safe-area-inset-right, 12px));
    max-height: calc(100vh - 80px);
    overflow-y: auto;
  }

  .bubble {
    top: 60px;
    max-width: 60%;
  }

  .pet-info {
    bottom: 20px;
    left: max(16px, env(safe-area-inset-left, 16px));
    transform: none;
  }

  .input-area-wrapper {
    bottom: max(16px, env(safe-area-inset-bottom, 16px));
    left: auto;
    right: max(16px, env(safe-area-inset-right, 16px));
    transform: none;
    width: 40%;
    min-width: 280px;
    max-width: 400px;
  }
}

/* 平板适配 */
@media (min-width: 768px) {
  .test-panel,
  .pets-panel,
  .adjust-panel {
    min-width: 280px;
    max-width: 320px;
  }

  .input-area-wrapper {
    width: 50%;
    max-width: 500px;
  }
}

/* 安全区域适配（刘海屏/挖孔屏） */
@supports (padding: env(safe-area-inset-top)) {
  .home-view {
    padding-top: env(safe-area-inset-top, 0);
    padding-bottom: env(safe-area-inset-bottom, 0);
    padding-left: env(safe-area-inset-left, 0);
    padding-right: env(safe-area-inset-right, 0);
  }
}

/* 小组件按钮 */
.widget-btn {
  position: absolute;
  top: 16px;
  left: 124px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.widget-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.widget-btn.active {
  background: rgba(99, 102, 241, 0.8);
}

.widget-btn svg {
  width: 24px;
  height: 24px;
  color: white;
}

/* 添加小组件浮动按钮（编辑模式下显示） */
.add-widget-btn-float {
  position: absolute;
  top: 70px;
  left: 124px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.add-widget-btn-float:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
}

.add-widget-btn-float:active {
  transform: translateY(0);
}

.add-widget-btn-float svg {
  width: 24px;
  height: 24px;
  color: white;
}

/* 对话框覆盖层 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

/* 添加小组件对话框 */
.add-widget-dialog {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  max-height: 70vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 20px;
  color: #666;
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.2s;
}

.close-btn:hover {
  background: #f5f5f5;
}

/* 小组件选择器 */
.widget-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  overflow-y: auto;
}

.widget-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.widget-option:hover {
  background: #eeeeee;
  transform: translateX(4px);
}

.widget-option:active {
  transform: scale(0.98);
}

/* 禁用的小组件选项 */
.widget-option.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.widget-option.disabled:hover {
  background: #f5f5f5;
  transform: none;
}

.widget-icon {
  font-size: 24px;
}

.widget-option-info {
  display: flex;
  flex-direction: column;
}

.widget-option-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 开发中标签 */
.dev-tag {
  display: inline-block;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 8px;
  background: #ff9800;
  color: white;
  font-weight: 600;
  vertical-align: middle;
}

.widget-option-desc {
  font-size: 11px;
  color: #999;
}

/* 对话框动画 */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.3s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-active .add-widget-dialog,
.dialog-leave-active .add-widget-dialog {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.dialog-enter-from .add-widget-dialog,
.dialog-leave-to .add-widget-dialog {
  transform: scale(0.9) translateY(20px);
}

/* Fade 动画（用于添加按钮） */
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

/* 横屏小组件按钮适配 */
@media (orientation: landscape) {
  .widget-btn {
    top: 12px;
    left: calc(max(12px, env(safe-area-inset-left, 12px)) + 108px);
  }

  .add-widget-btn-float {
    top: 66px;
    left: calc(max(12px, env(safe-area-inset-left, 12px)) + 108px);
  }
}
</style>
