import { db } from './db'
import { epochMs, id } from './ids'

export function replaceVerificationCode(poolId: string, clientId: string | null, userId: string, kind: string, value: string, metadata: Record<string, unknown> = {}) {
  const timestamp = epochMs()
  const sql = db()
  sql.exec('BEGIN')
  try {
    sql.prepare('UPDATE codes SET used_at=? WHERE user_id=? AND kind=? AND used_at IS NULL').run(timestamp, userId, kind)
    sql.prepare('INSERT INTO codes(id,pool_id,client_id,user_id,kind,code,expires_at,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id(), poolId, clientId, userId, kind, value, timestamp + 15 * 60_000, JSON.stringify(metadata), timestamp)
    sql.exec('COMMIT')
  } catch (error) {
    sql.exec('ROLLBACK')
    throw error
  }
}

export function consumeVerificationCode(userId: string, kind: string, value: string) {
  const timestamp = epochMs()
  const result = db().prepare(`UPDATE codes SET used_at=? WHERE id=(
    SELECT id FROM codes WHERE user_id=? AND kind=? AND code=? AND used_at IS NULL AND expires_at>=?
    ORDER BY created_at DESC LIMIT 1
  ) AND used_at IS NULL`).run(timestamp, userId, kind, value, timestamp)
  return result.changes === 1
}
