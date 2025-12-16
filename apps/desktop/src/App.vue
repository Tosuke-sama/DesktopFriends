<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import {
  Live2DCanvas,
  ChatInput,
  ChatBubble,
  ChatHistory,
} from "@desktopfriends/ui";
import {
  useSettings,
  useChat,
  useChatHistory,
  generateToolUsagePrompt,
  useP2P,
} from "@desktopfriends/core";
import { isDesktopPlatform } from "@desktopfriends/platform";
import type { PetMessage, PetInfo } from "@desktopfriends/shared";
import { appWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/tauri";
import WindowControls from "./components/WindowControls.vue";
import SettingsView from "./views/SettingsView.vue";

const { currentPet, backgroundStyle, settings, live2dTransform } =
  useSettings();
const chat = useChat();
const { chatHistory, addUserMessage, addPetMessage, addOtherPetMessage } =
  useChatHistory();

const live2dRef = ref<InstanceType<typeof Live2DCanvas> | null>(null);

// 桌面端判断 - 桌面应用默认显示窗口控制
const isDesktop = ref(true);

// 当前视图
const currentView = ref<"home" | "settings">("home");

// 鼠标悬停状态 - 悬浮在 Live2D 区域时显示所有 UI
const isHoveringLive2D = ref(false);
const isLocked = ref(false); // 锁定模式，始终显示 UI 且禁用穿透

// 鼠标位置检测定时器
let mouseCheckInterval: ReturnType<typeof setInterval> | null = null;

// 鼠标位置响应类型
interface CursorPosition {
  x: number;
  y: number;
  in_window: boolean;
}

// 启动鼠标位置检测（用于点击穿透模式下检测鼠标是否在 Live2D 区域）
const startMousePositionCheck = () => {
  if (mouseCheckInterval || !isDesktop.value) return;

  mouseCheckInterval = setInterval(async () => {
    if (isLocked.value) return; // 锁定模式下不需要检测

    try {
      // 调用 Rust 命令获取鼠标位置
      const cursor = await invoke<CursorPosition>("get_cursor_position");

      // 如果鼠标不在窗口内，启用穿透并隐藏 UI
      if (!cursor.in_window) {
        if (isHoveringLive2D.value) {
          isHoveringLive2D.value = false;
          await appWindow.setIgnoreCursorEvents(true);
        }
        return;
      }

      // 鼠标在窗口内
      // 如果已经激活了 UI（之前进入过模型区域），保持显示状态
      if (isHoveringLive2D.value) {
        return;
      }

      // 从 Live2D 组件获取模型的实际边界
      const bounds = live2dRef.value?.getModelBounds();

      // 如果模型还没加载，跳过
      if (!bounds) {
        return;
      }
      console.log("Cursor position:", cursor, "Model bounds:", bounds);

      // 判断鼠标是否在 Live2D 模型区域内
      const isInLive2DArea =
        cursor.x >= bounds.left &&
        cursor.x <= bounds.right &&
        cursor.y >= bounds.top &&
        cursor.y <= bounds.bottom;

      // 只有进入模型区域时才激活 UI，不会因为离开模型而关闭
      if (isInLive2DArea && !isHoveringLive2D.value) {
        isHoveringLive2D.value = true;
        await appWindow.setIgnoreCursorEvents(false);
      }
    } catch (e) {
      // 静默处理错误，避免日志刷屏
    }
  }, 50); // 每 50ms 检查一次
};

const stopMousePositionCheck = () => {
  if (mouseCheckInterval) {
    clearInterval(mouseCheckInterval);
    mouseCheckInterval = null;
  }
};

// DOM 事件处理（仅非桌面端使用，桌面端使用轮询检测）
const onLive2DEnter = async () => {
  // 桌面端使用轮询检测，跳过 DOM 事件
  if (isDesktop.value) return;

  isHoveringLive2D.value = true;
};

const onLive2DLeave = async () => {
  // 桌面端使用轮询检测，跳过 DOM 事件
  if (isDesktop.value) return;

  isHoveringLive2D.value = false;
  // 关闭所有面板
  showTestPanel.value = false;
  showAdjustPanel.value = false;
  showPetsPanel.value = false;
};

// 切换锁定模式（始终显示 UI 且禁用穿透）
const toggleLocked = async () => {
  isLocked.value = !isLocked.value;
  if (isDesktop.value) {
    try {
      // 锁定时禁用穿透，解锁且不在 Live2D 上时启用穿透
      await appWindow.setIgnoreCursorEvents(
        !isLocked.value && !isHoveringLive2D.value
      );
    } catch (e) {
      console.error("Failed to toggle cursor ignore:", e);
    }
  }
};

// 是否显示悬停 UI
const showHoverUI = computed(() => isHoveringLive2D.value || isLocked.value);

// 面板显示状态
const showTestPanel = ref(false);
const showAdjustPanel = ref(false);
const showPetsPanel = ref(false);

// 获取模型可用的动作和表情
const motionDetails = computed(() => live2dRef.value?.motionDetails || []);
const availableExpressions = computed(
  () => live2dRef.value?.availableExpressions || []
);

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

// 是否已配置大模型
const isLLMConfigured = computed(() => !!settings.value.llmApiKey);

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

// 当前显示的气泡消息
const currentBubble = ref<{ message: string; speaker: string | null } | null>(
  null
);
let bubbleTimeout: ReturnType<typeof setTimeout> | null = null;

// 显示气泡
const showBubble = (message: string, speaker: string | null) => {
  if (!settings.value.showBubble) return;

  currentBubble.value = { message, speaker };

  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout);
  }

  bubbleTimeout = setTimeout(() => {
    currentBubble.value = null;
  }, settings.value.bubbleDuration);
};

// 处理工具调用
const handleToolCalls = (
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>
) => {
  for (const tool of toolCalls) {
    if (tool.name === "playMotion") {
      const name = tool.arguments.name as string;
      const motionInfo = motionDetails.value.find((m) => m.name === name);
      if (motionInfo) {
        live2dRef.value?.playMotionByIndex(motionInfo.group, motionInfo.index);
      } else {
        live2dRef.value?.playMotion(name);
      }
      // 同步动作给其他宠物
      if (isConnected.value && isRegistered.value) {
        sendAction("motion", name);
      }
    } else if (tool.name === "setExpression") {
      const name = tool.arguments.name as string;
      live2dRef.value?.setExpression(name);
      // 同步表情给其他宠物
      if (isConnected.value && isRegistered.value) {
        sendAction("expression", name);
      }
    }
  }
};

// 发送消息
const handleSend = async (message: string) => {
  if (!message.trim() || chat.isLoading.value) return;

  // 显示用户消息气泡
  showBubble(message, null);
  addUserMessage("主人", `对 ${currentPet.value.name} 说: ${message}`);

  // 如果已连接服务器，广播用户消息给其他宠物
  if (isConnected.value && isRegistered.value) {
    sendP2PMessage(message, undefined, {
      messageType: "master_to_pet",
      toName: currentPet.value.name,
    });
  }

  try {
    // 获取当前可用的动作和表情
    const motions = motionDetails.value.map((m) => m.name);
    const expressions = availableExpressions.value;

    // 生成工具提示
    const toolPrompt = generateToolUsagePrompt(motions, expressions);
    const fullPrompt = `${currentPet.value.prompt}\n\n${toolPrompt}`;

    // 设置配置
    chat.setCustomPrompt(fullPrompt);
    chat.setAvailableActions(motions, expressions);
    chat.setConfig({
      provider: settings.value.llmProvider,
      apiKey: settings.value.llmApiKey,
      baseUrl: settings.value.llmBaseUrl,
      model: settings.value.llmModel,
    });

    const response = await chat.sendMessage(message);

    // 处理工具调用
    if (response.toolCalls && response.toolCalls.length > 0) {
      handleToolCalls(response.toolCalls);
    }

    // 显示回复
    if (response.content) {
      showBubble(response.content, currentPet.value.name);
      addPetMessage(currentPet.value.name, response.content);
    }
  } catch (error) {
    console.error("Chat error:", error);
    const errorMsg = "抱歉，出了点问题...";
    showBubble(errorMsg, currentPet.value.name);
    addPetMessage(currentPet.value.name, errorMsg);
  }
};

// 处理其他宠物的消息
async function handlePetMessage(message: PetMessage) {
  console.log("Received pet message:", message);

  if (message.from === currentPet.value.name) {
    return;
  }

  let displayContent = message.content;
  if (!message.isDirectTarget) {
    if (message.messageType === "master_to_pet") {
      displayContent = `[主人] 对 [${message.toName || message.from}] 说: ${
        message.content
      }`;
    } else if (message.messageType === "pet_to_pet") {
      displayContent = `[${message.from}] 对 [${message.toName}] 说: ${message.content}`;
    }
  }

  addOtherPetMessage(message.from, displayContent);
}

// 处理新宠物上线
function handlePetOnline(pet: PetInfo) {
  if (autoChat.value) {
    live2dRef.value?.playMotion("Flick");
    const welcomeMsg = `${pet.name} 来了~`;
    showBubble(welcomeMsg, null);
  }
}

// 主动打招呼
const sayHelloTo = (pet: PetInfo) => {
  if (!isConnected.value || !isRegistered.value) return;

  const greetings = [
    `${pet.name}，你好呀~`,
    `嘿，${pet.name}！`,
    `${pet.name}，在干嘛呢？`,
  ];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  addPetMessage(currentPet.value.name, `对 [${pet.name}] 说: ${greeting}`);
  sendP2PMessage(greeting, pet.id, {
    messageType: "pet_to_pet",
    toName: pet.name,
  });

  showBubble(greeting, null);
  live2dRef.value?.playMotion("Flick");
};

// 切换面板
const toggleTestPanel = () => {
  showTestPanel.value = !showTestPanel.value;
  if (showTestPanel.value) {
    showAdjustPanel.value = false;
    showPetsPanel.value = false;
  }
};

const toggleAdjustPanel = () => {
  showAdjustPanel.value = !showAdjustPanel.value;
  if (showAdjustPanel.value) {
    showTestPanel.value = false;
    showPetsPanel.value = false;
  }
};

const togglePetsPanel = () => {
  showPetsPanel.value = !showPetsPanel.value;
  if (showPetsPanel.value) {
    showTestPanel.value = false;
    showAdjustPanel.value = false;
  }
};

// 打开设置页面
const openSettings = async () => {
  showTestPanel.value = false;
  showAdjustPanel.value = false;
  showPetsPanel.value = false;
  currentView.value = "settings";

  // 桌面端：进入设置页时停止鼠标检测并禁用点击穿透
  if (isDesktop.value) {
    stopMousePositionCheck();
    try {
      await appWindow.setIgnoreCursorEvents(false);
    } catch (e) {
      console.error("Failed to disable cursor ignore:", e);
    }
  }
};

// 返回主页
const backToHome = async () => {
  currentView.value = "home";

  // 桌面端：返回主页时重新启动鼠标检测并启用点击穿透
  if (isDesktop.value) {
    isHoveringLive2D.value = false;
    try {
      await appWindow.setIgnoreCursorEvents(true);
    } catch (e) {
      console.error("Failed to enable cursor ignore:", e);
    }
    startMousePositionCheck();
  }
};

// 测试动作
const testMotionByIndex = (group: string, index: number) => {
  live2dRef.value?.playMotionByIndex(group, index);
};

// 测试表情
const testExpression = (name: string) => {
  live2dRef.value?.setExpression(name);
};

// 重置变换
const resetTransform = () => {
  live2dTransform.value = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };
};

// 监听设置变化，自动连接服务器
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

onMounted(async () => {
  isDesktop.value = isDesktopPlatform();
  console.log("TableFri Desktop started");
  console.log("Platform detection:", {
    isDesktop: isDesktop.value,
    hasTauri: "__TAURI__" in window,
  });

  // 桌面端默认启用点击穿透，并启动鼠标位置检测
  if (isDesktop.value) {
    try {
      await appWindow.setIgnoreCursorEvents(true);
      // 启动鼠标位置轮询检测（即使窗口忽略鼠标事件也能检测）
      startMousePositionCheck();
    } catch (e) {
      console.error("Failed to enable initial cursor ignore:", e);
    }
  }
});

onUnmounted(() => {
  stopMousePositionCheck();
});
</script>

<template>
  <div class="app-container" :style="backgroundStyle">
    <!-- 桌面端窗口控制 -->
    <Transition name="fade">
      <WindowControls
        v-if="isDesktop && currentView !== 'settings'"
        v-show="showHoverUI"
        :is-locked="isLocked"
        @toggle-lock="toggleLocked"
      />
    </Transition>

    <!-- 设置页面 -->
    <SettingsView
      v-if="currentView === 'settings'"
      @back="backToHome"
    />

    <!-- 主页内容 -->
    <template v-else>
      <!-- 设置按钮 -->
      <Transition name="fade">
        <button v-show="showHoverUI" class="settings-btn" @click="openSettings">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
            />
          </svg>
        </button>
      </Transition>

      <!-- 调整按钮 -->
      <Transition name="fade">
        <button
          v-show="showHoverUI"
          class="adjust-btn"
          @click="toggleAdjustPanel"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"
            />
          </svg>
        </button>
      </Transition>

      <!-- 测试按钮 -->
      <Transition name="fade">
        <button v-show="showHoverUI" class="test-btn" @click="toggleTestPanel">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3h7zM7 9H4V5h3v4zm10 6h3v4h-3v-4zm0-10v4h3V5h-3z"
            />
          </svg>
        </button>
      </Transition>

      <!-- 在线宠物按钮 -->
      <Transition name="fade">
        <button
          v-show="showHoverUI"
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
      </Transition>

      <!-- 测试面板 -->
      <Transition name="panel">
        <div v-if="showTestPanel" class="test-panel">
          <div class="panel-title">动作测试</div>

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

          <div
            v-if="
              Object.keys(motionsByGroup).length === 0 &&
              availableExpressions.length === 0
            "
            class="no-motions"
          >
            <p>暂无可用动作</p>
            <p class="hint">请先配置 Live2D 模型</p>
          </div>
        </div>
      </Transition>

      <!-- 调整面板 -->
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
            <div class="online-stats">
              共 {{ onlinePets.length }} 只宠物在线
            </div>
          </template>

          <div class="auto-chat-toggle">
            <label class="toggle-label">
              <input type="checkbox" v-model="autoChat" />
              <span class="toggle-text">自动对话</span>
            </label>
          </div>
        </div>
      </Transition>

      <!-- Live2D 画布 -->
      <div
        class="live2d-area"
        @mouseenter="onLive2DEnter"
        @mouseleave="onLive2DLeave"
      >
        <Live2DCanvas ref="live2dRef" />
      </div>

      <!-- 聊天气泡 -->
      <Transition name="bubble">
        <div
          v-if="currentBubble || chat.isLoading.value"
          class="bubble-container"
        >
          <ChatBubble
            :message="currentBubble?.message || ''"
            :speaker="currentBubble?.speaker"
            :is-thinking="chat.isLoading.value"
          />
        </div>
      </Transition>

      <!-- 宠物信息标签 -->
      <div class="pet-info">
        <span class="pet-name">{{ currentPet.name }}</span>
        <span class="ai-status" :class="{ active: isLLMConfigured }">
          {{ isLLMConfigured ? "AI" : "离线" }}
        </span>
        <span v-if="isConnected" class="p2p-status">P2P</span>
      </div>

      <!-- 聊天历史记录 -->
      <Transition name="fade">
        <ChatHistory
          v-show="showHoverUI"
          :messages="chatHistory"
          :pet-name="currentPet.name"
        />
      </Transition>

      <!-- 输入框 -->
      <Transition name="fade">
        <div v-show="showHoverUI" class="input-area">
          <ChatInput
            @send="handleSend"
            :disabled="chat.isLoading.value"
            placeholder="和宠物说点什么..."
          />
        </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  background-size: cover;
  background-position: center;
}

.live2d-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* 功能按钮基础样式 */
.settings-btn,
.adjust-btn,
.test-btn,
.pets-btn {
  position: absolute;
  width: 36px;
  height: 36px;
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

.settings-btn:hover,
.adjust-btn:hover,
.test-btn:hover,
.pets-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.settings-btn:active,
.adjust-btn:active,
.test-btn:active,
.pets-btn:active {
  transform: scale(0.95);
}

.settings-btn svg,
.adjust-btn svg,
.test-btn svg,
.pets-btn svg {
  width: 20px;
  height: 20px;
  color: white;
}

.settings-btn {
  top: 44px;
  right: 12px;
}

.settings-btn:hover {
  transform: rotate(30deg);
}

.adjust-btn {
  top: 44px;
  right: 56px;
}

.test-btn {
  top: 44px;
  left: 12px;
}

.pets-btn {
  top: 44px;
  left: 56px;
}

.pets-btn.connected {
  background: rgba(76, 175, 80, 0.3);
}

.pets-btn.connected:hover {
  background: rgba(76, 175, 80, 0.4);
}

.pet-count {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ff5722;
  color: white;
  font-size: 10px;
  font-weight: 600;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 面板样式 */
.test-panel,
.adjust-panel,
.pets-panel {
  position: absolute;
  top: 88px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 12px;
  z-index: 20;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  min-width: 200px;
  max-width: 280px;
  max-height: 420px;
  overflow-y: auto;
}

.test-panel,
.pets-panel {
  left: 12px;
}

.adjust-panel {
  right: 12px;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 设置面板样式 */
.settings-section {
  margin-bottom: 14px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-label {
  font-size: 10px;
  color: #888;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.input-group {
  margin-bottom: 10px;
}

.input-group label {
  display: block;
  font-size: 11px;
  color: #666;
  margin-bottom: 4px;
}

.input-group input[type="text"],
.input-group input[type="password"] {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 12px;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.input-group input:focus {
  outline: none;
  border-color: #667eea;
}

.toggle-group {
  margin-top: 8px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  color: #333;
}

.toggle-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #667eea;
}

/* 动作按钮 */
.motion-section {
  margin-bottom: 10px;
}

.motion-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.motion-btn {
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.motion-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
}

.motion-btn.expression {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.no-motions,
.no-connection,
.no-pets {
  text-align: center;
  padding: 12px 0;
  color: #666;
  font-size: 12px;
}

.hint {
  font-size: 11px;
  color: #999;
  margin-top: 4px;
}

/* 滑块样式 */
.slider-group {
  margin-bottom: 14px;
}

.slider-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #333;
  margin-bottom: 6px;
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
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(102, 126, 234, 0.4);
}

.reset-btn {
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: 6px;
  background: #f5f5f5;
  color: #666;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reset-btn:hover {
  background: #eeeeee;
  color: #333;
}

/* 在线宠物面板 */
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

.my-pet-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: linear-gradient(
    135deg,
    rgba(102, 126, 234, 0.1) 0%,
    rgba(118, 75, 162, 0.1) 100%
  );
  border-radius: 8px;
  margin-bottom: 10px;
  border: 1px solid rgba(102, 126, 234, 0.2);
}

.pet-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 13px;
}

.pet-avatar.me {
  background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
}

.pet-details {
  display: flex;
  flex-direction: column;
}

.pet-details .pet-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.pet-hint {
  font-size: 10px;
  color: #999;
}

.me-tag {
  color: #4caf50;
  font-weight: 500;
}

.pet-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pet-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: #f5f5f5;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pet-item:hover {
  background: #eeeeee;
  transform: translateX(4px);
}

.online-stats {
  text-align: center;
  font-size: 11px;
  color: #666;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #eee;
}

.auto-chat-toggle {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #eee;
}

.toggle-text {
  font-size: 12px;
  color: #333;
}

/* 气泡 */
.bubble-container {
  position: absolute;
  top: 90px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 80%;
  z-index: 10;
}

/* 宠物信息 */
.pet-info {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  padding: 6px 12px;
  border-radius: 16px;
}

.pet-info .pet-name {
  color: white;
  font-size: 13px;
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

/* 输入框 */
.input-area {
  position: absolute;
  bottom: 20px;
  left: 20px;
  right: 20px;
  z-index: 10;
}

/* 面板动画 */
.panel-enter-active,
.panel-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

/* 气泡动画 */
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

/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
