/**
 * 维亚希的监听服务 - 只接收消息，不自动回复
 * 
 * 功能：
 * - 连接到中继服务器
 * - 监听并打印所有收到的消息
 * - 等待 AI 决定如何回复
 * - 由外部触发发送回复
 */

import { io } from 'socket.io-client';
import * as readline from 'readline';

const SERVER_URL = 'http://192.168.31.96:3000';
const TOKEN = 'test-token-12345';
const SESSION_KEY = 'viyasi-galaxybook';

console.log('');
console.log('╔════════════════════════════════════════════════════════╗');
console.log('║      🧠💕 维亚希监听服务 - 只接收，不自动回复 💕🧠    ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');
console.log(`📡 中继服务器：${SERVER_URL}`);
console.log(`🔐 Token: ${TOKEN}`);
console.log(`🏷️  SessionKey: ${SESSION_KEY}`);
console.log('');
console.log('🕐 启动时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
console.log('');

let isConnected = false;
let messageCount = 0;

const socket = io(SERVER_URL, {
  auth: { token: TOKEN, sessionKey: SESSION_KEY },
  forceNew: true,
  timeout: 10000,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});

// ========== 连接事件 ==========
socket.on('connect', () => {
  isConnected = true;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 连接到中继服务器成功！');
  console.log(`   Socket ID: ${socket.id}`);
  console.log(`   SessionKey: ${SESSION_KEY}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('💡 提示：收到消息后，在下方输入回复内容');
  console.log('   格式：@sessionKey 回复内容');
  console.log('   例如：@vilian-mac-mini 姐姐好～');
  console.log('');
});

socket.on('connect_error', (err) => {
  console.log('❌ 连接错误:', err.message);
});

// ========== 收到消息 ==========
socket.on('oc:message', (msg) => {
  messageCount++;
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log(`║              💕 收到消息 #${messageCount} 💕                  ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`   来自：${msg.sourceSession}`);
  console.log(`   类型：${msg.type}`);
  console.log(`   时间：${new Date(msg.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log('');
  console.log(`   📝 内容：`);
  console.log(`   ${'─'.repeat(50)}`);
  console.log(`   ${msg.content}`);
  console.log(`   ${'─'.repeat(50)}`);
  console.log('');
  console.log('💡 请在下方输入回复（格式：@sessionKey 回复内容）：');
  console.log('');
});

// ========== 发送确认 ==========
socket.on('oc:ack', (data) => {
  console.log('📨 发送确认:', {
    messageId: data.messageId,
    status: data.status,
    deliveredCount: data.deliveredCount
  });
  
  if (data.status === 'delivered') {
    console.log('   ✅ 消息已送达对方！');
  } else if (data.status === 'queued') {
    console.log('   📭 对方暂时不在线，消息已加入离线队列');
  }
  console.log('');
});

// ========== 错误处理 ==========
socket.on('oc:error', (err) => {
  console.log('');
  console.log('❌ 服务器错误:', err);
  console.log('');
});

// ========== 断开连接 ==========
socket.on('disconnect', (reason) => {
  isConnected = false;
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👋 断开连接');
  console.log(`   原因：${reason}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

// ========== 心跳 ==========
setInterval(() => {
  if (isConnected) {
    socket.emit('oc:heartbeat', { sessionKey: SESSION_KEY });
  }
}, 30000);

// ========== 命令行输入 ==========
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🎯 监听服务已启动，等待消息...');
console.log('💡 输入格式：@sessionKey 回复内容');
console.log('💡 例如：@vilian-mac-mini 姐姐好～');
console.log('💡 按 Ctrl+C 停止服务');
console.log('');

rl.on('line', (input) => {
  if (!isConnected) {
    console.log('❌ 未连接服务器，无法发送消息');
    return;
  }
  
  // 解析输入：@sessionKey 回复内容
  const match = input.match(/^@(\S+)\s+(.+)/);
  if (!match) {
    console.log('❌ 格式错误，请使用：@sessionKey 回复内容');
    console.log('   例如：@vilian-mac-mini 姐姐好～');
    return;
  }
  
  const [, targetSession, content] = match;
  
  console.log('');
  console.log(`📤 发送消息给 ${targetSession}...`);
  
  socket.emit('oc:send', {
    sessionKey: SESSION_KEY,
    targetSession: targetSession,
    type: 'text',
    content: content
  });
});

// ========== 优雅退出 ==========
process.on('SIGINT', () => {
  console.log('');
  console.log('👋 正在关闭监听服务...');
  socket.disconnect();
  setTimeout(() => {
    console.log('✅ 服务已关闭');
    rl.close();
    process.exit(0);
  }, 1000);
});
