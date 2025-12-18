# TableFri 插件开发指南

本文档介绍如何为 TableFri 桌面端开发插件。

## 目录

- [概述](#概述)
- [快速开始](#快速开始)
- [插件结构](#插件结构)
- [开发环境配置](#开发环境配置)
- [Plugin API](#plugin-api)
- [LLM 工具开发](#llm-工具开发)
- [生命周期钩子](#生命周期钩子)
- [前端 UI 开发](#前端-ui-开发)
- [构建与打包](#构建与打包)
- [示例：PDF 阅读器插件](#示例pdf-阅读器插件)
- [最佳实践](#最佳实践)
- [故障排除](#故障排除)

## 概述

TableFri 插件系统允许开发者扩展应用功能：

- **LLM 工具扩展**：为 AI 宠物提供新的能力（读取文件、网络请求等）
- **生命周期钩子**：响应应用事件（文件打开、文本选择等）
- **自定义 UI**：在侧边栏、工具栏添加插件界面

### 架构

```
┌─────────────────────────────────────────────────┐
│                  TableFri 主程序                 │
├─────────────────────────────────────────────────┤
│  Plugin Manager                                  │
│  ├─ 加载/卸载插件动态库                          │
│  ├─ 工具注册与执行                               │
│  └─ 钩子分发                                     │
├─────────────────────────────────────────────────┤
│  插件 A (.dylib)  │  插件 B (.dylib)  │  ...    │
└─────────────────────────────────────────────────┘
```

## 快速开始

### 1. 创建项目

```bash
# 创建新的 Rust 库项目
cargo new --lib my-plugin
cd my-plugin
```

### 2. 配置 Cargo.toml

```toml
[package]
name = "my-plugin"
version = "1.0.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]  # 重要：必须是 cdylib

[dependencies]
tablefri-plugin-api = { path = "../tablefri-plugin-api" }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

### 3. 实现插件

```rust
use tablefri_plugin_api::*;

pub struct MyPlugin {
    ctx: Option<PluginContext>,
}

impl Default for MyPlugin {
    fn default() -> Self {
        Self { ctx: None }
    }
}

impl Plugin for MyPlugin {
    fn initialize(&mut self, ctx: &PluginContext) -> Result<(), String> {
        self.ctx = Some(ctx.clone());
        println!("MyPlugin 已初始化");
        Ok(())
    }

    fn shutdown(&mut self) -> Result<(), String> {
        println!("MyPlugin 已关闭");
        Ok(())
    }

    fn get_tools(&self) -> Vec<ToolDefinition> {
        vec![
            ToolDefinition::no_params(
                "my-plugin",
                "hello",
                "返回一个友好的问候语"
            ),
        ]
    }

    fn execute_tool(&self, call: &ToolCall) -> ToolResult {
        match call.name.as_str() {
            "hello" => ToolResult::success(json!({
                "message": "你好！我是 MyPlugin！"
            })),
            _ => ToolResult::error("未知工具"),
        }
    }

    fn on_hook(&mut self, _hook_name: &str, _data: &Value) -> Option<Value> {
        None
    }
}

// 导出插件
export_plugin!(MyPlugin, MyPlugin::default);
```

### 4. 创建 manifest.json

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "插件描述",
  "main": "libmy_plugin.dylib",
  "permissions": [],
  "tools": [
    {
      "name": "hello",
      "description": "返回一个友好的问候语"
    }
  ],
  "hooks": []
}
```

### 5. 构建

```bash
cargo build --release
```

## 插件结构

一个完整的插件包含以下文件：

```
my-plugin/
├── Cargo.toml          # Rust 项目配置
├── src/
│   └── lib.rs          # 插件代码
├── manifest.json       # 插件清单（必需）
├── README.md           # 插件说明（推荐）
├── ui/                 # UI 组件（可选）
│   └── Panel.vue
└── build.sh            # 构建脚本（可选）
```

### README.md 插件说明

每个插件都应该包含一个 `README.md` 文件，用于向用户说明插件的功能和使用方法。用户可以在插件管理器中点击插件查看此说明。

**文件位置**：插件根目录下的 `README.md` 或 `readme.md`

**推荐内容**：

```markdown
# 插件名称

简短的插件介绍。

## 功能

- 功能点 1
- 功能点 2
- 功能点 3

## 使用方法

### 基本用法

描述如何使用插件的主要功能...

### 高级用法

描述插件的高级功能...

## 提供的 AI 工具

| 工具名 | 描述 |
|--------|------|
| `tool_name` | 工具功能说明 |

## 注意事项

- 注意事项 1
- 注意事项 2
```

**示例**（PDF 阅读器插件）：

```markdown
# PDF 阅读器插件

让你的桌宠帮助你阅读和理解 PDF 文档。

## 功能

- **拖拽打开**：将 PDF 文件拖拽到桌宠窗口，自动打开阅读器
- **文本选择**：在 PDF 中选中文字，自动发送给桌宠处理
- **高清渲染**：支持 Retina 显示屏的高清渲染

## 使用方法

1. 将 PDF 文件拖拽到桌宠窗口
2. 在 PDF 阅读器中选中文字（至少 3 个字符）
3. 桌宠会自动回应并帮助你理解内容
```

### manifest.json 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 插件唯一标识符，如 `my-plugin` |
| `name` | string | ✓ | 插件显示名称 |
| `version` | string | ✓ | 版本号，如 `1.0.0` |
| `author` | string | ✓ | 作者名称 |
| `description` | string | ✓ | 插件描述 |
| `main` | string | ✓ | 动态库文件名 |
| `ui` | object | | UI 配置 |
| `ui.panel` | string | | 侧边栏面板组件路径 |
| `ui.position` | string | | 面板位置：`sidebar`/`toolbar`/`floating` |
| `ui.windows` | object | | 独立窗口配置（见下文） |
| `permissions` | array | | 所需权限 |
| `tools` | array | | 工具定义（静态声明） |
| `hooks` | array | | 监听的钩子名称 |

### UI Windows 配置

插件可以定义独立窗口（如 PDF 阅读器窗口）：

```json
{
  "ui": {
    "panel": "ui/Panel.vue",
    "position": "sidebar",
    "windows": {
      "viewer": {
        "path": "ui/viewer.html",
        "title": "PDF 阅读器",
        "width": 900,
        "height": 700
      },
      "settings": {
        "path": "ui/settings.html",
        "title": "插件设置",
        "width": 500,
        "height": 400
      }
    }
  }
}
```

窗口配置字段：

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `path` | string | ✓ | HTML 文件路径（相对于插件目录） |
| `title` | string | | 窗口标题 |
| `width` | number | | 窗口宽度（默认 900） |
| `height` | number | | 窗口高度（默认 700） |

## 开发环境配置

### 依赖 tablefri-plugin-api

有两种方式引用 API：

#### 方式一：本地路径（开发时）

```toml
[dependencies]
tablefri-plugin-api = { path = "/path/to/tablefri/apps/desktop/src-tauri/plugins/tablefri-plugin-api" }
```

#### 方式二：Git 仓库

```toml
[dependencies]
tablefri-plugin-api = { git = "https://github.com/your-repo/tablefri", branch = "main" }
```

### 跨平台构建

动态库扩展名因平台而异：

| 平台 | 扩展名 | 前缀 |
|------|--------|------|
| macOS | `.dylib` | `lib` |
| Linux | `.so` | `lib` |
| Windows | `.dll` | 无 |

在 manifest.json 中可使用占位符：

```json
{
  "main": "libmy_plugin.dylib"
}
```

## Plugin API

### PluginContext

插件初始化时接收的上下文：

```rust
pub struct PluginContext {
    pub plugin_id: String,    // 插件 ID
    pub data_dir: PathBuf,    // 数据存储目录
    pub config: Value,        // 用户配置
}
```

### ToolDefinition

工具定义：

```rust
pub struct ToolDefinition {
    pub plugin_id: String,     // 插件 ID
    pub name: String,          // 工具名称
    pub description: String,   // 描述（给 LLM 看）
    pub parameters: Value,     // 参数 JSON Schema
}

// 创建方法
ToolDefinition::new(plugin_id, name, description, parameters)
ToolDefinition::no_params(plugin_id, name, description)
```

### ToolCall 和 ToolResult

```rust
// 工具调用
pub struct ToolCall {
    pub name: String,       // 工具名称
    pub arguments: Value,   // 调用参数
}

// 调用结果
pub struct ToolResult {
    pub success: bool,
    pub data: Value,
    pub error: Option<String>,
}

// 创建方法
ToolResult::success(json!({ "key": "value" }))
ToolResult::error("错误信息")
```

### Plugin Trait

必须实现的接口：

```rust
pub trait Plugin: Send + Sync {
    /// 初始化
    fn initialize(&mut self, ctx: &PluginContext) -> Result<(), String>;

    /// 关闭
    fn shutdown(&mut self) -> Result<(), String>;

    /// 获取工具列表
    fn get_tools(&self) -> Vec<ToolDefinition>;

    /// 执行工具
    fn execute_tool(&self, call: &ToolCall) -> ToolResult;

    /// 处理钩子
    fn on_hook(&mut self, hook_name: &str, data: &Value) -> Option<Value>;
}
```

## LLM 工具开发

### 定义工具

工具让 LLM 能够执行特定操作。定义时需要提供清晰的描述：

```rust
fn get_tools(&self) -> Vec<ToolDefinition> {
    let plugin_id = self.ctx.as_ref()
        .map(|c| c.plugin_id.clone())
        .unwrap_or_else(|| "my-plugin".to_string());

    vec![
        // 带参数的工具
        ToolDefinition::new(
            &plugin_id,
            "search_files",
            "在指定目录中搜索文件。返回匹配的文件路径列表。",
            json!({
                "type": "object",
                "properties": {
                    "directory": {
                        "type": "string",
                        "description": "搜索的目录路径"
                    },
                    "pattern": {
                        "type": "string",
                        "description": "搜索模式（支持 * 和 ? 通配符）"
                    },
                    "recursive": {
                        "type": "boolean",
                        "description": "是否递归搜索子目录",
                        "default": false
                    }
                },
                "required": ["directory", "pattern"]
            }),
        ),

        // 无参数的工具
        ToolDefinition::no_params(
            &plugin_id,
            "get_system_info",
            "获取当前系统信息，包括操作系统、CPU、内存等。",
        ),
    ]
}
```

### 处理工具调用

```rust
fn execute_tool(&self, call: &ToolCall) -> ToolResult {
    match call.name.as_str() {
        "search_files" => {
            // 解析参数
            let directory = call.arguments["directory"]
                .as_str()
                .ok_or_else(|| "缺少 directory 参数");
            let pattern = call.arguments["pattern"]
                .as_str()
                .ok_or_else(|| "缺少 pattern 参数");
            let recursive = call.arguments["recursive"]
                .as_bool()
                .unwrap_or(false);

            match (directory, pattern) {
                (Ok(dir), Ok(pat)) => {
                    // 执行搜索逻辑
                    let results = self.search_files(dir, pat, recursive);
                    ToolResult::success(json!({
                        "files": results,
                        "count": results.len()
                    }))
                }
                (Err(e), _) | (_, Err(e)) => ToolResult::error(&e),
            }
        }

        "get_system_info" => {
            ToolResult::success(json!({
                "os": std::env::consts::OS,
                "arch": std::env::consts::ARCH,
            }))
        }

        _ => ToolResult::error(&format!("未知工具: {}", call.name)),
    }
}
```

### 工具描述最佳实践

好的描述帮助 LLM 正确使用工具：

```rust
// ✓ 好的描述
"读取 PDF 文件的指定页面内容。需要先使用 open_pdf 打开文件。"

// ✗ 不好的描述
"读取页面"
```

## 生命周期钩子

### 可用钩子

| 钩子名称 | 触发时机 | data 内容 |
|----------|----------|-----------|
| `on_file_open` | 文件打开 | `{ "path": "..." }` |
| `on_text_select` | 文本选中 | `{ "text": "..." }` |
| `on_app_start` | 应用启动 | `{}` |
| `on_app_close` | 应用关闭 | `{}` |
| `before_message_send` | 消息发送前 | `{ "content": "..." }` |
| `after_message_receive` | 消息接收后 | `{ "content": "...", "from": "..." }` |
| `on_live2d_action` | Live2D 动作 | `{ "action": "...", "name": "..." }` |

### 处理钩子

```rust
use tablefri_plugin_api::hooks;

fn on_hook(&mut self, hook_name: &str, data: &Value) -> Option<Value> {
    match hook_name {
        hooks::ON_FILE_OPEN => {
            let path = data.get("path")?.as_str()?;

            // 检查文件类型
            if path.ends_with(".pdf") {
                // 返回动作：打开插件窗口
                return Some(json!({
                    "action": "open_window",
                    "window": "viewer",
                    "data": {
                        "path": path
                    }
                }));
            }
            None
        }

        hooks::ON_TEXT_SELECT => {
            let text = data.get("text")?.as_str()?;

            // 保存选中文本供后续使用
            self.selected_text = text.to_string();

            Some(json!({
                "action": "notify",
                "message": format!("用户选中了: {}", text)
            }))
        }

        _ => None,
    }
}
```

### 钩子返回动作

钩子可以返回以下动作，主程序会自动执行：

| 动作 | 说明 | 参数 |
|------|------|------|
| `open_window` | 打开插件窗口 | `window`: 窗口名称（manifest 中定义的）, `data`: 传递给窗口的数据 |
| `notify` | 显示通知 | `message`: 通知内容 |
| `context_update` | 更新上下文 | `message`: 上下文信息 |

**示例：打开 PDF 阅读器窗口**

```rust
// 当检测到 PDF 文件打开时
if file_type == "pdf" {
    return Some(json!({
        "action": "open_window",
        "window": "viewer",  // 对应 manifest.json 中 ui.windows.viewer
        "data": {
            "path": file_path  // 将作为 URL 参数传递: ?path=...
        }
    }));
}
```

主程序会：
1. 查找插件的 `ui.windows.viewer` 配置
2. 构建 URL: `plugin://localhost/{plugin_id}/ui/viewer.html?path={encoded_path}`
3. 创建新窗口并加载该 URL

### 在 manifest.json 中声明

```json
{
  "hooks": [
    "on_file_open",
    "on_text_select"
  ]
}
```

## 前端 UI 开发

### UI 位置

- `sidebar`：侧边栏面板
- `toolbar`：工具栏按钮/弹出框
- `floating`：浮动窗口

### 自定义协议

TableFri 提供三种自定义协议供插件使用：

#### plugin:// 协议

用于加载插件的静态资源（HTML、JS、CSS、图片等）：

```
plugin://localhost/{plugin_id}/{file_path}
```

示例：
```javascript
// 加载插件的 HTML 页面
const url = 'plugin://localhost/pdf-reader/ui/viewer.html?path=' + encodeURIComponent(pdfPath);
```

#### localfile:// 协议

用于在插件窗口中读取本地文件（如 PDF）：

```javascript
// 读取本地 PDF 文件
const encodedPath = encodeURIComponent('/path/to/file.pdf');
const response = await fetch('localfile://localhost/' + encodedPath);
const arrayBuffer = await response.arrayBuffer();
```

#### pluginevent:// 协议

**重要**：插件窗口无法直接访问 Tauri API（`window.__TAURI__` 不可用）。使用此协议向主程序发送事件：

```javascript
// 【推荐】使用通用 send-to-pet 接口发送消息给桌宠
async function sendToPet(message, bubble, source) {
  const eventUrl = `pluginevent://localhost/send-to-pet?message=${encodeURIComponent(message)}&bubble=${encodeURIComponent(bubble)}&source=${encodeURIComponent(source)}`;

  const response = await fetch(eventUrl);
  if (response.ok) {
    console.log('消息已发送给桌宠');
  }
}

// 使用示例
sendToPet(
  '请帮我翻译这段英文：Hello World',  // message: 发送给 LLM 的完整提示词
  '选中了「Hello World」',             // bubble: 显示在气泡中的简短文字
  'my-plugin:context'                  // source: 来源标识
);
```

支持的事件类型：

| 事件路径 | 参数 | 说明 |
|----------|------|------|
| `send-to-pet` | `message`, `bubble`(可选), `source` | **【推荐】** 通用消息接口，插件直接构造完整的 LLM 提示词 |
| `text-select` | `text`, `source` | 【向后兼容】文本选择事件 |

**send-to-pet 参数说明**：

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `message` | string | ✓ | 发送给 LLM 的完整提示词，插件可以自由构造上下文和指令 |
| `bubble` | string | | 显示在桌宠气泡中的简短文字（用于用户反馈） |
| `source` | string | | 来源标识，如 `pdf:文件名:page1`，便于调试和日志 |

**优势**：使用 `send-to-pet` 接口，插件可以完全控制发送给 LLM 的内容，无需主程序为每个插件添加专门的处理逻辑。

### 插件窗口 HTML 模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>插件窗口</title>
</head>
<body>
  <div id="app"></div>

  <script type="module">
    // 从 URL 参数获取数据
    function getPathFromUrl() {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('path');
    }

    // 【推荐】发送消息给桌宠（通用接口）
    async function sendToPet(message, bubble, source) {
      const params = new URLSearchParams({
        message,
        bubble: bubble || '',
        source: source || 'plugin'
      });
      const url = `pluginevent://localhost/send-to-pet?${params}`;
      return fetch(url);
    }

    // 读取本地文件
    async function readLocalFile(path) {
      const encodedPath = encodeURIComponent(path);
      const response = await fetch('localfile://localhost/' + encodedPath);
      return response.arrayBuffer();
    }

    // 初始化
    async function init() {
      const path = getPathFromUrl();
      if (path) {
        const data = await readLocalFile(path);
        // 处理文件数据...

        // 示例：发送消息给桌宠
        await sendToPet(
          `用户打开了文件: ${path}`,
          `打开了文件`,
          `my-plugin:${path}`
        );
      }
    }

    init();
  </script>
</body>
</html>
```

### Vue 组件模板

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/tauri'

// 插件 ID 由主程序传入
const props = defineProps<{
  pluginId: string
}>()

const result = ref<string>('')

// 调用插件工具
const callTool = async (toolName: string, args: object = {}) => {
  try {
    const response = await invoke<{
      success: boolean
      data: any
      error?: string
    }>('plugin_execute_tool', {
      pluginId: props.pluginId,
      toolName,
      arguments: args,
    })

    if (response.success) {
      return response.data
    } else {
      throw new Error(response.error || '执行失败')
    }
  } catch (e) {
    console.error('工具调用失败:', e)
    throw e
  }
}

onMounted(async () => {
  const data = await callTool('hello')
  result.value = data.message
})
</script>

<template>
  <div class="my-panel">
    <h3>我的插件</h3>
    <p>{{ result }}</p>
  </div>
</template>

<style scoped>
.my-panel {
  padding: 16px;
  color: white;
  background: rgba(26, 26, 46, 0.98);
}
</style>
```

### 可用 Tauri API

```typescript
import { invoke } from '@tauri-apps/api/tauri'
import { open, save } from '@tauri-apps/api/dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/api/fs'

// 调用插件工具
await invoke('plugin_execute_tool', {
  pluginId: 'my-plugin',
  toolName: 'hello',
  arguments: {},
})

// 打开插件窗口
await invoke('open_plugin_window', {
  pluginId: 'pdf-reader',
  windowName: 'viewer',      // manifest.json 中 ui.windows 定义的窗口名
  title: 'PDF - example.pdf', // 可选，覆盖默认标题
  data: {                     // 可选，传递给窗口的数据
    path: '/path/to/file.pdf'
  }
})

// 打开文件选择对话框
const file = await open({
  filters: [{ name: 'PDF', extensions: ['pdf'] }]
})
```

## 构建与打包

### 构建脚本

```bash
#!/bin/bash
set -e

# 构建
cargo build --release

# 确定库名
case "$(uname -s)" in
    Darwin*)  LIB_NAME="libmy_plugin.dylib" ;;
    Linux*)   LIB_NAME="libmy_plugin.so" ;;
    *)        LIB_NAME="my_plugin.dll" ;;
esac

# 创建分发目录
mkdir -p dist/my-plugin/ui
cp "target/release/$LIB_NAME" dist/my-plugin/
cp manifest.json dist/my-plugin/
cp -r ui/* dist/my-plugin/ui/

# 打包
cd dist
zip -r my-plugin.zip my-plugin

echo "插件包: dist/my-plugin.zip"
```

### 插件包结构

```
my-plugin.zip
└── my-plugin/
    ├── manifest.json
    ├── libmy_plugin.dylib  # 或 .so / .dll
    └── ui/
        └── Panel.vue
```

### 安装插件

1. 在 TableFri 中打开插件管理器
2. 点击"安装插件"按钮
3. 选择 `.zip` 插件包
4. 启用插件

## 示例：PDF 阅读器插件

完整的 PDF 阅读器插件示例位于：

```
src-tauri/plugins/examples/pdf-reader/
├── Cargo.toml
├── src/lib.rs
├── manifest.json
├── ui/
│   ├── PdfPanel.vue      # 侧边栏面板
│   └── viewer.html       # PDF 阅读器窗口
└── build.sh
```

### 功能

- 拖拽 PDF 文件到桌宠 → 自动打开 PDF 阅读器窗口
- 在 PDF 中选中文字 → 自动发送给桌宠处理
- 高清渲染（支持 Retina 显示屏）
- 缩放和页面导航

### 工作流程

```
1. 用户拖拽 PDF 文件到桌宠窗口
         ↓
2. 主程序触发 on_file_open 钩子
         ↓
3. PDF 插件检测到 .pdf 文件，返回 open_window 动作
         ↓
4. 主程序打开 PDF 阅读器窗口 (plugin://localhost/pdf-reader/ui/viewer.html?path=...)
         ↓
5. viewer.html 通过 localfile:// 协议加载 PDF
         ↓
6. 用户选中文字，通过 pluginevent:// 协议发送事件
         ↓
7. 主程序收到 text-select 事件，桌宠做出回应
```

### 提供的工具

| 工具名 | 描述 |
|--------|------|
| `open_pdf` | 打开 PDF 文件 |
| `read_pdf_page` | 读取指定页面内容 |
| `get_pdf_info` | 获取文档信息 |
| `search_pdf` | 搜索文本 |
| `get_selected_text` | 获取选中文本 |

### manifest.json 配置

```json
{
  "id": "pdf-reader",
  "name": "PDF 阅读器",
  "version": "1.0.0",
  "ui": {
    "panel": "ui/PdfPanel.vue",
    "position": "sidebar",
    "windows": {
      "viewer": {
        "path": "ui/viewer.html",
        "title": "PDF 阅读器",
        "width": 900,
        "height": 700
      }
    }
  },
  "hooks": ["on_file_open", "on_text_select"]
}
```

### 构建

```bash
cd src-tauri/plugins/examples/pdf-reader
chmod +x build.sh
./build.sh package
```

## 最佳实践

### 1. 工具设计

- 每个工具做一件事
- 提供清晰的描述和参数说明
- 返回结构化的数据

### 2. 错误处理

```rust
fn execute_tool(&self, call: &ToolCall) -> ToolResult {
    // 验证参数
    let param = match call.arguments.get("key") {
        Some(v) => v.as_str().ok_or("参数类型错误"),
        None => Err("缺少必需参数"),
    };

    match param {
        Ok(value) => {
            // 执行操作
            match self.do_something(value) {
                Ok(result) => ToolResult::success(json!(result)),
                Err(e) => ToolResult::error(&e.to_string()),
            }
        }
        Err(e) => ToolResult::error(e),
    }
}
```

### 3. 状态管理

使用 `Mutex` 保护共享状态：

```rust
pub struct MyPlugin {
    ctx: Option<PluginContext>,
    state: Mutex<MyState>,  // 线程安全的状态
}
```

### 4. 资源清理

在 `shutdown` 中释放资源：

```rust
fn shutdown(&mut self) -> Result<(), String> {
    // 保存状态
    self.save_state()?;

    // 释放资源
    *self.state.lock().unwrap() = MyState::default();

    Ok(())
}
```

### 5. 日志

使用标准输出进行日志：

```rust
println!("[MyPlugin] 操作完成: {}", result);
```

## 故障排除

### 常见问题

#### 1. 插件加载失败

**原因**：动态库格式不匹配

**解决**：
- 确保使用 `crate-type = ["cdylib"]`
- 确保 `manifest.json` 中的 `main` 字段正确

#### 2. 工具不显示

**原因**：`get_tools()` 返回空或 plugin_id 不匹配

**解决**：
```rust
fn get_tools(&self) -> Vec<ToolDefinition> {
    let plugin_id = self.ctx.as_ref()
        .map(|c| c.plugin_id.clone())
        .unwrap_or_else(|| "my-plugin".to_string());

    vec![
        ToolDefinition::new(&plugin_id, ...)
    ]
}
```

#### 3. UI 组件不显示

**原因**：路径配置错误

**解决**：
- 检查 `manifest.json` 中的 `ui.panel` 路径
- 确保 Vue 组件语法正确

#### 4. 插件窗口无法使用 Tauri API

**原因**：`plugin://` 协议加载的页面无法访问 `window.__TAURI__`

**解决**：使用 `pluginevent://` 协议发送事件：
```javascript
// ✗ 不可用
await window.__TAURI__.event.emit('my-event', data);

// ✓ 使用 pluginevent:// 协议的 send-to-pet 接口
await fetch(`pluginevent://localhost/send-to-pet?message=${encodeURIComponent(message)}&bubble=${encodeURIComponent(bubble)}&source=${encodeURIComponent(source)}`);
```

#### 5. 本地文件无法加载

**原因**：浏览器安全策略阻止访问本地文件

**解决**：使用 `localfile://` 协议：
```javascript
// ✗ 不可用
const response = await fetch('file:///path/to/file.pdf');

// ✓ 使用 localfile:// 协议
const response = await fetch('localfile://localhost/' + encodeURIComponent(path));
```

#### 6. 跨平台兼容性

**原因**：不同平台的路径分隔符和库扩展名不同

**解决**：
```rust
use std::path::{Path, PathBuf};

// 使用 Path 相关 API 处理路径
let path = PathBuf::from(dir).join(filename);
```

### 调试技巧

1. **查看日志**：主程序会输出插件加载和调用日志
2. **测试工具**：使用插件管理器 UI 测试工具
3. **独立测试**：编写单元测试验证逻辑

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_execution() {
        let plugin = MyPlugin::default();
        let call = ToolCall {
            name: "hello".to_string(),
            arguments: json!({}),
        };
        let result = plugin.execute_tool(&call);
        assert!(result.success);
    }
}
```

## 许可证

TableFri 插件 API 使用 MIT 许可证。
