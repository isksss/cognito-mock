import { db } from './db'
import { cognitoError } from './errors'
import { epochMs, id, json } from './ids'

export type ChallengeName = 'PASSWORD_VERIFIER' | 'NEW_PASSWORD_REQUIRED'

export interface ChallengeSessionData extends Record<string, unknown> {
  challengeName: ChallengeName
}

export interface ChallengeSession {
  id: string
  poolId: string
  clientId: string
  userId: string
  data: ChallengeSessionData
}

export function createChallengeSession(poolId: string, clientId: string, userId: string, data: ChallengeSessionData, ttlMs = 5 * 60_000) {
  const session = id(32)
  const timestamp = epochMs()
  db().prepare('INSERT INTO sessions(id,pool_id,client_id,user_id,data,expires_at,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(session, poolId, clientId, userId, JSON.stringify(data), timestamp + ttlMs, timestamp)
  return session
}

export function consumeChallengeSession(sessionId: string, expectedChallenge: ChallengeName, clientId?: string): ChallengeSession {
  const row = db().prepare('SELECT * FROM sessions WHERE id=?').get(sessionId) as unknown as {
    id: string
    pool_id: string
    client_id: string
    user_id: string
    data: string
    expires_at: number
  } | undefined
  const timestamp = epochMs()
  if (!row || row.expires_at < timestamp) {
    if (row) db().prepare('DELETE FROM sessions WHERE id=?').run(row.id)
    cognitoError('NotAuthorizedException', 'Invalid or expired session.')
  }

  // The conditional delete is the consume operation. Only one concurrent request can win.
  const consumed = db().prepare('DELETE FROM sessions WHERE id=? AND expires_at>=?').run(row.id, timestamp)
  if (consumed.changes !== 1) cognitoError('NotAuthorizedException', 'Invalid or expired session.')

  const data = json<ChallengeSessionData>(row.data, {} as ChallengeSessionData)
  if (data.challengeName !== expectedChallenge || (clientId && row.client_id !== clientId)) {
    cognitoError('NotAuthorizedException', 'Session does not match this challenge.')
  }
  return { id: row.id, poolId: row.pool_id, clientId: row.client_id, userId: row.user_id, data }
}
