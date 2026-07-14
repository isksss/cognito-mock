import { beforeAll, describe, expect, it } from 'vitest'
import { decodeJwt } from 'jose'
import { createHmac } from 'node:crypto'
import { AuthenticationHelper } from 'amazon-cognito-identity-js'
import { hashPassword, verifyPassword } from '../server/utils/password'
import { createUser, ensureClient, ensurePool, findUser, updateUser } from '../server/utils/models'
import { createOpaqueToken, consumeOpaqueToken, issueTokens, jwks, revokeOpaqueToken, verifyAccessToken } from '../server/utils/tokens'
import { createSrpChallenge, createSrpVerifier, verifySrpResponse } from '../server/utils/srp'
import { callbackAllowed, allowedOrigin } from '../server/utils/config'
import { code, epochMs } from '../server/utils/ids'
import { cleanupExpired, db, trimCorsEvents } from '../server/utils/db'
import { consumeVerificationCode, replaceVerificationCode } from '../server/utils/codes'
import { assertRateLimit, clearRateLimit, recordRateLimitFailure } from '../server/utils/rate-limit'
import type { H3Event } from 'h3'

beforeAll(() => { process.env.DATABASE_PATH = ':memory:'; process.env.COGNITO_MOCK_MODE = 'permissive'; process.env.PUBLIC_URL = 'http://localhost:3000' })

describe('core store and tokens', () => {
  it('hashes passwords asynchronously with a unique salt', async () => {
    const first = await hashPassword('Password123!'); const second = await hashPassword('Password123!')
    expect(first).not.toBe(second); expect(await verifyPassword('Password123!', first)).toBe(true); expect(await verifyPassword('bad', first)).toBe(false)
  })

  it('auto provisions pools and clients', () => {
    const pool = ensurePool('ap-northeast-1_example')
    const client = ensureClient('example-client', pool.id)
    expect(client.pool_id).toBe(pool.id)
    expect(() => ensureClient(client.id, 'ap-northeast-1_other')).toThrowError('App client does not exist in this user pool.')
  })

  it('enforces strict mode for unknown resources', () => {
    process.env.COGNITO_MOCK_MODE = 'strict'
    expect(() => ensurePool('ap-northeast-1_unknown-strict')).toThrowError('User pool does not exist.')
    process.env.COGNITO_MOCK_MODE = 'permissive'
  })

  it('allows loopback origins and configured callback hosts', () => {
    process.env.ALLOWED_ORIGINS = 'https://frontend.example.test'
    process.env.ALLOWED_CALLBACK_HOSTS = 'callback.example.test'
    expect(allowedOrigin('http://localhost:9876')).toBe(true)
    expect(allowedOrigin('https://frontend.example.test')).toBe(true)
    expect(allowedOrigin('https://blocked.example.test')).toBe(false)
    expect(callbackAllowed('https://callback.example.test/auth/callback')).toBe(true)
  })

  it('rejects duplicate users and rotates password/SRP material', async () => {
    const pool = ensurePool('ap-northeast-1_users')
    const user = await createUser(pool.id, 'rotate@example.com', 'Password123!', { email: 'rotate@example.com' }, 'CONFIRMED')
    await expect(createUser(pool.id, user.username, 'Password123!')).rejects.toThrowError('already exists')
    await expect(createUser(pool.id, 'other-username', 'Password123!', { email: 'rotate@example.com' })).rejects.toThrowError('given email already exists')
    const oldVerifier = user.srp_verifier
    const updated = await updateUser(user.id, { password: 'ChangedPassword123!' })
    expect(updated.srp_verifier).not.toBe(oldVerifier)
    expect(await verifyPassword('ChangedPassword123!', updated.password_hash)).toBe(true)
  })

  it('persists users and issues cognito-shaped JWTs', async () => {
    const pool = ensurePool('ap-northeast-1_tokens'); const client = ensureClient('token-client', pool.id)
    const user = await createUser(pool.id, 'dev@example.com', 'Password123!', { email: 'dev@example.com', email_verified: 'true' }, 'CONFIRMED')
    expect(findUser(pool.id, 'dev@example.com')?.id).toBe(user.id)
    const tokens = await issueTokens(undefined, pool.id, client.id, user.id, ['openid', 'email'])
    expect(decodeJwt(tokens.IdToken).token_use).toBe('id')
    expect(decodeJwt(tokens.AccessToken).client_id).toBe(client.id)
    expect((await jwks(pool.id)).keys[0]?.alg).toBe('RS256')
    expect((await verifyAccessToken(tokens.AccessToken)).sub).toBe(user.id)
    const jwtParts = tokens.AccessToken.split('.')
    jwtParts[2] = `${jwtParts[2]![0] === 'a' ? 'b' : 'a'}${jwtParts[2]!.slice(1)}`
    await expect(verifyAccessToken(jwtParts.join('.'))).rejects.toThrow('Invalid or expired access token')
  })

  it('does not allow stored attributes to override reserved JWT claims', async () => {
    const pool = ensurePool('ap-northeast-1_reserved-claims'); const client = ensureClient('reserved-claims-client', pool.id)
    const user = await createUser(pool.id, 'claims@example.com', 'Password123!', {
      sub: 'victim-user-id', username: 'victim@example.com', 'cognito:username': 'victim@example.com', email: 'claims@example.com'
    }, 'CONFIRMED')
    const tokens = await issueTokens(undefined, pool.id, client.id, user.id, ['openid'])
    expect(decodeJwt(tokens.AccessToken)).toMatchObject({ sub: user.id, username: user.username, 'cognito:username': user.username })
    expect(decodeJwt(tokens.IdToken)).toMatchObject({ sub: user.id, username: user.username, 'cognito:username': user.username })
  })

  it('consumes authorization codes once and revokes refresh-like tokens', async () => {
    const pool = ensurePool('ap-northeast-1_opaque'); const client = ensureClient('opaque-client', pool.id)
    const user = await createUser(pool.id, 'opaque@example.com', 'Password123!', {}, 'CONFIRMED')
    const authorizationCode = createOpaqueToken('authorization_code', pool.id, client.id, user.id)
    expect(consumeOpaqueToken(authorizationCode, 'authorization_code').user_id).toBe(user.id)
    expect(() => consumeOpaqueToken(authorizationCode, 'authorization_code')).toThrowError('Invalid or expired authorization_code')
    const opaque = createOpaqueToken('session', pool.id, client.id, user.id)
    expect(consumeOpaqueToken(opaque, 'session').user_id).toBe(user.id)
    revokeOpaqueToken(opaque)
    expect(() => consumeOpaqueToken(opaque, 'session')).toThrowError('Invalid or expired session')
  })

  it('generates secure six-digit codes and invalidates older codes on resend', async () => {
    expect(Array.from({ length: 100 }, code).every(value => /^\d{6}$/.test(value))).toBe(true)
    const pool = ensurePool('ap-northeast-1_codes'); const client = ensureClient('codes-client', pool.id)
    const user = await createUser(pool.id, 'codes@example.com', 'Password123!', {}, 'CONFIRMED')
    replaceVerificationCode(pool.id, client.id, user.id, 'forgot', '111111')
    replaceVerificationCode(pool.id, client.id, user.id, 'forgot', '222222')
    expect(consumeVerificationCode(user.id, 'forgot', '111111')).toBe(false)
    expect(consumeVerificationCode(user.id, 'forgot', '222222')).toBe(true)
    expect(consumeVerificationCode(user.id, 'forgot', '222222')).toBe(false)
  })

  it('limits repeated failures by IP and user', () => {
    const event = { node: { req: { socket: { remoteAddress: '127.0.0.42' } } } } as unknown as H3Event
    const subject = 'client:limited@example.com'
    clearRateLimit(event, 'login', subject)
    for (let attempt = 0; attempt < 5; attempt++) recordRateLimitFailure(event, 'login', subject)
    expect(() => assertRateLimit(event, 'login', subject, 5)).toThrowError('Too many attempts')
    clearRateLimit(event, 'login', subject)
    expect(() => assertRateLimit(event, 'login', subject, 5)).not.toThrow()
  })

  it('cleans expired records and caps CORS event history', () => {
    const timestamp = epochMs()
    db().prepare("INSERT INTO sessions(id,pool_id,client_id,user_id,expires_at,created_at) VALUES('expired-session','pool','client',NULL,?,?)").run(timestamp - 1, timestamp - 1)
    db().prepare("INSERT INTO cors_events(origin,path,allowed,created_at) VALUES('https://one.test','/',1,?),('https://two.test','/',1,?)").run(timestamp, timestamp + 1)
    process.env.CORS_EVENT_LIMIT = '1'
    cleanupExpired(db(), true)
    trimCorsEvents()
    expect(db().prepare("SELECT id FROM sessions WHERE id='expired-session'").get()).toBeUndefined()
    expect((db().prepare('SELECT COUNT(*) AS count FROM cors_events').get() as { count: number }).count).toBe(1)
    delete process.env.CORS_EVENT_LIMIT
  })

  it('validates proofs generated by the Cognito JavaScript SRP client', async () => {
    const poolId = 'ap-northeast-1_srpclient'
    const poolName = 'srpclient'
    const username = 'srp@example.com'
    const password = 'Password123!'
    const verifier = createSrpVerifier(poolId, username, password)
    const challenge = createSrpChallenge(verifier.verifier)
    const helper = new AuthenticationHelper(poolName) as any
    const BigInteger = helper.N.constructor
    const A = await new Promise<any>((resolve, reject) => helper.getLargeAValue((error: Error | null, value: unknown) => error ? reject(error) : resolve(value)))
    const key = await new Promise<Buffer>((resolve, reject) => helper.getPasswordAuthenticationKey(username, password, new BigInteger(challenge.B, 16), new BigInteger(verifier.salt, 16), (error: Error | null, value: Buffer) => error ? reject(error) : resolve(value)))
    const timestamp = 'Tue Jul 14 23:00:00 UTC 2026'
    const message = Buffer.concat([Buffer.from(poolName), Buffer.from(username), Buffer.from(challenge.secretBlock, 'base64'), Buffer.from(timestamp)])
    const signature = createHmac('sha256', key).update(message).digest('base64')
    expect(verifySrpResponse({ poolId, username, verifier: verifier.verifier, b: challenge.b, B: challenge.B, A: A.toString(16), secretBlock: challenge.secretBlock, timestamp, signature })).toBe(true)
  })
})
