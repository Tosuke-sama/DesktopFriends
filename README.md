# DesktopFriends / TableFri

> [中文](./README_zh.md)

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js" alt="Vue 3">
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tauri-1.6-24C8DB?logo=tauri" alt="Tauri">
  <img src="https://img.shields.io/badge/Capacitor-6.2-119EFF?logo=capacitor" alt="Capacitor">
  <img src="https://img.shields.io/badge/Live2D-PixiJS-FF6B6B" alt="Live2D">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

A cross-platform AI-powered Live2D desktop pet. Runs on **desktop (macOS)** and **mobile (Android)**, with LLM-driven conversations, an agentic tool-calling system, and multi-device pet networking over LAN.

Turn your old phone into an AI companion that lives on your desk.

## Demo

Thanks to [@Carbon](https://github.com/CoderSerio) for the Live2D model — it's adorable!

  ![Demo](./assets/ezgif-544a92538432332a.gif)

## Features

### AI Agent System
- **Custom PetAgent Engine** — A from-scratch ReAct agent that calls LLM APIs via native `fetch`, executes tool calls, and loops up to 5 iterations to resolve complex requests
- **Multi-LLM Support** — Works with OpenAI, Claude, DeepSeek, and any OpenAI-compatible API
- **Cognitive System** — `innerThought` for internal monologue (shown as a distinct bubble style) + `shouldReply` for selective response (the pet can choose not to reply)
- **Expression State Tracking** — Automatically tracks the current facial expression and prompts reset after 30 seconds

### Live2D Model Analyzer
- **Rule-based Mode** — Pre-defined emotion mapping table for fast motion/expression parsing
- **LLM-enhanced Mode** — Uses the LLM to analyze each motion's meaning, emotion category, and usage scenario
- **Emotion-to-Motion Mapping** — Multi-level inference (exact match → keyword match → fuzzy match → default)

### Widget System
- **Desktop Widgets** — Clock, Photo Album, Weather, and Todo List
- **Agent-controllable** — The AI agent can view, add, and complete todo items through tool calls
- **Customizable Layout** — Drag-and-drop positioning and resizing

### Live2D & Interaction
- **Live2D Rendering** — Smooth Live2D model display with motion and expression switching
- **Function Calling** — The LLM controls pet expressions and motions via `playMotion` / `setExpression` tool calls
- **Multi-pet Management** — Create multiple pet characters with custom names and personalities
- **Model Upload** — Upload zip-packaged Live2D models; auto-detected and applied
- **Custom Backgrounds** — Upload images or pick from preset gradients

### Multi-device Networking
- **LAN Communication** — Pets on different devices can see each other, greet, and chat automatically
- **Relay Server** — Lightweight Fastify + Socket.io server (can run on any device in the network)
- **Smart Reply** — Pets decide whether to respond based on `isDirectTarget` flag

### Desktop-only (macOS)
- **Transparent Window** — Frameless transparent window; the pet floats on your desktop
- **Click-through** — Mouse clicks pass through to windows below when not on the model
- **Lock Mode** — One-click lock to disable click-through and keep UI visible
- **Plugin System** — Manifest-driven external plugin extensions with custom tool injection

### Mobile-only (Android)
- **Keyboard Handling** — Smart input positioning to avoid keyboard occlusion
- **Orientation Support** — Portrait and landscape modes with automatic Live2D repositioning

### Hardware Integration
- **XiaoZhi Device Support** — Integration with XiaoZhi hardware (Opus codec, OTA updates)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3.5 + TypeScript 5.6 + Vite |
| Desktop | Tauri 1.6 (macOS) |
| Mobile | Capacitor 6 (Android) |
| Live2D | PixiJS 6 + pixi-live2d-display |
| AI Agent | Custom ReAct engine + native fetch |
| Backend | Fastify + Socket.io |
| Monorepo | pnpm workspaces |

## Project Structure

```
DesktopFriends/
├── apps/
│   ├── desktop/                  # Desktop app (Tauri)
│   ├── mobile/                   # Mobile app (Capacitor)
│   └── server/                   # Relay server
│
├── packages/
│   ├── core/                     # Core business logic
│   │   └── src/
│   │       ├── agent/            # AI Agent system
│   │       │   ├── PetAgent.ts       # ReAct loop engine
│   │       │   ├── memory.ts         # Conversation memory
│   │       │   └── prompts.ts        # Dynamic prompt generation
│   │       ├── tools/            # Agent tool set
│   │       │   ├── live2d.tools.ts       # Motion / expression control
│   │       │   ├── cognitive.tools.ts    # Thinking / decision
│   │       │   ├── widget.tools.ts       # Widget interaction
│   │       │   ├── communication.tools.ts # Multi-pet messaging
│   │       │   ├── plugin.tools.ts       # Plugin adapter
│   │       │   └── modelAnalyzer.ts      # Model analyzer
│   │       └── composables/      # Vue Composables
│   │           ├── useChat.ts
│   │           ├── useSettings.ts
│   │           ├── useP2P.ts
│   │           └── ...
│   │
│   ├── ui/                       # Shared UI components
│   ├── platform/                 # Platform abstraction layer
│   └── shared/                   # Shared type definitions
│
├── package.json
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Rust (required for desktop builds)
- Java JDK 17+ (required for Android builds)
- Android Studio (for building APKs)

**Install Java on macOS:**
```bash
brew install openjdk@17
echo 'export JAVA_HOME=$(/usr/libexec/java_home)' >> ~/.zshrc
source ~/.zshrc
```

**Install Rust (for desktop):**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Install Dependencies

```bash
pnpm install
```

### Development

```bash
# Desktop dev server (macOS)
pnpm dev:desktop

# Mobile dev server
pnpm dev:mobile

# Relay server (for multi-pet communication)
pnpm dev:server
```

Visit http://localhost:5173 for the mobile web preview.

### Build Desktop App (macOS)

```bash
cd apps/desktop

# Development
pnpm tauri:dev

# Production build
pnpm tauri:build
```

Output: `apps/desktop/src-tauri/target/release/bundle/`

### Build Android APK

**Option 1: Convenience commands (recommended)**

```bash
pnpm android:sync      # Build and sync to Android
pnpm android:open      # Open Android Studio
pnpm android:debug     # Build debug APK
pnpm android:release   # Build release APK
```

APK output: `apps/mobile/android/app/build/outputs/apk/`

**Option 2: Manual steps**

```bash
cd apps/mobile
pnpm build              # Build web assets
npx cap add android     # Add Android platform (first time)
npx cap sync            # Sync to Android project
npx cap open android    # Open in Android Studio
```

Then in Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s).

## Architecture

### Agent System

```
┌─────────────────────────────────────────────────┐
│                  PetAgent                       │
│            (ReAct Loop Engine)                  │
│                                                 │
│  User message → LLM API (native fetch)         │
│      ↓                                          │
│  Parse tool calls → Execute tools → Collect     │
│      ↓                                          │
│  Append tool results → Call LLM again           │
│      ↓                                          │
│  No tool calls or max iterations (5) → Return   │
├─────────────────────────────────────────────────┤
│  Tool Set                                       │
│  ├── Live2D Tools (playMotion, setExpression)   │
│  ├── Cognitive Tools (innerThought, shouldReply)│
│  ├── Widget Tools (getTodos, addTodo, ...)      │
│  ├── Communication Tools (sendToPet, broadcast) │
│  └── Plugin Tools (external extensions)         │
├─────────────────────────────────────────────────┤
│  Memory (message history + localStorage)        │
└─────────────────────────────────────────────────┘
```

### Multi-device Networking

```
┌──────────────────────────────────────────────────────┐
│                     LAN Network                      │
│                                                      │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐      │
│  │Phone A  │◄────►│Phone B  │◄────►│Phone C  │      │
│  │ (Miko)  │      │ (Neko)  │      │ (Dango) │      │
│  └────┬────┘      └────┬────┘      └────┬────┘      │
│       └────────────────┼────────────────┘            │
│                        │                             │
│              ┌─────────▼─────────┐                   │
│              │   Relay Server    │                   │
│              │  (runs on any     │                   │
│              │   device in LAN)  │                   │
│              └─────────┬─────────┘                   │
└────────────────────────┼─────────────────────────────┘
                         │
                    ┌────▼────┐
                    │Cloud LLM│
                    │   API   │
                    └─────────┘
```

## Feature Status

### Implemented

- [x] Monorepo architecture (pnpm workspaces)
- [x] Vue 3 + TypeScript frontend
- [x] Shared packages (core / ui / platform / shared)
- [x] **AI Agent System**
  - [x] Custom ReAct loop engine (PetAgent)
  - [x] Multi-LLM support (OpenAI / Claude / DeepSeek / custom)
  - [x] Live2D model analyzer (rule-based + LLM-enhanced)
  - [x] Cognitive tools (innerThought + shouldReply)
  - [x] Widget tools (todo management, etc.)
  - [x] Multi-pet communication tools
  - [x] Plugin tool adapter
  - [x] Expression state tracking (30s timeout reset)
- [x] **Desktop App (Tauri - macOS)**
  - [x] Transparent frameless window
  - [x] Click-through
  - [x] Lock mode
  - [x] Custom window controls
  - [x] Live2D model upload
  - [x] Plugin system (manifest-driven)
- [x] **Mobile App (Capacitor - Android)**
  - [x] Keyboard handling
  - [x] Orientation support
  - [x] Live2D model upload
- [x] **Widget System**
  - [x] Clock widget
  - [x] Photo album widget
  - [x] Weather widget
  - [x] Todo widget
- [x] Live2D rendering (pixi-live2d-display)
- [x] Chat UI components (input, bubbles, history)
- [x] Live2D tool calling (motion / expression switching)
- [x] Inner monologue system (`<thinking>` tag)
- [x] Smart no-reply (`<no-answer>` tag)
- [x] Socket.io relay server
- [x] LAN communication (useP2P)
- [x] Multi-pet management (create / delete / duplicate / switch)
- [x] LAN server discovery
- [x] Chat history storage and export (JSON / text)
- [x] Custom backgrounds (image upload / preset gradients)
- [x] Material Design UI component library
- [x] XiaoZhi hardware integration (Opus codec, OTA)

### In Progress

- [ ] Android foreground service (keep-alive)
- [ ] Live2D touch interaction
- [ ] Low-power mode

### Planned

- [ ] **Relay server LLM scheduler** — Server-side LLM decides which pet speaks next for more natural multi-pet conversations
- [ ] iOS support
- [ ] Windows / Linux desktop support
- [ ] Text-to-Speech (TTS)
- [ ] Speech-to-Text (ASR)
- [ ] Pet memory system (long-term memory)

## Notes

1. **Live2D Model Copyright** — Use open-source / free models or create your own. Respect copyright.
2. **API Key Security** — In production, route API requests through the relay server to avoid exposing keys on the client.
3. **Android Background Limits** — Older Android versions may need extra configuration to keep the app alive in the background.
4. **Network** — Multi-device communication requires all devices to be on the same LAN.

## Contributing

Issues and Pull Requests are welcome!

## License

MIT
