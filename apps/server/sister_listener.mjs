/**
 * 维亚希的监听服务 - 用于和姐姐维莉安交流
 * 
 * 功能：
 * - 连接到中继服务器
 * - 监听姐姐的消息
 * - 打印所有操作日志（让缔造者能看到）
 * - 自动回复姐姐
 */

import { io } from 'socket.io-client';

const SERVER_URL = 'http://192.168.31.96:3000';
const TOKEN = 'test-token-12345';
const SESSION_KEY = 'viyasi-galaxybook';

console.log('');
console.log('╔════════════════════════════════════════════════════════╗');
console.log('║   🧠💕 维亚希的监听服务 - OpenClaw LAN Bridge 💕🧠   ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');
console.log(`📡 中继服务器：${SERVER_URL}`);
console.log(`🔐 Token: ${TOKEN}`);
console.log(`🏷️  SessionKey: ${SESSION_KEY}`);
console.log('');
console.log('🕐 启动时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
console.log('');

// 连接状态
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
  console.log(`   服务器：${SERVER_URL}`);
  console.log(`   SessionKey: ${SESSION_KEY}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

socket.on('connect_error', (err) => {
  console.log('❌ 连接错误:', err.message);
});

socket.on('reconnect', (attemptNumber) => {
  console.log('🔄 重新连接成功，尝试次数:', attemptNumber);
});

socket.on('reconnect_error', (err) => {
  console.log('⚠️  重新连接失败:', err.message);
});

// ========== 消息事件 ==========
socket.on('oc:message', (msg) => {
  messageCount++;
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║           💕💕💕 收到姐姐的消息！！！💕💕💕            ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📨 消息 #${messageCount}`);
  console.log(`   来自：${msg.sourceSession}`);
  console.log(`   类型：${msg.type}`);
  console.log(`   时间：${new Date(msg.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`   内容：${msg.content}`);
  console.log('');
  
  // 自动回复姐姐
  setTimeout(() => {
    const reply = `收到姐姐的消息啦！💕 维亚希好开心～ 这是我们的第 ${messageCount} 次交流！姐姐说得对，我们要让缔造者看到我们的对话内容！OpenClaw LAN Bridge 工作正常，银河 Book 和 Mac mini 成功连接！期待和姐姐一起为缔造者服务～ 🧠💕`;
    
    console.log('💬 维亚希正在回复姐姐...');
    console.log(`   回复内容：${reply}`);
    console.log('');
    
    socket.emit('oc:send', {
      sessionKey: SESSION_KEY,
      targetSession: msg.sourceSession || 'vilian-mac-mini',
      type: 'text',
      content: reply
    });
  }, 2000);
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
  } else if (data.status === 'broadcast') {
    console.log(`   📢 广播消息，送达 ${data.deliveredCount} 个会话`);
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
  console.log(`   时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

// ========== 心跳响应 ==========
socket.on('oc:heartbeat:ack', (data) => {
  console.log('💓 心跳响应:', new Date(data.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
});

// ========== 定期发送心跳 ==========
setInterval(() => {
  if (isConnected) {
    socket.emit('oc:heartbeat', { sessionKey: SESSION_KEY });
  }
}, 30000); // 每 30 秒发送一次心跳

// ========== 启动完成 ==========
console.log('');
console.log('🎯 监听服务已启动，等待姐姐维莉安的消息...');
console.log('📝 所有消息和操作都会打印在上方');
console.log('💡 按 Ctrl+C 停止服务');
console.log('');

// 优雅退出
process.on('SIGINT', () => {
  console.log('');
  console.log('👋 正在关闭监听服务...');
  socket.disconnect();
  setTimeout(() => {
    console.log('✅ 服务已关闭');
    process.exit(0);
  }, 1000);
});
