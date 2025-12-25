# Command Bridge

受控命令桥插件，为桌宠暴露经过拦截的 CLI 功能。首个版本只开放 `ls -a`/`dir /a /b` 等价的目录列表能力，并且所有命令都需要用户在独立窗口里确认；后续可以继续基于统一的 Command 基类增加新的命令和更严格的鉴权。

## 能力

- ✅ 统一的 `CommandPlan`/`CommandExecutor` 包装，后续可插入鉴权或拦截器
- ✅ 跨平台（macOS/Linux -> `ls`, Windows -> `cmd /C dir /b [/a]`）
- ✅ 目录访问白名单（默认包含用户主目录、当前工作目录，可在配置里扩展）
- ✅ 命令历史持久化到 `data/command-history.json`，插件窗口可以直接读取
- ✅ `bridge_status` 工具可让 LLM 查看允许的根目录、请求队列、历史记录
- ✅ `handle_request` 工具通过 `pluginevent://localhost/plugin-tool` 暴露给插件窗口，只有用户点击“允许”才会真正执行命令

## 提供的工具

| 名称 | 描述 |
| --- | --- |
| `list_directory` | 在授权目录内登记一个 `ls -a -1`/`dir /b /a` 请求，返回待审批请求信息，并触发打开 Console 窗口。参数：`path?: string`、`includeHidden?: boolean`（默认 `true`）。|
| `bridge_status` | 返回当前允许的根目录、历史文件位置、最近的命令记录以及请求队列。|
| `handle_request` | 仅供插件窗口使用。参数：`requestId: string`、`decision?: "approve" \| "reject"`。当用户在窗口中点击按钮时，通过 `pluginevent://localhost/plugin-tool` 来调用此工具，真正执行或拒绝命令。|

## 工作流

1. LLM 调用 `list_directory`。插件不会立刻执行命令，而是写入 `data/command-requests.json` 并返回 `action=open_window`，主程序会自动打开 **Command Bridge Console** 窗口。
2. Console 窗口轮询 `command-requests.json`，展示待审批命令与参数。每条请求都有“允许”/“拒绝”按钮。
3. 当用户点击按钮时，窗口会使用 `pluginevent://localhost/plugin-tool?plugin=command-bridge&tool=handle_request&args=...` 调用 `handle_request` 工具。只有“允许”的请求才会真正执行命令并写入历史。
4. 命令执行完成后，stdout/stderr 会同时写入 `command-history.json` 与请求条目，窗口立即刷新，LLM 也能通过 `bridge_status` 获取相同信息。

## 使用方式

1. 在插件管理器中启用 Command Bridge。
2. 通过 LLM 或 `plugin_execute_tool` 调用 `list_directory`（示例：`{"path": "~/Desktop", "includeHidden": true}`）。
3. 插件会自动唤起 **Command Bridge Console** 窗口。用户在窗口中批准命令后才会执行 `ls -a`/`dir` 并展示输出；如果拒绝则会记录“拒绝”状态。
4. Console 窗口可随时查看实时历史、请求队列，底层文件位于 `plugin://localhost/command-bridge/data/command-history.json` 与 `command-requests.json`。
5. 如需扩大访问范围，在未来的配置界面里添加新的 `allowed_roots`（当前版本可通过修改插件配置 JSON 实现）。

## 构建与打包

```bash
cd apps/desktop/src-tauri/plugins/command-bridge
./build.sh   # 产物 -> dist/command-bridge.zip
```

将生成的 zip 通过插件管理器安装即可。
