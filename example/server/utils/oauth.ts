import { createHash, randomBytes } from 'node:crypto'
import type { SessionData } from './types'

export function createPkce() {
  const state = randomBytes(24).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  return {
    state,
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url')
  }
}

export function validOAuthCallback(
  oauth: SessionData['oauth'],
  code: unknown,
  state: unknown,
  now = Date.now()
): oauth is NonNullable<SessionData['oauth']> {
  return Boolean(oauth && code && state === oauth.state && now - oauth.createdAt <= 10 * 60_000)
}
