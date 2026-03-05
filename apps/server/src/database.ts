import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 离线消息持久化数据库
 * 使用 SQLite 存储离线消息，支持服务器重启后恢复
 */
export class OfflineMessageDatabase {
  private db: Database.Database
  private readonly DEFAULT_TTL = 300 // 5 分钟

  constructor(dbPath: string = join(__dirname, '../../data/offline_messages.db')) {
    // 确保数据目录存在
    try {
      mkdirSync(dirname(dbPath), { recursive: true })
    } catch (e) {
      // 目录可能已存在
    }

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL') // 启用 WAL 模式提高并发性能
    this.initSchema()
    console.log(`📊 Database initialized: ${dbPath}`)
  }

  /**
   * 初始化数据库表结构
   */
  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS offline_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE NOT NULL,
        session_key TEXT NOT NULL,
        source_session TEXT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        ttl INTEGER DEFAULT ${this.DEFAULT_TTL},
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        delivered INTEGER DEFAULT 0,
        delivered_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_session_key ON offline_messages(session_key);
      CREATE INDEX IF NOT EXISTS idx_expires_at ON offline_messages(expires_at);
      CREATE INDEX IF NOT EXISTS idx_delivered ON offline_messages(delivered);
    `)
  }

  /**
   * 存储离线消息
   */
  queueMessage(msg: {
    messageId: string
    sessionKey: string
    sourceSession?: string
    type: string
    content: string
    metadata?: Record<string, any>
    ttl?: number
    timestamp: number
  }): void {
    const ttl = msg.ttl ?? this.DEFAULT_TTL
    const expiresAt = msg.timestamp + (ttl * 1000)

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO offline_messages 
      (message_id, session_key, source_session, type, content, metadata, ttl, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      msg.messageId,
      msg.sessionKey,
      msg.sourceSession || null,
      msg.type,
      msg.content,
      msg.metadata ? JSON.stringify(msg.metadata) : null,
      ttl,
      msg.timestamp,
      expiresAt
    )

    console.log(`💾 Queued offline message to DB: ${msg.messageId} for ${msg.sessionKey}`)
  }

  /**
   * 获取指定会话的所有未投递离线消息
   */
  getPendingMessages(sessionKey: string): Array<{
    messageId: string
    sessionKey: string
    sourceSession?: string
    type: string
    content: string
    metadata?: Record<string, any>
    ttl: number
    timestamp: number
  }> {
    const stmt = this.db.prepare(`
      SELECT message_id, session_key, source_session, type, content, metadata, ttl, created_at
      FROM offline_messages
      WHERE session_key = ? AND delivered = 0 AND expires_at > ?
      ORDER BY created_at ASC
    `)

    const rows = stmt.all(sessionKey, Date.now()) as any[]

    return rows.map(row => ({
      messageId: row.message_id,
      sessionKey: row.session_key,
      sourceSession: row.source_session || undefined,
      type: row.type,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      ttl: row.ttl,
      timestamp: row.created_at,
    }))
  }

  /**
   * 标记消息为已投递
   */
  markAsDelivered(messageId: string): void {
    const stmt = this.db.prepare(`
      UPDATE offline_messages 
      SET delivered = 1, delivered_at = ?
      WHERE message_id = ?
    `)
    stmt.run(Date.now(), messageId)
  }

  /**
   * 批量标记消息为已投递
   */
  markBatchAsDelivered(messageIds: string[]): void {
    if (messageIds.length === 0) return

    const stmt = this.db.prepare(`
      UPDATE offline_messages 
      SET delivered = 1, delivered_at = ?
      WHERE message_id = ?
    `)

    const transaction = this.db.transaction((ids: string[]) => {
      const now = Date.now()
      for (const id of ids) {
        stmt.run(now, id)
      }
    })

    transaction(messageIds)
    console.log(`✅ Marked ${messageIds.length} messages as delivered`)
  }

  /**
   * 清理过期消息
   */
  cleanupExpiredMessages(): number {
    const stmt = this.db.prepare(`
      DELETE FROM offline_messages
      WHERE expires_at <= ?
    `)

    const now = Date.now()
    const result = stmt.run(now)
    console.log(`🧹 Cleaned up ${result.changes} expired messages`)
    return result.changes
  }

  /**
   * 获取指定会话的待投递消息数量
   */
  getPendingCount(sessionKey: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM offline_messages
      WHERE session_key = ? AND delivered = 0 AND expires_at > ?
    `)

    const result = stmt.get(sessionKey, Date.now()) as { count: number }
    return result.count
  }

  /**
   * 获取所有待投递消息的会话列表
   */
  getSessionWithPendingMessages(): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT session_key
      FROM offline_messages
      WHERE delivered = 0 AND expires_at > ?
    `)

    const rows = stmt.all(Date.now()) as { session_key: string }[]
    return rows.map(row => row.session_key)
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close()
    console.log('📊 Database connection closed')
  }
}

// 单例实例
let dbInstance: OfflineMessageDatabase | null = null

/**
 * 获取数据库单例实例
 */
export function getDatabase(): OfflineMessageDatabase {
  if (!dbInstance) {
    dbInstance = new OfflineMessageDatabase()
  }
  return dbInstance
}

/**
 * 初始化数据库（服务器启动时调用）
 */
export function initDatabase(): OfflineMessageDatabase {
  return getDatabase()
}
