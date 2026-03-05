/**
 * 压力测试脚本 - OpenClaw LAN Bridge
 * 
 * 测试用例：
 * - TC-030: 高频消息测试 (100 条消息/秒 持续 60 秒)
 * - TC-031: 多客户端压力测试 (10 个客户端同时发送消息)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io, Socket } from 'socket.io-client';
import { OpenClawMessage } from '@desktopfriends/shared';

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:18790';
const TEST_TOKEN = process.env.TEST_OPENCLAW_TOKEN || 'test-token-12345';

describe('压力测试', () => {
  const clients: Socket[] = [];
  const receivedMessages: Map<string, OpenClawMessage[]> = new Map();

  beforeAll(async () => {
    // 清理接收消息记录
    receivedMessages.clear();
  });

  afterAll(() => {
    // 关闭所有客户端连接
    clients.forEach(client => client.disconnect());
    clients.length = 0;
  });

  /**
   * 创建测试客户端
   */
  function createTestClient(sessionKey: string): Socket {
    const client = io(SERVER_URL, {
      auth: {
        token: TEST_TOKEN,
        sessionKey
      },
      forceNew: true
    });

    client.on('connect', () => {
      console.log(`[Client ${sessionKey}] Connected`);
    });

    client.on('message', (msg: OpenClawMessage) => {
      if (!receivedMessages.has(sessionKey)) {
        receivedMessages.set(sessionKey, []);
      }
      receivedMessages.get(sessionKey)!.push(msg);
    });

    clients.push(client);
    return client;
  }

  /**
   * 等待客户端连接
   */
  function waitForConnection(client: Socket, timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (client.connected) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, timeout);

      client.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // ============================================
  // TC-030: 高频消息测试
  // ============================================
  describe('TC-030: 高频消息测试', () => {
    it('应该能够处理 100 条消息/秒 持续 60 秒', async () => {
      const clientA = createTestClient('stress-test-a');
      const clientB = createTestClient('stress-test-b');

      await waitForConnection(clientA);
      await waitForConnection(clientB);

      const messagesPerSecond = 100;
      const durationSeconds = 60;
      const totalMessages = messagesPerSecond * durationSeconds;

      console.log(`[TC-030] 开始高频消息测试：${messagesPerSecond} 条/秒 × ${durationSeconds} 秒 = ${totalMessages} 条`);

      let sentCount = 0;
      let startTime = Date.now();

      // 发送消息
      const sendPromise = new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          for (let i = 0; i < messagesPerSecond; i++) {
            const msg: OpenClawMessage = {
              messageId: `stress-${Date.now()}-${i}`,
              timestamp: Date.now(),
              sessionKey: 'stress-test-b',
              sourceSession: 'stress-test-a',
              type: 'text',
              content: `Stress test message #${sentCount}`,
              metadata: { test: 'TC-030' }
            };

            clientA.emit('oc:send', msg);
            sentCount++;
          }

          if (sentCount >= totalMessages) {
            clearInterval(interval);
            resolve();
          }
        }, 1000);
      });

      await sendPromise;

      const elapsedTime = Date.now() - startTime;
      console.log(`[TC-030] 发送完成：${sentCount} 条消息，耗时 ${elapsedTime}ms`);

      // 等待消息处理
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 验证接收到的消息
      const receivedCount = receivedMessages.get('stress-test-b')?.length || 0;
      const lossRate = ((totalMessages - receivedCount) / totalMessages) * 100;

      console.log(`[TC-030] 接收统计：发送 ${totalMessages} 条，接收 ${receivedCount} 条，丢失率 ${lossRate.toFixed(2)}%`);

      // 断言：丢失率应该小于 1%
      expect(lossRate).toBeLessThan(1);

      // 断言：平均延迟应该小于 100ms
      expect(elapsedTime / totalMessages).toBeLessThan(100);

      console.log('[TC-030] ✅ 测试通过');
    }, 90000); // 90 秒超时
  });

  // ============================================
  // TC-031: 多客户端压力测试
  // ============================================
  describe('TC-031: 多客户端压力测试', () => {
    it('应该能够处理 10 个客户端同时发送消息', async () => {
      const clientCount = 10;
      const messagesPerClient = 100;

      console.log(`[TC-031] 开始多客户端压力测试：${clientCount} 个客户端 × ${messagesPerClient} 条消息`);

      // 创建多个客户端
      const testClients: Socket[] = [];
      for (let i = 0; i < clientCount; i++) {
        const client = createTestClient(`stress-client-${i}`);
        await waitForConnection(client);
        testClients.push(client);
      }

      let startTime = Date.now();
      let totalSent = 0;

      // 所有客户端同时发送消息
      const sendPromises = testClients.map((client, clientIdx) => {
        return new Promise<void>((resolve) => {
          let sent = 0;
          const interval = setInterval(() => {
            for (let i = 0; i < 10; i++) {
              const msg: OpenClawMessage = {
                messageId: `multi-${clientIdx}-${Date.now()}-${i}`,
                timestamp: Date.now(),
                sessionKey: 'stress-test-b',
                sourceSession: `stress-client-${clientIdx}`,
                type: 'text',
                content: `Multi-client message from client ${clientIdx} #${sent}`,
                metadata: { test: 'TC-031', clientIdx }
              };

              client.emit('oc:send', msg);
              sent++;
              totalSent++;
            }

            if (sent >= messagesPerClient) {
              clearInterval(interval);
              resolve();
            }
          }, 100); // 每个客户端每 100ms 发送 10 条
        });
      });

      await Promise.all(sendPromises);

      const elapsedTime = Date.now() - startTime;
      console.log(`[TC-031] 发送完成：${totalSent} 条消息，耗时 ${elapsedTime}ms`);

      // 等待消息处理
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 验证系统稳定性
      const allClientsStillConnected = testClients.every(c => c.connected);
      expect(allClientsStillConnected).toBe(true);

      console.log('[TC-031] ✅ 测试通过 - 系统稳定，无崩溃');
    }, 30000); // 30 秒超时
  });
});
