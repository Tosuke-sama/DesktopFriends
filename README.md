# DesktopFriends - 桌面宠物

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js" alt="Vue 3">
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Capacitor-6.2-119EFF?logo=capacitor" alt="Capacitor">
  <img src="https://img.shields.io/badge/Live2D-PixiJS-FF6B6B" alt="Live2D">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

将旧 Android 手机变成可爱的 Live2D 桌面宠物，接入大模型进行智能对话，支持局域网内多设备宠物互相交流。

## 特性

- **Live2D 渲染** - 流畅的 Live2D 模型展示，支持动作和表情切换
- **AI 智能对话** - 接入 OpenAI/Claude/DeepSeek 等大模型，实现个性化对话
- **FUNCTION CALL调用宠物表情以及动作** - 大模型在进行回复时会调用每个模型存在的表情列表以及动作列表。
- **内心独白系统** - 宠物可以有内心想法，以不同气泡样式展示
- **多宠物管理** - 创建多个宠物角色，自定义名称和人设
- **局域网互联** - 多台设备上的宠物可以互相看到、打招呼、自动聊天
- **模型上传** - 支持上传 zip 格式的 Live2D 模型包
- **背景自定义** - 自定义背景图片或选择预设渐变
- **聊天记录** - 完整的聊天历史记录，支持导出

## 演示
感谢[@碳苯 Carbon](https://github.com/CoderSerio)提供的live2D模型，他真的很可爱！
<img src="./assets/demo.gif" width="300" alt="演示">

## 技术栈

| 模块 | 技术 |
|------|------|
| 移动端框架 | Vue 3 + TypeScript + Vite |
| 原生打包 | Capacitor 6 (Android) |
| Live2D 渲染 | PixiJS 6 + pixi-live2d-display |
| 后端服务 | Fastify + Socket.io |
| 包管理 | pnpm (monorepo) |

## 项目结构

```
DesktopFriends/
├── apps/
│   ├── mobile/                    # 移动端应用
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Live2DCanvas.vue   # Live2D 渲染
│   │   │   │   ├── ChatBubble.vue     # 对话气泡
│   │   │   │   ├── ChatInput.vue      # 文字输入
│   │   │   │   └── ChatHistory.vue    # 聊天历史
│   │   │   ├── composables/
│   │   │   │   ├── useChat.ts         # 大模型对话
│   │   │   │   ├── useP2P.ts          # 局域网通信
│   │   │   │   ├── useSettings.ts     # 设置管理
│   │   │   │   ├── useChatHistory.ts  # 聊天记录
│   │   │   │   ├── useModelUpload.ts  # 模型上传
│   │   │   │   ├── useKeyboard.ts     # 键盘处理
│   │   │   │   ├── useServerDiscovery.ts  # 服务器发现
│   │   │   │   └── useLive2DTools.ts  # Live2D 工具调用
│   │   │   ├── views/
│   │   │   │   ├── HomeView.vue       # 主页面
│   │   │   │   └── SettingsView.vue   # 设置页面
│   │   │   ├── App.vue
│   │   │   └── main.ts
│   │   ├── public/models/             # 内置模型目录
│   │   ├── android/                   # Android 原生项目
│   │   └── capacitor.config.ts
│   │
│   └── server/                    # 中继服务器
│       ├── src/
│       │   ├── index.ts           # 服务入口
│       │   └── socket.ts          # Socket 事件处理
│       └── package.json
│
├── packages/
│   └── shared/                    # 共享类型定义
│       └── src/index.ts
│
├── package.json
└── pnpm-workspace.yaml
```

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8
- Java JDK 17+ (Android 构建必需)
- Android Studio (打包 APK 时需要)

**macOS 安装 Java：**
```bash
brew install openjdk@17
echo 'export JAVA_HOME=$(/usr/libexec/java_home)' >> ~/.zshrc
source ~/.zshrc
```

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 启动移动端开发服务器
pnpm dev:mobile

# 启动中继服务器（用于宠物间通信）
pnpm dev:server
```

访问 http://localhost:5173 查看效果。

### 打包 Android APK

**方式一：使用便捷命令（推荐）**

```bash
# 从根目录运行
pnpm android:sync      # 构建并同步到 Android
pnpm android:open      # 打开 Android Studio
pnpm android:debug     # 构建 Debug APK
pnpm android:release   # 构建 Release APK
```

APK 输出位置：`apps/mobile/android/app/build/outputs/apk/`

**方式二：手动步骤**

```bash
cd apps/mobile

# 构建 Web 资源
pnpm build

# 添加 Android 平台（首次需要）
npx cap add android

# 同步资源到 Android 项目
npx cap sync

# 打开 Android Studio
npx cap open android
```

在 Android Studio 中 Build > Build Bundle(s) / APK(s) > Build APK(s)。

## 功能说明

### AI 对话系统

宠物支持多种对话行为，通过特殊标签控制：

| 标签 | 说明 | 效果 |
|------|------|------|
| `<thinking>...</thinking>` | 内心独白 | 以虚线气泡显示，表示宠物内心想法 |
| `<no-answer></no-answer>` | 不回复 | 宠物认为当前场景不适合回复时使用 |

**内心独白示例：**
```
<thinking>主人今天心情好像不错呢</thinking>早上好呀！
```
先显示内心独白气泡，2秒后切换为正常对话气泡。

### Live2D 工具调用

大模型可以通过 Function Calling 控制 Live2D 模型：

- `playMotion(name)` - 播放指定动作
- `setExpression(name)` - 设置表情

动作和表情列表会动态从模型中提取，并告知大模型可用选项。

### 局域网多宠物通信

```
┌──────────────────────────────────────────────────────────┐
│                      局域网 (LAN)                         │
│                                                          │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐          │
│  │ 手机 A  │◄────►│ 手机 B  │◄────►│ 手机 C  │          │
│  │ (小桌)  │      │ (喵喵)  │      │ (团子)  │          │
│  └────┬────┘      └────┬────┘      └────┬────┘          │
│       │                │                │                │
│       └────────────────┼────────────────┘                │
│                        │                                 │
│              ┌─────────▼─────────┐                       │
│              │   中继服务器       │                       │
│              │ (可运行在任一设备) │                       │
│              └─────────┬─────────┘                       │
└────────────────────────┼─────────────────────────────────┘
                         │
                    ┌────▼────┐
                    │ 云端 LLM │
                    │  API    │
                    └─────────┘
```

**消息类型：**
- 主人对宠物说话 → 广播给所有在线宠物
- 宠物对宠物说话 → 可指定目标或广播
- 智能判断回复 → 根据 `isDirectTarget` 标志决定是否回复

### 模型上传

支持上传 zip 格式的 Live2D 模型包：

1. 在设置页面的"宠物"卡片中找到"Live2D 模型"区域
2. 点击"上传模型 (zip)"按钮
3. 选择包含 `.model.json` 或 `.model3.json` 的 zip 文件
4. 等待上传完成，模型自动应用到当前宠物

已上传的模型保存在设备本地，可在列表中切换或删除。

## 配置说明

### 大模型 API 配置

在设置页面配置，或通过代码：

```typescript
const { sendMessage, setConfig } = useChat()

// 配置 OpenAI
setConfig({
  provider: 'openai',
  apiKey: 'sk-xxx',
  model: 'gpt-4o-mini', // 可选
})

// 配置 Claude
setConfig({
  provider: 'claude',
  apiKey: 'sk-ant-xxx',
  model: 'claude-3-haiku-20240307',
})

// 配置 DeepSeek
setConfig({
  provider: 'deepseek',
  apiKey: 'sk-xxx',
})

// 配置自定义 API（兼容 OpenAI 格式）
setConfig({
  provider: 'custom',
  apiKey: 'your-key',
  baseUrl: 'https://your-api.com/v1/chat/completions',
})
```

### 自定义宠物人设

在设置中配置宠物的 Prompt，使用 `{petName}` 作为宠物名称占位符：

```
你是一个可爱的桌面宠物，名叫{petName}。
你性格活泼、善良、有点傲娇。
喜欢撒娇，偶尔会吐槽主人。
回复要简洁可爱，通常不超过50字。
```

### 中继服务器配置

默认监听 `0.0.0.0:3000`，可通过环境变量修改：

```bash
PORT=8080 HOST=0.0.0.0 pnpm dev:server
```

## 功能状态

### 已实现

- [x] 项目基础架构搭建 (monorepo)
- [x] Vue 3 + TypeScript 移动端框架
- [x] Capacitor Android 配置
- [x] Live2D 渲染组件 (pixi-live2d-display)
- [x] 对话 UI 组件 (输入框、气泡、历史记录)
- [x] 大模型对话模块 (支持 OpenAI/Claude/DeepSeek/自定义)
- [x] Live2D 工具调用 (动作/表情切换)
- [x] 内心独白系统 (`<thinking>` 标签)
- [x] 智能不回复 (`<no-answer>` 标签)
- [x] Socket.io 中继服务器
- [x] 局域网通信 (useP2P)
- [x] 多宠物管理 (创建/删除/复制/切换)
- [x] 局域网服务器扫描发现
- [x] Live2D 模型上传 (zip 解压)
- [x] 聊天记录存储与导出 (JSON/文本)
- [x] 背景自定义 (图片上传/预设渐变)
- [x] Material Design UI 组件库
- [x] 移动端键盘适配
- [x] 页面切换动画 (滑动过渡)

### 开发中

- [ ] Android 后台保活 (Foreground Service)
- [ ] Live2D 触摸交互
- [ ] 低功耗模式

### 未来计划

- [ ] **中继服务器 LLM 调度器** - 由服务器端大模型决定下一个发言的宠物，实现更自然的多宠物对话流
- [ ] iOS 支持
- [ ] 桌面端支持 (Electron)
- [ ] 语音合成 (TTS)
- [ ] 语音识别 (ASR)
- [ ] 宠物记忆系统 (长期记忆)

## 注意事项

1. **Live2D 模型版权**：请使用开源/免费模型或自行制作，注意版权问题
2. **API Key 安全**：生产环境建议通过中继服务器转发 API 请求，避免在客户端暴露 Key
3. **Android 后台限制**：旧版 Android 可能需要额外配置才能保持后台运行
4. **网络环境**：多设备通信需要在同一局域网内

## 贡献

欢迎提交 Issue 和 Pull Request！

## License

MIT
