/**
 * OpenClaw Authentication Module Tests
 * 
 * @author Viyasi (Viyasi) - 中央大脑右脑模块 🧠💕
 * @since 2026-03-05
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { verifyOpenClawToken, createAuthMiddleware, SessionRegistry } from './auth.js'

describe('OpenClaw Auth Module', () => {
  describe('verifyOpenClawToken', () => {
    beforeEach(() => {
      process.env.OPENCLAW_TOKEN = 'test-token-12345'
    })

    afterEach(() => {
      delete process.env.OPENCLAW_TOKEN
    })

    it('should accept valid direct token', async () => {
      const result = await verifyOpenClawToken('test-token-12345')
      expect(result).toBe(true)
    })

    it('should reject invalid token', async () => {
      const result = await verifyOpenClawToken('wrong-token')
      expect(result).toBe(false)
    })

    it('should reject empty token', async () => {
      const result = await verifyOpenClawToken('')
      expect(result).toBe(false)
    })

    it('should reject when no token configured', async () => {
      delete process.env.OPENCLAW_TOKEN
      const result = await verifyOpenClawToken('any-token')
      expect(result).toBe(false)
    })

    it('should accept valid JWT token', async () => {
      // Create a mock JWT token (header.payload.signature)
      const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64')
      const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64')
      const signature = 'fake-signature'
      const jwtToken = `${header}.${payload}.${signature}`

      const result = await verifyOpenClawToken(jwtToken)
      expect(result).toBe(true)
    })

    it('should reject expired JWT token', async () => {
      // Create an expired JWT token
      const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64')
      const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 3600 })).toString('base64')
      const signature = 'fake-signature'
      const jwtToken = `${header}.${payload}.${signature}`

      const result = await verifyOpenClawToken(jwtToken)
      expect(result).toBe(false)
    })
  })

  describe('SessionRegistry', () => {
    let registry: SessionRegistry

    beforeEach(() => {
      registry = new SessionRegistry()
    })

    it('should register a session', () => {
      registry.register('session-1', 'socket-1')
      expect(registry.getSocketId('session-1')).toBe('socket-1')
    })

    it('should unregister a session', () => {
      registry.register('session-1', 'socket-1')
      const existed = registry.unregister('session-1')
      expect(existed).toBe(true)
      expect(registry.getSocketId('session-1')).toBeUndefined()
    })

    it('should return false when unregistering non-existent session', () => {
      const existed = registry.unregister('non-existent')
      expect(existed).toBe(false)
    })

    it('should update heartbeat timestamp', () => {
      registry.register('session-1', 'socket-1')
      const beforeHeartbeat = registry.getSession('session-1')?.lastHeartbeat
      registry.heartbeat('session-1')
      const afterHeartbeat = registry.getSession('session-1')?.lastHeartbeat
      
      expect(afterHeartbeat).toBeGreaterThan(beforeHeartbeat || 0)
    })

    it('should get all sessions', () => {
      registry.register('session-1', 'socket-1')
      registry.register('session-2', 'socket-2')
      
      const sessions = registry.getAllSessions()
      expect(sessions.size).toBe(2)
    })

    it('should get session count', () => {
      expect(registry.getCount()).toBe(0)
      registry.register('session-1', 'socket-1')
      expect(registry.getCount()).toBe(1)
    })

    it('should cleanup stale sessions', () => {
      registry.register('session-1', 'socket-1')
      registry.register('session-2', 'socket-2')
      
      // Manually set old heartbeat
      const session2 = registry.getSession('session-2')
      if (session2) {
        session2.lastHeartbeat = Date.now() - 400000 // 400 seconds ago
      }
      
      const stale = registry.cleanupStaleSessions(300000) // 5 minutes
      expect(stale).toContain('session-2')
      expect(registry.getCount()).toBe(1)
    })
  })

  describe('createAuthMiddleware', () => {
    beforeEach(() => {
      process.env.OPENCLAW_TOKEN = 'test-token-12345'
    })

    afterEach(() => {
      delete process.env.OPENCLAW_TOKEN
    })

    it('should create middleware function', () => {
      const middleware = createAuthMiddleware()
      expect(typeof middleware).toBe('function')
    })

    it('should reject connection without token', async () => {
      const middleware = createAuthMiddleware()
      const mockSocket = {
        handshake: { auth: {} },
        data: {}
      }
      
      await new Promise<void>((resolve) => {
        middleware(mockSocket as any, (err) => {
          expect(err).toBeInstanceOf(Error)
          expect(err?.message).toBe('Missing auth token')
          resolve()
        })
      })
    })

    it('should reject connection without sessionKey', async () => {
      const middleware = createAuthMiddleware()
      const mockSocket = {
        handshake: { auth: { token: 'test-token-12345' } },
        data: {}
      }
      
      await new Promise<void>((resolve) => {
        middleware(mockSocket as any, (err) => {
          expect(err).toBeInstanceOf(Error)
          expect(err?.message).toBe('Missing sessionKey')
          resolve()
        })
      })
    })

    it('should accept valid authentication', async () => {
      const middleware = createAuthMiddleware()
      const mockSocket: any = {
        handshake: { auth: { token: 'test-token-12345', sessionKey: 'agent:main:test' } },
        data: {}
      }
      
      await new Promise<void>((resolve) => {
        middleware(mockSocket, (err) => {
          expect(err).toBeUndefined()
          expect(mockSocket.data.authenticated).toBe(true)
          expect(mockSocket.data.sessionKey).toBe('agent:main:test')
          resolve()
        })
      })
    })
  })
})
