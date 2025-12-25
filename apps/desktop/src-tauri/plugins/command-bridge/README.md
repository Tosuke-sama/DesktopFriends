# Command Bridge

受控命令桥插件，为桌宠暴露经过拦截的 CLI 功能。首个版本只开放 `ls -a`/`dir /a /b` 等价的目录列表能力，并且所有命令都需要用户在独立窗口里确认；后续可以继续基于统一的 Command 基类增加新的命令和更严格的鉴权。

## 能力

- ✅ 统一的 `CommandPlan`/`CommandExecutor` 包装，后续可插入鉴权或拦截器
- ✅ 跨平台（macOS/Linux -> `ls`, Windows -> `cmd /C dir /b [/a]`）
- ✅ 目录访问白名单（默认包含用户主目录、当前工作目录，可在配置里扩展）
- ✅ 命令历史持久化到 `data/command-history.json`，插件窗口可以直接读取
- ✅ `bridge_status` 工具可让 LLM 查看允许的根目录、请求队列、历史记录
- ✅ `handle_request` 与 `poll_updates` 工具配合，使审批窗口走长连接，不再依赖频繁轮询

## 提供的工具

| 名称 | 描述 |
| --- | --- |
| `list_directory` | 在授权目录内登记一个 `ls -a -1`/`dir /b /a` 请求，返回待审批请求信息，并触发打开 Console 窗口。参数：`path?: string`、`includeHidden?: boolean`（默认 `true`）。|
| `bridge_status` | 返回当前允许的根目录、历史文件位置、最近的命令记录、请求队列以及最新版本号。|
| `handle_request` | 仅供插件窗口使用。参数：`requestId: string`、`decision?: "approve" \| "reject"`。当用户在窗口中点击按钮时，通过 `pluginevent://localhost/plugin-tool` 来调用此工具，真正执行或拒绝命令，并生成一段同步给 AI 的提示。|
| `poll_updates` | 长连接式更新器。参数：`since?: number`、`timeoutMs?: number`。在无新事件时阻塞，在有新的请求/审批结果时才返回，UI 可以据此刷新。|

## 工作流

1. LLM 调用 `list_directory`。插件不会立刻执行命令，而是写入 `data/command-requests.json` 并返回 `action=open_window`，主程序会自动打开 **Command Bridge Console** 窗口。
2. Console 窗口与插件通过 `poll_updates` 保持长连接，只在有新请求或审批结果时才会收到推送。每条请求都有“允许”/“拒绝”按钮。
3. 当用户点击按钮时，窗口会使用 `pluginevent://localhost/plugin-tool?plugin=command-bridge&tool=handle_request&...` 调用 `handle_request`。只有“允许”的请求才会真正执行命令并写入历史。
4. 命令执行（或拒绝）后，窗口会把摘要通过 `pluginevent://localhost/send-to-pet` 同步给 LLM，聊天对话不会显示额外气泡，但模型会获得上下文。

## 使用方式

1. 在插件管理器中启用 Command Bridge。
2. 通过 LLM 或 `plugin_execute_tool` 调用 `list_directory`（示例：`{"path": "~/Desktop", "includeHidden": true}`）。
3. 插件会自动唤起 **Command Bridge Console** 窗口。审批完成后会自动同步摘要给 AI，无需在 UI 中渲染。
4. Console 窗口实时显示历史与队列，如需离线审计仍可通过 `plugin://localhost/command-bridge/data/*.json` 查看。
5. 如需扩大访问范围，在未来的配置界面里添加新的 `allowed_roots`（当前版本可通过修改插件配置 JSON 实现）。

## 构建与打包

```bash
cd apps/desktop/src-tauri/plugins/command-bridge
./build.sh   # 产物 -> dist/command-bridge.zip
```

将生成的 zip 通过插件管理器安装即可。
