import { createHash } from 'node:crypto'
import { getHeader, type H3Event } from 'h3'
import { db } from './db'
import { epochMs } from './ids'
import { cognitoError } from './errors'

interface RateLimitRow { attempts: number, expires_at: number }

function clientIp(event: H3Event) {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return forwarded
  }
  return event.node.req.socket.remoteAddress || 'unknown'
}

function limitKey(event: H3Event, action: string, subject: string) {
  const normalized = `${action}\0${clientIp(event)}\0${subject.trim().toLowerCase()}`
  return createHash('sha256').update(normalized).digest('base64url')
}

export function assertRateLimit(event: H3Event, action: string, subject: string, limit = 5) {
  const key = limitKey(event, action, subject)
  const row = db().prepare('SELECT attempts,expires_at FROM rate_limits WHERE key=?').get(key) as unknown as RateLimitRow | undefined
  if (row && row.expires_at >= epochMs() && row.attempts >= limit) {
    cognitoError('TooManyRequestsException', 'Too many attempts. Try again later.', 429)
  }
}

export function recordRateLimitFailure(event: H3Event, action: string, subject: string, windowMs = 15 * 60_000) {
  const key = limitKey(event, action, subject)
  const timestamp = epochMs()
  db().prepare(`INSERT INTO rate_limits(key,attempts,window_started_at,expires_at) VALUES(?,1,?,?)
    ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN rate_limits.expires_at < excluded.window_started_at THEN 1 ELSE rate_limits.attempts+1 END,
      window_started_at=CASE WHEN rate_limits.expires_at < excluded.window_started_at THEN excluded.window_started_at ELSE rate_limits.window_started_at END,
      expires_at=CASE WHEN rate_limits.expires_at < excluded.window_started_at THEN excluded.expires_at ELSE rate_limits.expires_at END`).run(key, timestamp, timestamp + windowMs)
}

export function clearRateLimit(event: H3Event, action: string, subject: string) {
  db().prepare('DELETE FROM rate_limits WHERE key=?').run(limitKey(event, action, subject))
}

export function consumeRateLimit(event: H3Event, action: string, subject: string, limit = 5, windowMs = 15 * 60_000) {
  assertRateLimit(event, action, subject, limit)
  recordRateLimitFailure(event, action, subject, windowMs)
}
