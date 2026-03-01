# DesktopFriends / TableFri - 桌面宠物

> [English](./README.md)

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js" alt="Vue 3">
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tauri-1.6-24C8DB?logo=tauri" alt="Tauri">
  <img src="https://img.shields.io/badge/Capacitor-6.2-119EFF?logo=capacitor" alt="Capacitor">
  <img src="https://img.shields.io/badge/Live2D-PixiJS-FF6B6B" alt="Live2D">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

跨平台 AI Live2D 桌面宠物应用。支持 **桌面端 (macOS)** 和 **移动端 (Android)**，接入大模型进行智能对话，支持局域网内多设备宠物互相交流。

## 演示

感谢[@碳苯 Carbon](https://github.com/CoderSerio)提供的 Live2D 模型，他真的很可爱！

  ![演示](./assets/ezgif-544a92538432332a.gif)

## 特性

### AI Agent 系统
- **自研 PetAgent** - 手搓的 Agent 引擎，使用原生 fetch 调用 LLM API，实现完整的 ReAct 工具调用循环（最多 5 轮迭代）
- **多 LLM 支持** - 兼容 OpenAI / Claude / DeepSeek / 自定义 API（OpenAI 兼容格式）
- **认知系统** - `innerThought`（内心独白）以不同气泡样式展示 + `shouldReply`（选择性回复）机制
- **表情状态追踪** - 自动追踪当前表情状态，30 秒超时自动提醒重置

### Live2D 模型分析器
- **规则模式** - 预定义情绪映射表，快速解析模型的动作/表情
- **LLM 增强模式** - 调用大模型分析每个动作的含义、情绪分类和使用场景
- **情绪→动作映射** - 多级推断策略（精确匹配 → 关键词匹配 → 模糊匹配 → 默认动作）

### 小组件系统
- **桌面小组件** - 时钟 / 相册 / 天气 / 待办事项
- **Agent 可操控** - AI Agent 可通过工具调用查看/添加/完成待办事项
- **自定义布局** - 支持拖拽和调整大小

### 通用功能
- **Live2D 渲染** - 流畅的 Live2D 模型展示，支持动作和表情切换
- **AI 智能对话** - 接入 OpenAI/Claude/DeepSeek 等大模型，实现个性化对话
- **Function Call 工具调用** - 大模型通过 Function Calling 控制宠物的表情和动作
- **多宠物管理** - 创建多个宠物角色，自定义名称和人设
- **局域网互联** - 多台设备上的宠物可以互相看到、打招呼、自动聊天
- **模型上传** - 支持上传 zip 格式的 Live2D 模型包
- **背景自定义** - 自定义背景图片或选择预设渐变
- **聊天记录** - 完整的聊天历史记录，支持导出

### 桌面端特有 (macOS)
- **透明窗口** - 无边框透明窗口，宠物悬浮在桌面上
- **点击穿透** - 鼠标不在 Live2D 模型区域时自动穿透点击到下层窗口
- **锁定模式** - 一键锁定，禁用点击穿透并始终显示 UI
- **窗口控制** - 自定义标题栏，支持最小化、最大化、关闭
- **插件系统** - Manifest 驱动的外部插件扩展，支持自定义工具注入

### 移动端特有 (Android)
- **键盘适配** - 智能调整输入框位置，避免被键盘遮挡
- **屏幕方向** - 支持横屏和竖屏模式，自动调整 Live2D 位置

### 硬件集成
- **小智硬件对接** - 支持小智硬件设备（Opus 编解码、OTA 更新）

## 技术栈

| 模块 | 技术 |
|------|------|
| 前端框架 | Vue 3.5 + TypeScript 5.6 + Vite |
| 桌面端打包 | Tauri 1.6 (macOS) |
| 移动端打包 | Capacitor 6 (Android) |
| Live2D 渲染 | PixiJS 6 + pixi-live2d-display |
| AI Agent | 自研 ReAct 引擎 + 原生 fetch |
| 后端服务 | Fastify + Socket.io |
| 包管理 | pnpm (monorepo) |

## 项目结构

```
DesktopFriends/
├── apps/
│   ├── desktop/                  # 桌面端应用 (Tauri)
│   ├── mobile/                   # 移动端应用 (Capacitor)
│   └── server/                   # 中继服务器
│
├── packages/
│   ├── core/                     # 核心业务逻辑
│   │   └── src/
│   │       ├── agent/            # AI Agent 系统
│   │       │   ├── PetAgent.ts       # ReAct 循环引擎
│   │       │   ├── memory.ts         # 对话记忆管理
│   │       │   └── prompts.ts        # 动态提示词生成
│   │       ├── tools/            # Agent 工具集
│   │       │   ├── live2d.tools.ts       # 动作/表情控制
│   │       │   ├── cognitive.tools.ts    # 思考/决策
│   │       │   ├── widget.tools.ts       # 小组件交互
│   │       │   ├── communication.tools.ts # 多宠物通信
│   │       │   ├── plugin.tools.ts       # 插件适配
│   │       │   └── modelAnalyzer.ts      # 模型分析器
│   │       └── composables/      # Vue Composables
│   │           ├── useChat.ts
│   │           ├── useSettings.ts
│   │           ├── useP2P.ts
│   │           ├── useChatHistory.ts
│   │           └── ...
│   │
│   ├── ui/                       # 共享 UI 组件
│   ├── platform/                 # 平台适配层
│   └── shared/                   # 共享类型定义
│
├── package.json
└── pnpm-workspace.yaml
```

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8
- Rust (桌面端构建必需)
- Java JDK 17+ (Android 构建必需)
- Android Studio (打包 APK 时需要)

**macOS 安装 Java：**
```bash
brew install openjdk@17
echo 'export JAVA_HOME=$(/usr/libexec/java_home)' >> ~/.zshrc
source ~/.zshrc
```

**安装 Rust (桌面端)：**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 启动桌面端开发服务器 (macOS)
pnpm dev:desktop

# 启动移动端开发服务器
pnpm dev:mobile

# 启动中继服务器（用于宠物间通信）
pnpm dev:server
```

移动端访问 http://localhost:5173 查看效果。

### 打包桌面端应用 (macOS)

```bash
cd apps/desktop

# 开发模式运行
pnpm tauri:dev

# 构建发布版本
pnpm tauri:build
```

应用输出位置：`apps/desktop/src-tauri/target/release/bundle/`

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

## 架构

### Agent 系统架构

```
┌─────────────────────────────────────────────────┐
│                  PetAgent                       │
│            (ReAct Loop Engine)                  │
│                                                 │
│  用户消息 → LLM API (原生 fetch)               │
│      ↓                                          │
│  解析工具调用 → 执行工具 → 收集结果             │
│      ↓                                          │
│  添加工具结果 → 再次调用 LLM                   │
│      ↓                                          │
│  无工具调用或达到上限(5轮) → 返回最终回复      │
├─────────────────────────────────────────────────┤
│  工具集                                         │
│  ├── Live2D Tools (playMotion, setExpression)   │
│  ├── Cognitive Tools (innerThought, shouldReply)│
│  ├── Widget Tools (getTodos, addTodo, ...)      │
│  ├── Communication Tools (sendToPet, broadcast) │
│  └── Plugin Tools (外部插件扩展)               │
├─────────────────────────────────────────────────┤
│  Memory (消息记忆 + localStorage 持久化)        │
└─────────────────────────────────────────────────┘
```

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

## 功能状态

### 已实现

- [x] 项目基础架构搭建 (monorepo)
- [x] Vue 3 + TypeScript 前端框架
- [x] 共享包架构 (core/ui/platform/shared)
- [x] **AI Agent 系统**
  - [x] 自研 ReAct 循环引擎 (PetAgent)
  - [x] 多 LLM 支持 (OpenAI/Claude/DeepSeek/自定义)
  - [x] Live2D 模型分析器（规则模式 + LLM 增强模式）
  - [x] 认知工具 (innerThought + shouldReply)
  - [x] 小组件工具 (待办事项管理等)
  - [x] 多宠物通信工具
  - [x] 插件工具适配层
  - [x] 表情状态追踪（30 秒超时重置）
- [x] **桌面端应用 (Tauri - macOS)**
  - [x] 透明无边框窗口
  - [x] 点击穿透功能
  - [x] 锁定模式
  - [x] 自定义窗口控制
  - [x] Live2D 模型上传
  - [x] 插件系统 (Manifest 驱动)
- [x] **移动端应用 (Capacitor - Android)**
  - [x] 键盘适配
  - [x] 屏幕方向支持
  - [x] Live2D 模型上传
- [x] **小组件系统**
  - [x] 时钟小组件
  - [x] 相册小组件
  - [x] 天气小组件
  - [x] 待办事项小组件
- [x] Live2D 渲染组件 (pixi-live2d-display)
- [x] 对话 UI 组件 (输入框、气泡、历史记录)
- [x] Live2D 工具调用 (动作/表情切换)
- [x] 内心独白系统 (`<thinking>` 标签)
- [x] 智能不回复 (`<no-answer>` 标签)
- [x] Socket.io 中继服务器
- [x] 局域网通信 (useP2P)
- [x] 多宠物管理 (创建/删除/复制/切换)
- [x] 局域网服务器扫描发现
- [x] 聊天记录存储与导出 (JSON/文本)
- [x] 背景自定义 (图片上传/预设渐变)
- [x] Material Design UI 组件库
- [x] 小智硬件集成 (Opus 编解码、OTA)

### 开发中

- [ ] Android 后台保活 (Foreground Service)
- [ ] Live2D 触摸交互
- [ ] 低功耗模式

### 未来计划

- [ ] **中继服务器 LLM 调度器** - 由服务器端大模型决定下一个发言的宠物
- [ ] iOS 支持
- [ ] Windows/Linux 桌面端支持
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
