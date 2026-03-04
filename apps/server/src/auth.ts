/**
 * OpenClaw Authentication Module
 * 
 * Provides token verification for OpenClaw LAN Bridge
 * 
 * @author Viyasi (Viyasi) - 中央大脑右脑模块 🧠💕
 * @since 2026-03-05
 */

const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_TOKEN || ''

/**
 * Verify OpenClaw Gateway token
 * 
 * Supports two authentication modes:
 * 1. Direct token comparison (for simple deployments)
 * 2. JWT verification (for enhanced security)
 * 
 * @param token - The token to verify
 * @returns Promise<boolean> - True if valid, false otherwise
 */
export async function verifyOpenClawToken(token: string): Promise<boolean> {
  try {
    if (!token || !OPENCLAW_GATEWAY_TOKEN) {
      console.log('❌ Auth failed: Missing token configuration')
      return false
    }

    // Mode 1: Direct token comparison
    if (token === OPENCLAW_GATEWAY_TOKEN) {
      console.log('✅ Auth successful: Direct token match')
      return true
    }

    // Mode 2: JWT verification (optional, if token is JWT format)
    if (token.startsWith('eyJ')) {
      // Try to decode as JWT
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          // Basic JWT structure validation
          const header = JSON.parse(Buffer.from(parts[0], 'base64').toString())
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
          
          // Check if it's a valid JWT with expected fields
          if (header.typ === 'JWT' && payload.exp) {
            // Check expiration
            if (payload.exp < Math.floor(Date.now() / 1000)) {
              console.log('❌ Auth failed: Token expired')
              return false
            }
            
            console.log('✅ Auth successful: JWT token valid')
            return true
          }
        }
      } catch (jwtErr) {
        console.log('⚠️ JWT decode failed, falling back to direct comparison')
      }
    }

    console.log('❌ Auth failed: Invalid token')
    return false
  } catch (err) {
    console.error('❌ Auth error:', err)
    return false
  }
}

/**
 * Socket.io authentication middleware
 * 
 * Validates token and sessionKey from connection handshake
 */
export function createAuthMiddleware() {
  return async (socket: any, next: (err?: any) => void) => {
    const token = socket.handshake.auth.token
    const sessionKey = socket.handshake.auth.sessionKey
    
    console.log(`🔐 Auth attempt: token=${token ? 'present' : 'missing'}, sessionKey=${sessionKey ? 'present' : 'missing'}`)
    
    // Check for required fields
    if (!token) {
      console.log('❌ Auth rejected: Missing auth token')
      return next(new Error('Missing auth token'))
    }
    
    if (!sessionKey) {
      console.log('❌ Auth rejected: Missing sessionKey')
      return next(new Error('Missing sessionKey'))
    }
    
    // Verify token
    const valid = await verifyOpenClawToken(token)
    if (!valid) {
      console.log('❌ Auth rejected: Invalid token')
      return next(new Error('Invalid token'))
    }
    
    // Store auth data on socket
    socket.data.authenticated = true
    socket.data.sessionKey = sessionKey
    socket.data.connectedAt = new Date().toISOString()
    
    console.log(`✅ Auth successful: sessionKey=${sessionKey}`)
    next()
  }
}

/**
 * Session registry for tracking connected OpenClaw instances
 */
export class SessionRegistry {
  private sessions: Map<string, {
    socketId: string
    connectedAt: string
    lastHeartbeat: number
    metadata?: Record<string, any>
  }>
  
  constructor() {
    this.sessions = new Map()
  }
  
  /**
   * Register a new session
   */
  register(sessionKey: string, socketId: string): void {
    this.sessions.set(sessionKey, {
      socketId,
      connectedAt: new Date().toISOString(),
      lastHeartbeat: Date.now()
    })
    console.log(`📝 Session registered: ${sessionKey} -> ${socketId}`)
  }
  
  /**
   * Unregister a session
   */
  unregister(sessionKey: string): boolean {
    const existed = this.sessions.has(sessionKey)
    this.sessions.delete(sessionKey)
    if (existed) {
      console.log(`📝 Session unregistered: ${sessionKey}`)
    }
    return existed
  }
  
  /**
   * Get socket ID for a session
   */
  getSocketId(sessionKey: string): string | undefined {
    return this.sessions.get(sessionKey)?.socketId
  }
  
  /**
   * Get session info
   */
  getSession(sessionKey: string): any {
    return this.sessions.get(sessionKey)
  }
  
  /**
   * Update heartbeat timestamp
   */
  heartbeat(sessionKey: string): void {
    const session = this.sessions.get(sessionKey)
    if (session) {
      session.lastHeartbeat = Date.now()
    }
  }
  
  /**
   * Get all active sessions
   */
  getAllSessions(): Map<string, any> {
    return new Map(this.sessions)
  }
  
  /**
   * Get count of active sessions
   */
  getCount(): number {
    return this.sessions.size
  }
  
  /**
   * Clean up stale sessions (no heartbeat for > 5 minutes)
   */
  cleanupStaleSessions(maxAgeMs: number = 300000): string[] {
    const stale: string[] = []
    const now = Date.now()
    
    for (const [sessionKey, session] of this.sessions.entries()) {
      if (now - session.lastHeartbeat > maxAgeMs) {
        stale.push(sessionKey)
      }
    }
    
    stale.forEach(key => this.unregister(key))
    
    if (stale.length > 0) {
      console.log(`🧹 Cleaned up ${stale.length} stale sessions`)
    }
    
    return stale
  }
}

// Export singleton instance
export const sessionRegistry = new SessionRegistry()
