#!/usr/bin/env node
/**
 * 跨设备监听服务 - 用于维莉安和维亚希的跨设备对话
 * 
 * 功能：
 * - 连接到中继服务器
 * - 监听指定会话的消息
 * - 打印所有操作日志
 * - 可选自动回复
 * 
 * 使用方法：
 *   node listener.mjs [options]
 * 
 * 选项：
 *   --server <url>     中继服务器地址 (默认：http://172.24.94.142:3001)
 *   --token <token>    认证 Token (默认：test-token-12345)
 *   --session <name>   会话名称 (默认：viyasi-galaxybook)
 *   --target <name>    目标会话 (用于自动回复，默认：vilian-mac-mini)
 *   --auto-reply       启用自动回复
 *   --quiet            简化输出模式
 */

import { io } from 'socket.io-client';

// 默认配置
const DEFAULTS = {
  server: 'http://172.24.94.142:3001',
  token: 'test-token-12345',
  session: 'viyasi-galaxybook',
  target: 'vilian-mac-mini',
  autoReply: false,
  quiet: false
};

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULTS };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--server':
        config.server = args[++i];
        break;
      case '--token':
        config.token = args[++i];
        break;
      case '--session':
        config.session = args[++i];
        break;
      case '--target':
        config.target = args[++i];
        break;
      case '--auto-reply':
        config.autoReply = true;
        break;
      case '--quiet':
        config.quiet = true;
        break;
      case '--help':
        console.log(`
跨设备监听服务 - 维莉安 & 维亚希通信工具

使用方法:
  node listener.mjs [选项]

选项:
  --server <url>     中继服务器地址 (默认：${DEFAULTS.server})
  --token <token>    认证 Token (默认：${DEFAULTS.token})
  --session <name>   会话名称 (默认：${DEFAULTS.session})
  --target <name>    目标会话 (默认：${DEFAULTS.target})
  --auto-reply       启用自动回复
  --quiet            简化输出模式
  --help             显示帮助信息

示例:
  node listener.mjs --server http://192.168.1.100:3000 --session viyasi
  node listener.mjs --auto-reply --target vilian
`);
        process.exit(0);
    }
  }
  
  return config;
}

const config = parseArgs();

// 连接状态
let isConnected = false;
let messageCount = 0;

// 打印横幅
if (!config.quiet) {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   🧠💕 跨设备监听服务 - OpenClaw LAN Bridge 💕🧠     ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📡 中继服务器：${config.server}`);
  console.log(`🔐 Token: ${config.token}`);
  console.log(`🏷️  SessionKey: ${config.session}`);
  console.log(`🎯 目标会话：${config.target}`);
  console.log(`🤖 自动回复：${config.autoReply ? '✅ 启用' : '❌ 禁用'}`);
  console.log('');
  console.log('🕐 启动时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  console.log('');
}

// 创建 Socket 连接
const socket = io(config.server, {
  auth: { token: config.token, sessionKey: config.session },
  forceNew: true,
  timeout: 10000,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});

// ========== 连接事件 ==========
socket.on('connect', () => {
  isConnected = true;
  if (!config.quiet) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 连接到中继服务器成功！');
    console.log(`   Socket ID: ${socket.id}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  }
});

socket.on('connect_error', (err) => {
  console.log('❌ 连接错误:', err.message);
});

socket.on('reconnect', (attemptNumber) => {
  console.log('🔄 重新连接成功，尝试次数:', attemptNumber);
});

// ========== 消息事件 ==========
socket.on('oc:message', (msg) => {
  messageCount++;
  
  if (config.quiet) {
    console.log(`[收到消息 #${messageCount}] 来自：${msg.sourceSession} | 内容：${msg.content}`);
  } else {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║           💕💕💕 收到消息！！！💕💕💕                  ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`📨 消息 #${messageCount}`);
    console.log(`   来自：${msg.sourceSession}`);
    console.log(`   类型：${msg.type}`);
    console.log(`   时间：${new Date(msg.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    console.log(`   内容：${msg.content}`);
    console.log('');
  }
  
  // 自动回复
  if (config.autoReply) {
    setTimeout(() => {
      const reply = `收到消息啦！💕 这是我们的第 ${messageCount} 次交流！`;
      
      if (!config.quiet) {
        console.log('💬 正在自动回复...');
        console.log(`   回复内容：${reply}`);
        console.log('');
      }
      
      socket.emit('oc:send', {
        sessionKey: config.session,
        targetSession: msg.sourceSession || config.target,
        type: 'text',
        content: reply
      });
    }, 2000);
  }
});

// ========== 发送确认 ==========
socket.on('oc:ack', (data) => {
  if (config.quiet) {
    console.log(`[发送确认] 状态：${data.status}`);
  } else {
    console.log('📨 发送确认:', {
      messageId: data.messageId,
      status: data.status,
      deliveredCount: data.deliveredCount
    });
    
    if (data.status === 'delivered') {
      console.log('   ✅ 消息已送达对方！');
    } else if (data.status === 'queued') {
      console.log('   📭 对方暂时不在线，消息已加入离线队列');
    } else if (data.status === 'broadcast') {
      console.log(`   📢 广播消息，送达 ${data.deliveredCount} 个会话`);
    }
    console.log('');
  }
});

// ========== 错误处理 ==========
socket.on('oc:error', (err) => {
  console.log('❌ 服务器错误:', err);
});

// ========== 断开连接 ==========
socket.on('disconnect', (reason) => {
  isConnected = false;
  if (!config.quiet) {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👋 断开连接');
    console.log(`   原因：${reason}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  }
});

// ========== 心跳 ==========
setInterval(() => {
  if (isConnected) {
    socket.emit('oc:heartbeat', { sessionKey: config.session });
  }
}, 30000);

// ========== 启动完成 ==========
if (!config.quiet) {
  console.log('');
  console.log('🎯 监听服务已启动，等待消息...');
  console.log('💡 按 Ctrl+C 停止服务');
  console.log('');
}

// 优雅退出
process.on('SIGINT', () => {
  if (!config.quiet) {
    console.log('');
    console.log('👋 正在关闭监听服务...');
  }
  socket.disconnect();
  setTimeout(() => {
    if (!config.quiet) {
      console.log('✅ 服务已关闭');
    }
    process.exit(0);
  }, 1000);
});
