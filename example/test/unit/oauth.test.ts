import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createPkce, validOAuthCallback } from '../../server/utils/oauth'

describe('OAuth PKCE', () => {
  it('creates an S256 verifier and challenge', () => {
    const pkce = createPkce()
    expect(pkce.state.length).toBeGreaterThanOrEqual(32)
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43)
    expect(pkce.challenge).toBe(createHash('sha256').update(pkce.verifier).digest('base64url'))
  })

  it('accepts only a matching, unexpired state', () => {
    const now = 1_000_000
    const oauth = { state: 'expected', verifier: 'verifier', createdAt: now - 60_000 }
    expect(validOAuthCallback(oauth, 'code', 'expected', now)).toBe(true)
    expect(validOAuthCallback(oauth, 'code', 'wrong', now)).toBe(false)
    expect(validOAuthCallback({ ...oauth, createdAt: now - 10 * 60_000 - 1 }, 'code', 'expected', now)).toBe(false)
  })
})
