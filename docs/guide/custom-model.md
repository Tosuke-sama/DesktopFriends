# 自定义模型

DesktopFriends 支持加载自定义的 Live2D 模型，让你可以使用自己喜欢的角色。

## 支持的格式

目前支持 Live2D Cubism 3/4 格式的模型，通常包含以下文件：

```
model/
├── model.model3.json    # 模型配置文件
├── model.moc3           # 模型数据
├── model.physics3.json  # 物理效果配置
├── motions/             # 动作文件目录
│   ├── idle.motion3.json
│   └── ...
├── expressions/         # 表情文件目录
│   ├── happy.exp3.json
│   └── ...
└── textures/            # 纹理文件目录
    └── texture_00.png
```

## 添加模型

### 方法一：放入 public 目录

1. 将模型文件夹放入 `apps/mobile/public/modules/` 目录
2. 在设置中配置模型路径，如 `/modules/your_model/model.model3.json`

### 方法二：使用远程 URL

在设置中直接输入模型的远程 URL（需要支持 CORS）

### 方法三：手机端支持上传zip压缩包

点击上传按钮，上传包含模型主体根目录的zip压缩包

## 模型设置

在应用设置中可以配置：

- **模型路径**：模型配置文件的路径
- **缩放**：调整模型大小
- **位置**：调整模型在屏幕上的位置

## 动作和表情

模型加载后，可以在测试面板中看到所有可用的：

- **动作 (Motions)**：如 idle、tap、flick 等
- **表情 (Expressions)**：如 happy、sad、angry 等

AI 对话时会自动选择合适的动作和表情。

## 常见问题

### 模型加载失败？

1. 检查路径是否正确
2. 确保所有文件都存在
3. 查看控制台日志获取详细错误信息

### 动作不播放？

1. 检查 motion 文件是否存在
2. 确认 model3.json 中配置了正确的动作组
