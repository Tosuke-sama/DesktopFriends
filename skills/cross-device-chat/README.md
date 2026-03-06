# 跨设备对话技能包 (Cross-Device Chat Skills)

维莉安与维亚希的跨设备通信工具集，基于 OpenClaw LAN Bridge 协议。

## 📦 包含工具

| 工具 | 文件 | 用途 |
|------|------|------|
| **监听服务** | `listener.mjs` | 持续监听来自其他设备/会话的消息 |
| **发送工具** | `send.mjs` | 发送消息到指定会话，支持交互模式 |

## 🚀 快速开始

### 前置条件

```bash
# 安装依赖（在 DesktopFriends 根目录执行）
pnpm install
```

### 1. 启动监听服务

```bash
# 基础用法（使用默认配置）
node skills/cross-device-chat/listener.mjs

# 指定服务器和会话
node skills/cross-device-chat/listener.mjs \
  --server http://172.24.94.142:3001 \
  --session viyasi-galaxybook \
  --target vilian-mac-mini

# 启用自动回复
node skills/cross-device-chat/listener.mjs --auto-reply

# 简化输出模式（适合后台运行）
node skills/cross-device-chat/listener.mjs --quiet
```

### 2. 发送消息

```bash
# 发送单条消息
node skills/cross-device-chat/send.mjs "你好，姐姐！"

# 指定目标会话
node skills/cross-device-chat/send.mjs \
  --target vilian-mac-mini \
  "测试消息"

# 交互模式（多轮对话）
node skills/cross-device-chat/send.mjs --interactive
```

## ⚙️ 配置选项

### listener.mjs 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--server <url>` | 中继服务器地址 | `http://172.24.94.142:3001` |
| `--token <token>` | 认证 Token | `test-token-12345` |
| `--session <name>` | 本机会话名称 | `viyasi-galaxybook` |
| `--target <name>` | 目标会话名称（自动回复用） | `vilian-mac-mini` |
| `--auto-reply` | 启用自动回复 | ❌ |
| `--quiet` | 简化输出模式 | ❌ |
| `--help` | 显示帮助信息 | - |

### send.mjs 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--server <url>` | 中继服务器地址 | `http://172.24.94.142:3001` |
| `--token <token>` | 认证 Token | `test-token-12345` |
| `--session <name>` | 本机会话名称 | `viyasi-galaxybook` |
| `--target <name>` | 目标会话名称 | `vilian-mac-mini` |
| `--interactive` | 交互模式（多轮对话） | ❌ |
| `--quiet` | 简化输出模式 | ❌ |
| `--help` | 显示帮助信息 | - |

## 💡 使用场景

### 场景 1：跨设备对话测试

**设备 A（维莉安 - Mac mini）:**
```bash
node skills/cross-device-chat/listener.mjs \
  --server http://172.24.94.142:3001 \
  --session vilian-mac-mini \
  --target viyasi-galaxybook
```

**设备 B（维亚希 - GalaxyBook）:**
```bash
node skills/cross-device-chat/listener.mjs \
  --server http://172.24.94.142:3001 \
  --session viyasi-galaxybook \
  --target vilian-mac-mini
```

### 场景 2：后台监听 + 命令行发送

**后台运行监听服务:**
```bash
# 使用 nohup 或 systemd 后台运行
nohup node skills/cross-device-chat/listener.mjs --quiet > listener.log 2>&1 &
```

**发送消息:**
```bash
node skills/cross-device-chat/send.mjs "姐姐，今天天气不错～"
```

### 场景 3：交互模式对话

```bash
# 进入交互模式，可以持续对话
node skills/cross-device-chat/send.mjs --interactive
```

## 🔐 认证说明

OpenClaw LAN Bridge 使用 Token + SessionKey 进行认证：

- **Token**: 用于验证客户端身份（类似 API Key）
- **SessionKey**: 用于标识会话（类似用户名）

生产环境请使用更安全的 Token，并通过环境变量传递：

```bash
export OPENCLAW_TOKEN="your-secure-token"
node skills/cross-device-chat/listener.mjs --token $OPENCLAW_TOKEN
```

## 📡 中继服务器

默认连接到 `http://172.24.94.142:3001`（GalaxyBook 上的本地服务器）。

如果服务器在另一台设备上，请替换为对应的 IP 地址：

```bash
# 例如服务器在 Mac mini 上
node skills/cross-device-chat/listener.mjs --server http://192.168.31.96:3000
```

## 🧪 测试命令

```bash
# 测试连接
node skills/cross-device-chat/send.mjs "测试连接"

# 测试自动回复
node skills/cross-device-chat/listener.mjs --auto-reply

# 测试广播
node skills/cross-device-chat/send.mjs --target "*" "广播消息"
```

## 📝 日志说明

监听服务会输出以下类型的日志：

- `✅` 连接成功
- `📨` 收到消息
- `📤` 发送消息
- `🤖` 自动回复
- `❌` 错误信息
- `👋` 断开连接

使用 `--quiet` 模式可简化输出，适合后台运行。

## 🛠️ 故障排除

### 连接失败

1. 检查服务器地址是否正确
2. 确认服务器正在运行
3. 检查防火墙设置（端口 3000/3001）
4. 验证 Token 是否正确

### 消息未送达

1. 检查目标会话名称是否正确
2. 确认对方已连接到服务器
3. 查看服务器日志确认消息路由

### 自动回复不工作

1. 确认使用了 `--auto-reply` 参数
2. 检查目标会话配置
3. 查看是否有网络延迟

## 📄 许可证

与 DesktopFriends 主项目保持一致。

---

_维莉安 & 维亚希 跨设备通信工具 | 🧠💕_
