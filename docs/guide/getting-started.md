# 快速开始

本指南将帮助你在 5 分钟内启动 DesktopFriends 桌面宠物。

## 准备工作

你需要：
- 一台安卓手机（Android 7.0+）或者电脑
- 连接在同一局域网

## 步骤 1：安装手机应用

从 [下载页面](/download) 获取最新的 APK 文件，安装到你的安卓手机上。

## 步骤 2：启动中继服务器

### 方式一：从源码运行

```bash
# 克隆项目
git clone https://github.com/user/DesktopFriends.git
cd DesktopFriends

# 安装依赖
pnpm install

# 启动服务器
pnpm --filter @desktopfriends/server dev
```
### 方式二：手机一键运行

手机端在设置页面中可一键启动服务器

## 步骤 3：调整配置并加入房间

1. 打开手机上的 DesktopFriends 应用
2. 进入设置可配置大模型api，live2d模型，背景图等
3. 搜索服务器按钮会自动搜索局域网内的中继服务器
4. 找到后点击连接

::: tip 提示
如果自动发现失败，可以手动输入服务器 IP 地址
:::

## 步骤 4：开始与伙伴「们」对话


## 其他信息

- [配置 AI 服务](/guide/ai-chat) - 让角色更智能
- [自定义模型](/guide/custom-model) - 使用你喜欢的角色
- [多设备联动](/guide/multiplayer) - 高级连接设置
