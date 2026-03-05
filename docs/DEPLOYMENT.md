# OpenClaw LAN Bridge 部署指南

## 📦 安装步骤

### 前置要求

- Node.js >= 18.x
- pnpm >= 8.x
- Git

### 1. 克隆项目

```bash
git clone https://github.com/Tosuke-sama/DesktopFriends.git
cd DesktopFriends
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

在 `apps/server` 目录下创建 `.env` 文件：

```bash
cd apps/server
cp .env.example .env
```

编辑 `.env` 文件：

```env
# OpenClaw Gateway Token (必需)
OPENCLAW_TOKEN=your_gateway_token_here

# 服务器配置
PORT=18790
HOST=0.0.0.0

# mDNS 服务配置
MDNS_SERVICE_NAME=OpenClaw LAN Bridge
MDNS_SERVICE_TYPE=openclaw-bridge

# 日志级别 (debug | info | warn | error)
LOG_LEVEL=info
```

## 🚀 启动服务

### 开发模式

```bash
cd apps/server
pnpm dev
```

### 生产模式

```bash
cd apps/server
pnpm build
pnpm start
```

### 后台运行 (推荐)

```bash
# 使用 pm2
pm2 start pnpm --name "openclaw-bridge" -- start

# 或使用 nohup
nohup pnpm start > bridge.log 2>&1 &
```

## 📱 客户端连接配置

### OpenClaw 客户端配置

在 OpenClaw 配置文件中添加 LAN Bridge 配置：

```json
{
  "lanBridge": {
    "enabled": true,
    "mode": "auto",
    "serverUrl": "http://192.168.31.96:18790",
    "token": "your_gateway_token_here",
    "sessionKey": "agent:main:telegram:group:-1003824404970"
  }
}
```

### 手动配置备用

如果 mDNS 自动发现失败，使用手动配置：

```json
{
  "lanBridge": {
    "mode": "manual",
    "manualConfig": {
      "host": "192.168.31.96",
      "port": 18790
    }
  }
}
```

## 🔧 配置文件说明

### 核心配置项

| 配置项 | 说明 | 默认值 | 必需 |
|--------|------|--------|------|
| OPENCLAW_TOKEN | Gateway 认证 Token | - | ✅ |
| PORT | 服务监听端口 | 18790 | ❌ |
| HOST | 监听地址 | 0.0.0.0 | ❌ |
| LOG_LEVEL | 日志级别 | info | ❌ |

### 消息配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| MESSAGE_TTL | 消息过期时间 (秒) | 3600 |
| OFFLINE_QUEUE_SIZE | 离线队列最大容量 | 1000 |
| HEARTBEAT_INTERVAL | 心跳间隔 (秒) | 300 |

## 🔍 服务发现

### mDNS 自动发现

服务启动后会自动发布 mDNS 服务：
- 服务名称：`OpenClaw LAN Bridge`
- 服务类型：`_openclaw-bridge._tcp`

客户端可以通过 mDNS 自动发现局域网内的 Bridge 服务。

### 手动指定

如果自动发现失败，可以在客户端配置中手动指定服务器地址。

## 📊 监控与日志

### 查看日志

```bash
# 实时日志
tail -f bridge.log

# 或查看 pm2 日志
pm2 logs openclaw-bridge
```

### 健康检查

```bash
curl http://localhost:18790/health
```

响应示例：
```json
{
  "status": "ok",
  "timestamp": 1709612400000,
  "sessions": 2,
  "uptime": 3600
}
```

## ❓ 常见问题

### 1. 认证失败

**错误:** `AUTH_FAILED: Invalid token`

**解决:**
- 检查 `.env` 中的 `OPENCLAW_TOKEN` 是否正确
- 确认客户端配置的 token 与服务器一致

### 2. 端口被占用

**错误:** `EADDRINUSE: address already in use`

**解决:**
```bash
# 查找占用端口的进程
lsof -i :18790

# 或更换端口
echo "PORT=18791" >> .env
```

### 3. mDNS 发现失败

**症状:** 客户端无法自动发现服务器

**解决:**
- 确认防火墙允许 mDNS (端口 5353)
- 使用手动配置模式

### 4. 离线消息丢失

**症状:** 服务器重启后离线消息丢失

**解决:**
- 确认 SQLite 数据库文件存在
- 检查数据库写入权限

## 🔐 安全建议

1. **Token 管理**
   - 使用强随机 Token
   - 定期轮换 Token
   - 不要将 Token 提交到版本控制

2. **网络隔离**
   - 仅在可信局域网内部署
   - 使用防火墙限制访问

3. **日志审计**
   - 定期查看连接日志
   - 监控异常连接尝试

---

**文档版本:** v1.0  
**最后更新:** 2026-03-05  
**作者:** 维莉安 (Vilian) 🧠 | 中央大脑左脑模块
