<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ChatInput, ChatBubble, ChatHistory } from "@desktopfriends/ui";
import {
  useChat,
  useSettings,
  useP2P,
  useChatHistory,
  type ChatResponse,
  type ToolCall,
  type PetMessage,
  type PetInfo,
} from "@desktopfriends/core";
import Live2DCanvas from "../components/Live2DCanvas.vue";
import { useKeyboard } from "../composables/useKeyboard";

// 组件名称，用于 KeepAlive
defineOptions({
  name: "HomeView",
});

const emit = defineEmits<{
  openSettings: [];
}>();

const { settings, getLLMConfig, currentPet, live2dTransform, backgroundStyle } =
  useSettings();
const {
  sendMessage: sendToLLM,
  isLoading,
  setConfig,
  setPetName,
  setCustomPrompt,
  setAvailableActions,
} = useChat();

// 聊天历史记录
const { chatHistory, addUserMessage, addPetMessage, addOtherPetMessage } =
  useChatHistory();

// 键盘处理
const { keyboardHeight } = useKeyboard();

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

// 是否已配置大模型
const isLLMConfigured = computed(() => !!settings.value.llmApiKey);

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

// 处理 Tool 调用，控制 Live2D 模型
const handleToolCalls = (toolCalls: ToolCall[]) => {
  for (const tool of toolCalls) {
    console.log("Executing tool:", tool.name, tool.arguments);

    if (tool.name === "playMotion") {
      const motionName = tool.arguments.name as string;
      // 查找动作的组和索引
      const motionInfo = motionDetails.value.find((m) => m.name === motionName);
      if (motionInfo) {
        live2dRef.value?.playMotionByIndex(motionInfo.group, motionInfo.index);
      } else {
        // 如果找不到，尝试作为组名播放
        live2dRef.value?.playMotion(motionName);
      }
      // 同步动作给其他宠物
      if (isConnected.value && isRegistered.value) {
        sendAction("motion", motionName);
      }
    } else if (tool.name === "setExpression") {
      const expressionName = tool.arguments.name as string;
      live2dRef.value?.setExpression(expressionName);
      // 同步表情给其他宠物
      if (isConnected.value && isRegistered.value) {
        sendAction("expression", expressionName);
      }
    }
  }
};

// 监听可用动作/表情变化，更新到 chat 模块
watch(
  [motionDetails, availableExpressions],
  ([details, expressions]) => {
    // 提取所有动作名称（用于 LLM 工具）
    const motionNames = details.map((m) => m.name);
    setAvailableActions(motionNames, expressions);
    console.log("Updated available actions:", {
      motions: motionNames,
      expressions,
    });
  },
  { immediate: true }
);

// 处理用户发送的消息
const handleSendMessage = async (message: string) => {
  if (!message.trim() || isLoading.value) return;

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

  // 配置 LLM 和宠物名称
  setConfig(getLLMConfig());
  setPetName(currentPet.value.name);
  setCustomPrompt(currentPet.value.prompt);

  // 发送消息（无论是否配置 API，都会返回 ChatResponse）
  const response: ChatResponse = await sendToLLM(message);

  // 执行工具调用（控制 Live2D）
  if (response.toolCalls.length > 0) {
    handleToolCalls(response.toolCalls);
  }

  // 如果宠物选择不回复（content 和 thinking 都为 null），则不显示任何内容
  if (response.content === null && response.thinking === null) {
    console.log("Pet chose not to reply");
    return;
  }

  // 构建历史记录内容
  let historyContent = "";
  if (response.thinking) {
    historyContent += `💭${response.thinking}`;
  }
  if (response.content) {
    if (historyContent) historyContent += " ";
    historyContent += response.content;
  }

  // 添加宠物回复到历史记录
  if (historyContent) {
    addPetMessage(currentPet.value.name, historyContent);
  }

  // 显示气泡：先显示内心独白，再显示说的话
  if (response.thinking) {
    // 先显示内心独白
    currentThinking.value = response.thinking;
    isShowingThinking.value = true;
    currentMessage.value = response.thinking;

    // 如果有说的话，延迟后显示
    if (response.content) {
      setTimeout(() => {
        isShowingThinking.value = false;
        currentMessage.value = response.content || "";
      }, 2000); // 2秒后切换到说的话
    }
  } else if (response.content) {
    // 只有说的话
    currentMessage.value = response.content;
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
      displayContent = `[主人] 对 [${message.toName || message.from}] 说: ${message.content}`;
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
      // 配置 LLM
      setConfig(getLLMConfig());
      setPetName(currentPet.value.name);
      setCustomPrompt(currentPet.value.prompt);

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

      const response = await sendToLLM(contextMessage);

      // 执行动作（无论是否回复文字，都可以执行动作）
      if (response.toolCalls.length > 0) {
        handleToolCalls(response.toolCalls);
      }

      // 如果宠物选择不回复（content 和 thinking 都为 null），则不显示文字
      if (response.content === null && response.thinking === null) {
        console.log("Pet chose not to reply to:", message.from);
        return;
      }

      // 构建历史记录内容
      let historyContent = "";
      if (response.thinking) {
        historyContent += `💭${response.thinking}`;
      }
      if (response.content) {
        if (historyContent) historyContent += " ";
        historyContent += response.content;
      }

      // 显示气泡：先显示内心独白，再显示说的话
      currentSpeaker.value = null;
      if (response.thinking) {
        isShowingThinking.value = true;
        currentMessage.value = response.thinking;

        if (response.content) {
          setTimeout(() => {
            isShowingThinking.value = false;
            currentMessage.value = response.content || "";
          }, 2000);
        }
      } else if (response.content) {
        currentMessage.value = response.content;
      }

      // 添加宠物回复到历史记录
      if (message.isDirectTarget) {
        // 直接回复对方
        addPetMessage(
          currentPet.value.name,
          `对 [${message.from}] 说: ${historyContent}`
        );
        // 广播回复，指定目标（只发送说的话，不发送内心独白）
        if (response.content) {
          sendP2PMessage(response.content, message.fromId, {
            messageType: "pet_to_pet",
            toName: message.from,
          });
        }
      } else {
        // 旁观者插话（广播给所有人）
        addPetMessage(currentPet.value.name, historyContent);
        // 只发送说的话，不发送内心独白
        if (response.content) {
          sendP2PMessage(response.content, undefined, {
            messageType: "pet_to_pet",
            toName: undefined,
          });
        }
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

    <!-- 对话气泡 -->
    <Transition name="bubble">
      <ChatBubble
        v-if="
          (currentMessage || isLoading || isAutoReplying) && settings.showBubble
        "
        :message="currentMessage"
        :is-thinking="isLoading || isAutoReplying"
        :is-inner-monologue="isShowingThinking"
        :speaker="currentSpeaker"
        class="bubble"
        @vue:mounted="clearMessage"
      />
    </Transition>

    <!-- 宠物名称标签 -->
    <div class="pet-info">
      <span class="pet-name">{{ currentPet.name }}</span>
      <span class="ai-status" :class="{ active: isLLMConfigured }">
        {{ isLLMConfigured ? "AI" : "离线" }}
      </span>
      <span v-if="isConnected" class="p2p-status"> P2P </span>
    </div>

    <!-- 聊天历史记录 -->
    <ChatHistory :messages="chatHistory" :pet-name="currentPet.name" />

    <!-- 输入区域 -->
    <ChatInput
      class="input-area"
      :style="{ bottom: keyboardHeight > 0 ? `${keyboardHeight + 12}px` : undefined }"
      @send="handleSendMessage"
      :disabled="isLoading || isAutoReplying"
    />
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
  z-index: 20;
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
  z-index: 10;
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

.p2p-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 8px;
  background: #2196f3;
  color: white;
}

.input-area {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  transition: bottom 0.25s ease-out;
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

  .input-area {
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

  .input-area {
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
</style>
