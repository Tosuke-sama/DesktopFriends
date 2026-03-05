/**
 * OpenClaw Socket Routing Tests
 * 
 * @author Viyasi (Viyasi) - 中央大脑右脑模块 🧠💕
 * @since 2026-03-05
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Server as SocketIOServer } from 'socket.io'
import { io as SocketIOClient } from 'socket.io-client'
import { createServer } from 'http'
import { verifyOpenClawToken, sessionRegistry } from './auth.js'

describe('OpenClaw Socket Routing', () => {
  let httpServer: ReturnType<typeof createServer>
  let io: SocketIOServer
  let testPort: number

  beforeEach(async () => {
    process.env.OPENCLAW_TOKEN = 'test-token-12345'
    testPort = 18790 + Math.floor(Math.random() * 1000)
    
    httpServer = createServer()
    io = new SocketIOServer(httpServer, {
      cors: { origin: '*' }
    })
    
    // Add auth middleware
    io.use(async (socket, next) => {
      const token = socket.handshake.auth.token
      const sessionKey = socket.handshake.auth.sessionKey
      
      if (!token) return next(new Error('Missing auth token'))
      if (!sessionKey) return next(new Error('Missing sessionKey'))
      
      const valid = await verifyOpenClawToken(token)
      if (!valid) return next(new Error('Invalid token'))
      
      socket.data.authenticated = true
      socket.data.sessionKey = sessionKey
      next()
    })

    await new Promise<void>((resolve) => {
      httpServer.listen(testPort, () => resolve())
    })
  })

  afterEach((done) => {
    sessionRegistry.getAllSessions().forEach((_, key) => {
      sessionRegistry.unregister(key)
    })
    
    io.close()
    httpServer.close(() => {
      delete process.env.OPENCLAW_TOKEN
      done()
    })
  })

  describe('Authentication', () => {
    it('should reject connection without token', (done) => {
      const socket = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { sessionKey: 'test-session' }
      })

      socket.on('connect_error', (err) => {
        expect(err.message).toBe('Missing auth token')
        socket.disconnect()
        done()
      })
    })

    it('should reject connection without sessionKey', (done) => {
      const socket = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'test-token-12345' }
      })

      socket.on('connect_error', (err) => {
        expect(err.message).toBe('Missing sessionKey')
        socket.disconnect()
        done()
      })
    })

    it('should reject connection with invalid token', (done) => {
      const socket = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'wrong-token', sessionKey: 'test-session' }
      })

      socket.on('connect_error', (err) => {
        expect(err.message).toBe('Invalid token')
        socket.disconnect()
        done()
      })
    })

    it('should accept connection with valid credentials', (done) => {
      const socket = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'test-token-12345', sessionKey: 'agent:main:test' }
      })

      socket.on('connect', () => {
        expect(socket.connected).toBe(true)
        socket.disconnect()
        done()
      })
    })
  })

  describe('Message Routing', () => {
    it('should route message to online session', (done) => {
      let client1: any, client2: any

      // Connect first client
      client1 = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'test-token-12345', sessionKey: 'session-1' }
      })

      client1.on('connect', () => {
        // Connect second client
        client2 = SocketIOClient(`http://localhost:${testPort}`, {
          auth: { token: 'test-token-12345', sessionKey: 'session-2' }
        })

        client2.on('connect', () => {
          // Send message from client2 to client1
          client2.emit('oc:send', {
            sessionKey: 'session-1',
            targetSession: 'session-1',
            type: 'text',
            content: 'Hello from session-2!'
          })

          client1.on('oc:message', (msg) => {
            expect(msg.content).toBe('Hello from session-2!')
            expect(msg.sourceSession).toBe('session-2')
            client1.disconnect()
            client2.disconnect()
            done()
          })
        })
      })
    })

    it('should queue message for offline session', (done) => {
      const client = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'test-token-12345', sessionKey: 'session-1' }
      })

      client.on('connect', () => {
        // Send message to non-existent session
        client.emit('oc:send', {
          sessionKey: 'session-1',
          targetSession: 'offline-session',
          type: 'text',
          content: 'Message for offline session'
        })

        client.on('oc:ack', (ack) => {
          expect(ack.status).toBe('queued')
          expect(ack.messageId).toBeDefined()
          client.disconnect()
          done()
        })
      })
    })

    it('should acknowledge delivered message', (done) => {
      let client1: any, client2: any

      client1 = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'test-token-12345', sessionKey: 'session-1' }
      })

      client1.on('connect', () => {
        client2 = SocketIOClient(`http://localhost:${testPort}`, {
          auth: { token: 'test-token-12345', sessionKey: 'session-2' }
        })

        client2.on('connect', () => {
          client2.emit('oc:send', {
            sessionKey: 'session-2',
            targetSession: 'session-1',
            type: 'text',
            content: 'Test message'
          })

          client2.on('oc:ack', (ack) => {
            expect(ack.status).toBe('delivered')
            client1.disconnect()
            client2.disconnect()
            done()
          })
        })
      })
    })
  })

  describe('Broadcast', () => {
    it('should broadcast message to all sessions', (done) => {
      const clients: any[] = []
      const sessionKeys = ['session-1', 'session-2', 'session-3']
      let connectedCount = 0
      let messageCount = 0

      // Connect 3 clients
      sessionKeys.forEach((sessionKey, index) => {
        const client = SocketIOClient(`http://localhost:${testPort}`, {
          auth: { token: 'test-token-12345', sessionKey }
        })

        client.on('connect', () => {
          clients.push(client)
          connectedCount++

          if (connectedCount === 3) {
            // Last client sends broadcast
            clients[2].emit('oc:broadcast', {
              sessionKey: 'session-3',
              type: 'text',
              content: 'Broadcast message!'
            })
          }
        })

        client.on('oc:message', (msg) => {
          // Should receive broadcast from session-3
          if (msg.sourceSession === 'session-3') {
            messageCount++
            if (messageCount === 2) { // session-1 and session-2 should receive
              clients.forEach(c => c.disconnect())
              done()
            }
          }
        })
      })
    })
  })

  describe('Heartbeat', () => {
    it('should respond to heartbeat with ack', (done) => {
      const client = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'test-token-12345', sessionKey: 'test-session' }
      })

      client.on('connect', () => {
        client.emit('oc:heartbeat')

        client.on('oc:heartbeat:ack', (data) => {
          expect(data.timestamp).toBeDefined()
          expect(typeof data.timestamp).toBe('number')
          client.disconnect()
          done()
        })
      })
    })

    it('should update session heartbeat timestamp', (done) => {
      const client = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'test-token-12345', sessionKey: 'heartbeat-test' }
      })

      client.on('connect', () => {
        const beforeHeartbeat = sessionRegistry.getSession('heartbeat-test')?.lastHeartbeat
        
        setTimeout(() => {
          client.emit('oc:heartbeat')
          
          client.on('oc:heartbeat:ack', () => {
            const afterHeartbeat = sessionRegistry.getSession('heartbeat-test')?.lastHeartbeat
            expect(afterHeartbeat).toBeGreaterThan(beforeHeartbeat || 0)
            client.disconnect()
            done()
          })
        }, 100)
      })
    })
  })

  describe('Channel Subscription', () => {
    it('should subscribe to channel', (done) => {
      const client = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'test-token-12345', sessionKey: 'test-session' }
      })

      client.on('connect', () => {
        client.emit('oc:subscribe', 'test-channel')
        
        // Give it time to process
        setTimeout(() => {
          client.disconnect()
          done()
        }, 100)
      })
    })

    it('should send message to channel subscribers', (done) => {
      let client1: any, client2: any

      client1 = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'test-token-12345', sessionKey: 'session-1' }
      })

      client1.on('connect', () => {
        client1.emit('oc:subscribe', 'test-channel')

        client2 = SocketIOClient(`http://localhost:${testPort}`, {
          auth: { token: 'test-token-12345', sessionKey: 'session-2' }
        })

        client2.on('connect', () => {
          // Give subscription time to process
          setTimeout(() => {
            client2.emit('oc:channel', {
              channel: 'test-channel',
              content: 'Channel message',
              type: 'text'
            })

            client1.on('oc:message', (msg) => {
              expect(msg.content).toBe('Channel message')
              expect(msg.metadata?.channel).toBe('test-channel')
              client1.disconnect()
              client2.disconnect()
              done()
            })
          }, 100)
        })
      })
    })
  })

  describe('Message Validation', () => {
    it('should reject message without sessionKey', (done) => {
      const client = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'test-token-12345', sessionKey: 'test-session' }
      })

      client.on('connect', () => {
        client.emit('oc:send', {
          content: 'Invalid message',
          type: 'text'
        } as any)

        client.on('oc:error', (err) => {
          expect(err.code).toBe('INVALID_MESSAGE')
          client.disconnect()
          done()
        })
      })
    })

    it('should reject message without content', (done) => {
      const client = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'test-token-12345', sessionKey: 'test-session' }
      })

      client.on('connect', () => {
        client.emit('oc:send', {
          sessionKey: 'test-session',
          type: 'text'
        } as any)

        client.on('oc:error', (err) => {
          expect(err.code).toBe('INVALID_MESSAGE')
          client.disconnect()
          done()
        })
      })
    })

    it('should reject message with invalid type', (done) => {
      const client = SocketIOClient(`http://localhost:${testPort}`, {
        auth: { token: 'test-token-12345', sessionKey: 'test-session' }
      })

      client.on('connect', () => {
        client.emit('oc:send', {
          sessionKey: 'test-session',
          content: 'Test',
          type: 'invalid-type'
        } as any)

        client.on('oc:error', (err) => {
          expect(err.code).toBe('INVALID_MESSAGE')
          client.disconnect()
          done()
        })
      })
    })
  })
})
