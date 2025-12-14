# 下载

## 最新版本

<div class="download-cards">

### 📱 Android APK

从 GitHub Releases 下载最新的 APK 文件：

<a href="https://github.com/Tosuke-sama/DesktopFriends/releases/latest" class="download-link" target="_blank">
  前往下载页面 →
</a>

| 版本类型 | 说明 |
|---------|------|
| **Release** | 稳定版，推荐使用 |
| **Debug** | 调试版，包含日志 |

</div>

## 系统要求

- Android 7.0 (API 24) 或更高版本
- 至少 100MB 可用存储空间(debug版本)
- 用于 AI 对话：需要与运行中继服务器的电脑在同一局域网

## 安装说明

1. 下载 APK 文件到手机
2. 允许安装未知来源应用
3. 点击 APK 文件安装

详细步骤请查看 [安装指南](/guide/installation)

## 从源码构建

如果你想自己构建应用：

```bash
# 克隆仓库
git clone https://github.com/user/DesktopFriends.git
cd DesktopFriends

# 安装依赖
pnpm install

# 构建
pnpm build:mobile

# 同步到 Android
cd apps/mobile
npx cap sync android

# 在 Android Studio 中打开
npx cap open android
```

## 更新日志

查看 [GitHub Releases](https://github.com/user/DesktopFriends/releases) 获取完整的更新日志。
