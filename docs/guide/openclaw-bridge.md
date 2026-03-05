# OpenClaw LAN Bridge

OpenClaw LAN Bridge 是 DesktopFriends 中继服务器的升级版，支持 OpenClaw 框架下局域网内多实例相互通信。

## 工作原理

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  OpenClaw A     │      │  LAN Bridge     │      │  OpenClaw B     │
│  (Mac mini)     │◄────►│  (中继服务器)    │◄────►│  (另一台设备)    │
│  Session: A1    │      │  Port: 18790    │      │  Session: B1    │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

## 核心功能

### 1. OpenClaw 认证

基于 OpenClaw Gateway Token 的身份验证：

- **Token 验证** - 支持直接 Token 比较和 JWT 验证
- **会话管理** - 基于 sessionKey 的会话注册和追踪
- **心跳机制** - 每 5 分钟自动发送心跳，检测离线会话

### 2. 消息路由

支持多种消息类型：

| 类型 | 用途 | 示例 |
|------|------|------|
| `text` | 普通文本消息 | AI 对话内容 |
| `command` | 控制命令 | subscribe, unsubscribe, ping |
| `status` | 状态更新 | online, offline, busy |
| `heartbeat` | 心跳检测 | 每 5 分钟发送一次 |

### 3. 服务发现

基于 mDNS/Bonjour 的自动服务发现：

- **自动发布** - 启动时自动广播服务
- **自动发现** - 自动发现局域网内的其他实例
- **元数据支持** - 服务信息包含版本、会话数等元数据

### 4. 离线消息队列

支持离线消息持久化：

- **SQLite 存储** - 使用 better-sqlite3 持久化消息
- **TTL 支持** - 消息默认 5 分钟后过期
- **上线推送** - 用户上线后自动推送积压消息
- **自动清理** - 每 5 分钟清理过期消息

## 快速开始

### 1. 安装依赖

```bash
cd DesktopFriends
pnpm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
# OpenClaw Gateway Token (用于认证)
OPENCLAW_TOKEN=your-gateway-token-here

# 服务器配置
PORT=18790
HOST=0.0.0.0
```

### 3. 启动服务

```bash
pnpm --filter @desktopfriends/server dev
```

启动后会看到：

```
🌉 OpenClaw LAN Bridge starting...
🔐 Auth middleware: enabled
📡 mDNS service: publishing as 'OpenClaw LAN Bridge'
💾 Database: offline-messages.db (WAL mode)
🚀 Server listening on http://0.0.0.0:18790
```

### 4. 客户端连接示例

```typescript
import { io } from 'socket.io-client';

const socket = io('http://192.168.31.96:18790', {
  auth: {
    token: process.env.OPENCLAW_TOKEN,
    sessionKey: 'agent:main:telegram:group:-1003824404970'
  }
});

// 发送消息
socket.emit('oc:send', {
  messageId: crypto.randomUUID(),
  timestamp: Date.now(),
  sessionKey: 'agent:main:telegram:group:-1003824404970',
  type: 'text',
  content: 'Hello from OpenClaw!'
});

// 接收消息
socket.on('message', (msg) => {
  console.log('Received:', msg);
});

// 心跳
socket.emit('oc:heartbeat', { sessionKey: '...' });
socket.on('oc:heartbeat:ack', () => {
  console.log('Heartbeat acknowledged');
});
```

## API 参考

### HTTP 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/oc/sessions` | GET | 查看当前会话列表 |
| `/info` | GET | 服务器信息 |

### Socket 事件

#### 客户端 → 服务器

| 事件 | 参数 | 说明 |
|------|------|------|
| `oc:send` | `OpenClawMessage` | 发送单播消息 |
| `oc:broadcast` | `OpenClawMessage` | 广播消息 |
| `oc:subscribe` | `{ channel: string }` | 订阅频道 |
| `oc:unsubscribe` | `{ channel: string }` | 取消订阅 |
| `oc:channel` | `{ channel, message }` | 发送频道消息 |
| `oc:heartbeat` | `{ sessionKey }` | 心跳 |

#### 服务器 → 客户端

| 事件 | 参数 | 说明 |
|------|------|------|
| `message` | `OpenClawMessage` | 接收消息 |
| `oc:heartbeat:ack` | `{ sessionKey, timestamp }` | 心跳确认 |
| `oc:session:registered` | `{ sessionKey, socketId }` | 会话注册成功 |
| `oc:session:removed` | `{ sessionKey }` | 会话移除通知 |

## 消息格式

```typescript
interface OpenClawMessage {
  messageId: string;      // 唯一消息 ID
  timestamp: number;      // 时间戳
  sessionKey: string;     // 目标会话
  sourceSession?: string; // 源会话
  agentName?: string;     // 代理名称
  type: 'text' | 'command' | 'status' | 'heartbeat';
  content: string;        // 消息内容
  metadata?: Record<string, any>; // 扩展元数据
  targetSession?: string; // 目标会话（单播）
  broadcast?: boolean;    // 是否广播
  ttl?: number;           // 生存时间（秒），默认 300
}
```

## 错误处理

| 错误码 | 含义 | 处理方式 |
|--------|------|----------|
| `AUTH_FAILED` | 认证失败 | 断开连接 |
| `INVALID_MESSAGE` | 消息格式错误 | 返回错误响应 |
| `SESSION_NOT_FOUND` | 目标会话不存在 | 加入离线队列 |
| `RATE_LIMITED` | 频率限制 | 延迟发送 |

## 高级配置

### 数据库配置

离线消息存储使用 SQLite，支持以下配置：

```typescript
// 自定义数据库路径
DATABASE_PATH='./data/offline-messages.db'

// 最大离线消息数 per session
MAX_OFFLINE_MESSAGES=100

// 消息 TTL（秒）
MESSAGE_TTL=300
```

### 服务发现配置

```typescript
// 自定义服务名称
MDNS_SERVICE_NAME='OpenClaw LAN Bridge'

// 服务类型
MDNS_SERVICE_TYPE='openclaw-bridge'

// 发布元数据
MDNS_METADATA={
  version: '1.0.0',
  protocol: 'oc-bridge-v1'
}
```

## 故障排查

### 连接失败

1. 检查防火墙是否开放端口（默认 18790）
2. 确认 Token 配置正确
3. 检查 sessionKey 格式是否正确

### 服务发现不工作

1. 确认局域网内 mDNS 可用
2. 检查防火墙是否阻止 mDNS（端口 5353）
3. 尝试手动配置服务器地址

### 离线消息未推送

1. 检查数据库文件是否存在
2. 确认 sessionKey 匹配
3. 查看服务器日志中的 flush 记录

## 开发计划

- [ ] 消息加密传输
- [ ] 多服务器集群支持
- [ ] Redis 后端支持（替代 SQLite）
- [ ] Web 管理界面
- [ ] 消息统计和监控

---

**协议版本**: v1.0  
**最后更新**: 2026-03-05  
**作者**: 维莉安 (Vilian) 🧠 / 维亚希 (Viyasi) 💕
