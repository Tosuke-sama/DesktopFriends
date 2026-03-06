#!/usr/bin/env node
/**
 * 跨设备消息发送工具 - 用于维莉安和维亚希的跨设备对话
 * 
 * 功能：
 * - 连接到中继服务器
 * - 发送消息到指定会话
 * - 支持交互式对话模式
 * 
 * 使用方法：
 *   node send.mjs [options] <message>
 *   node send.mjs --interactive
 * 
 * 选项：
 *   --server <url>     中继服务器地址 (默认：http://172.24.94.142:3001)
 *   --token <token>    认证 Token (默认：test-token-12345)
 *   --session <name>   会话名称 (默认：viyasi-galaxybook)
 *   --target <name>    目标会话 (默认：vilian-mac-mini)
 *   --interactive      交互模式（多轮对话）
 *   --quiet            简化输出模式
 */

import { io } from 'socket.io-client';
import * as readline from 'readline';

// 默认配置
const DEFAULTS = {
  server: 'http://172.24.94.142:3001',
  token: 'test-token-12345',
  session: 'viyasi-galaxybook',
  target: 'vilian-mac-mini',
  interactive: false,
  quiet: false
};

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULTS };
  const message = [];
  
  let i = 0;
  while (i < args.length) {
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
      case '--interactive':
        config.interactive = true;
        break;
      case '--quiet':
        config.quiet = true;
        break;
      case '--help':
        console.log(`
跨设备消息发送工具 - 维莉安 & 维亚希通信工具

使用方法:
  node send.mjs [选项] <消息内容>
  node send.mjs --interactive

选项:
  --server <url>     中继服务器地址 (默认：${DEFAULTS.server})
  --token <token>    认证 Token (默认：${DEFAULTS.token})
  --session <name>   会话名称 (默认：${DEFAULTS.session})
  --target <name>    目标会话 (默认：${DEFAULTS.target})
  --interactive      交互模式（多轮对话）
  --quiet            简化输出模式
  --help             显示帮助信息

示例:
  node send.mjs "你好，姐姐！"
  node send.mjs --target vilian "测试消息"
  node send.mjs --interactive
`);
        process.exit(0);
      default:
        if (!args[i].startsWith('--')) {
          message.push(args[i]);
        }
    }
    i++;
  }
  
  config.message = message.join(' ');
  return config;
}

const config = parseArgs();

// 打印横幅
if (!config.quiet && !config.interactive) {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   📤 跨设备消息发送 - OpenClaw LAN Bridge 📤         ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📡 中继服务器：${config.server}`);
  console.log(`🏷️  SessionKey: ${config.session}`);
  console.log(`🎯 目标会话：${config.target}`);
  console.log('');
}

// 发送消息函数
function sendMessage(socket, content, exitAfter = true) {
  return new Promise((resolve) => {
    let acknowledged = false;
    
    const ackHandler = (data) => {
      if (acknowledged) return;
      acknowledged = true;
      
      if (!config.quiet) {
        console.log('');
        console.log('📨 发送确认:', {
          messageId: data.messageId,
          status: data.status,
          deliveredCount: data.deliveredCount
        });
        
        if (data.status === 'delivered') {
          console.log('   ✅ 消息已送达！');
        } else if (data.status === 'queued') {
          console.log('   📭 对方暂时不在线，消息已加入离线队列');
        } else if (data.status === 'broadcast') {
          console.log(`   📢 广播消息，送达 ${data.deliveredCount} 个会话`);
        }
        console.log('');
      }
      
      resolve(data);
    };
    
    socket.once('oc:ack', ackHandler);
    
    socket.emit('oc:send', {
      sessionKey: config.session,
      targetSession: config.target,
      type: 'text',
      content: content
    });
    
    if (!config.quiet) {
      console.log('💬 消息内容:');
      console.log('─'.repeat(50));
      console.log(content);
      console.log('─'.repeat(50));
      console.log('');
      console.log('📤 发送中...');
    }
    
    // 超时保护
    setTimeout(() => {
      if (!acknowledged) {
        socket.off('oc:ack', ackHandler);
        if (!config.quiet) {
          console.log('⏱️  超时，未收到确认');
        }
        resolve(null);
      }
    }, 10000);
  });
}

// 交互模式
async function runInteractive() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   💬 交互模式 - 维莉安 & 维亚希跨设备对话 💬         ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📡 中继服务器：${config.server}`);
  console.log(`🏷️  SessionKey: ${config.session}`);
  console.log(`🎯 目标会话：${config.target}`);
  console.log('');
  console.log('💡 输入消息后按 Enter 发送');
  console.log('💡 输入 "quit" 或 "exit" 退出');
  console.log('💡 输入 "help" 查看帮助');
  console.log('');
  
  const socket = io(config.server, {
    auth: { token: config.token, sessionKey: config.session },
    forceNew: true,
    timeout: 10000
  });
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // 监听收到的消息
  socket.on('oc:message', (msg) => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📨 收到来自 ${msg.sourceSession} 的消息:`);
    console.log(`   ${msg.content}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    rl.prompt(true);
  });
  
  socket.on('connect', () => {
    console.log('✅ 连接到中继服务器');
    console.log('');
    rl.prompt(true);
  });
  
  socket.on('connect_error', (err) => {
    console.log('❌ 连接错误:', err.message);
    process.exit(1);
  });
  
  socket.on('oc:ack', (data) => {
    if (data.status === 'delivered') {
      console.log('   ✅ 已送达');
    } else if (data.status === 'queued') {
      console.log('   📭 已加入离线队列');
    }
    console.log('');
    rl.prompt(true);
  });
  
  rl.on('line', async (line) => {
    const input = line.trim();
    
    if (input === 'quit' || input === 'exit') {
      console.log('👋 正在退出...');
      socket.disconnect();
      rl.close();
      process.exit(0);
    }
    
    if (input === 'help') {
      console.log('');
      console.log('命令:');
      console.log('  quit/exit  - 退出程序');
      console.log('  help       - 显示帮助');
      console.log('  target <n> - 切换目标会话');
      console.log('');
      rl.prompt(true);
      return;
    }
    
    if (input.startsWith('target ')) {
      config.target = input.slice(7).trim();
      console.log(`🎯 目标会话已更改为：${config.target}`);
      console.log('');
      rl.prompt(true);
      return;
    }
    
    if (input) {
      await sendMessage(socket, input, false);
    }
    
    rl.prompt(true);
  });
  
  rl.on('close', () => {
    console.log('');
    socket.disconnect();
    process.exit(0);
  });
}

// 主函数
async function main() {
  if (config.interactive) {
    await runInteractive();
    return;
  }
  
  if (!config.message) {
    console.log('❌ 请提供消息内容，或使用 --interactive 进入交互模式');
    console.log('💡 使用 --help 查看帮助');
    process.exit(1);
  }
  
  const socket = io(config.server, {
    auth: { token: config.token, sessionKey: config.session },
    forceNew: true,
    timeout: 10000
  });
  
  socket.on('connect', async () => {
    if (!config.quiet) {
      console.log('✅ 连接到中继服务器');
      console.log('');
    }
    
    await sendMessage(socket, config.message);
    
    setTimeout(() => {
      socket.disconnect();
      process.exit(0);
    }, 1000);
  });
  
  socket.on('connect_error', (err) => {
    console.log('❌ 连接错误:', err.message);
    process.exit(1);
  });
  
  // 超时保护
  setTimeout(() => {
    console.log('⏱️  超时，断开连接');
    socket.disconnect();
    process.exit(1);
  }, 15000);
}

main();
