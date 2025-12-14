# AI 对话

DesktopFriends 支持多种 AI 服务，让你的桌面宠物能够进行智能对话。

## 支持的 AI 服务

### Ollama（推荐）

Ollama 是一个本地运行的 AI 服务，无需联网，保护隐私。

```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 下载模型
ollama pull llama3.2

# 启动服务
ollama serve
```

在服务器配置中设置：
```
AI_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

### OpenAI

使用 OpenAI 的 GPT 模型：

```
AI_PROVIDER=openai
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4o-mini
```

### Google Gemini

使用 Google 的 Gemini 模型：

```
AI_PROVIDER=gemini
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-1.5-flash
```

## 配置文件

在 `apps/server` 目录下创建 `.env` 文件：

```bash
# AI 配置
AI_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2

# 或者使用 OpenAI
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-xxx
# OPENAI_MODEL=gpt-4o-mini

# 角色设定
CHARACTER_NAME=小助手
CHARACTER_PROMPT=你是一个可爱的桌面宠物，性格活泼开朗
```

## 语音功能（开发中）

### 语音输入

应用支持使用手机麦克风进行语音输入，自动转换为文字发送给 AI。

### 语音输出 (TTS)

支持多种 TTS 服务：

- **系统 TTS**：使用安卓系统自带的语音合成
- **Edge TTS**：使用微软 Edge 的在线语音合成
- **自定义 TTS**：接入第三方 TTS API

## 人设设置

可以设置角色人设，让对话更有趣

## 下一步

- [多设备联动](/guide/multiplayer) - 设置设备连接
- [自定义模型](/guide/custom-model) - 更换角色模型
