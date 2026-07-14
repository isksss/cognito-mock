import { createHash } from 'node:crypto'
import { SignJWT, exportJWK, generateKeyPair, importJWK, jwtVerify, type JWK } from 'jose'
import { db } from './db'
import { epochMs, id, json } from './ids'
import { getPool, getUserById } from './models'
import { publicUrl } from './config'
import { cognitoError } from './errors'
import type { H3Event } from 'h3'

export const tokenHash = (value: string) => createHash('sha256').update(value).digest('base64url')

async function poolKeys(poolId: string) {
  let pool = getPool(poolId)
  if (!pool) cognitoError('ResourceNotFoundException', 'User pool does not exist.')
  if (!pool.private_jwk || !pool.public_jwk) {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
    const privateJwk = await exportJWK(privateKey)
    const publicJwk = await exportJWK(publicKey)
    const kid = id(8)
    privateJwk.kid = publicJwk.kid = kid
    privateJwk.alg = publicJwk.alg = 'RS256'
    privateJwk.use = publicJwk.use = 'sig'
    db().prepare('UPDATE pools SET private_jwk=?, public_jwk=?, updated_at=? WHERE id=?').run(JSON.stringify(privateJwk), JSON.stringify(publicJwk), epochMs(), poolId)
    pool = getPool(poolId)!
  }
  return { privateJwk: json<JWK>(pool.private_jwk, {}), publicJwk: json<JWK>(pool.public_jwk, {}) }
}

export async function jwks(poolId: string) {
  const { publicJwk } = await poolKeys(poolId)
  return { keys: [publicJwk] }
}

export async function issueTokens(event: H3Event | undefined, poolId: string, clientId: string, userId: string, scopes: string[], nonce?: string, includeRefresh = true) {
  const user = getUserById(userId)
  if (!user || !user.enabled) cognitoError('NotAuthorizedException', 'User is disabled or missing.')
  const { privateJwk } = await poolKeys(poolId)
  const key = await importJWK(privateJwk, 'RS256')
  const issuer = `${publicUrl(event)}/${poolId}`
  const timestamp = Math.floor(Date.now() / 1000)
  const attributes = json<Record<string, string>>(user.attributes, {})
  const groups = (db().prepare('SELECT group_name FROM memberships WHERE pool_id=? AND user_id=?').all(poolId, userId) as unknown as Array<{ group_name: string }>).map(row => row.group_name)
  const common = { sub: user.id, username: user.username, 'cognito:username': user.username, ...attributes }
  const idToken = await new SignJWT({ ...common, token_use: 'id', ...(nonce ? { nonce } : {}) })
    .setProtectedHeader({ alg: 'RS256', kid: privateJwk.kid }).setIssuer(issuer).setAudience(clientId).setIssuedAt(timestamp).setExpirationTime(timestamp + 3600).sign(key)
  const accessToken = await new SignJWT({ ...common, token_use: 'access', client_id: clientId, scope: scopes.join(' '), ...(groups.length ? { 'cognito:groups': groups } : {}) })
    .setProtectedHeader({ alg: 'RS256', kid: privateJwk.kid }).setIssuer(issuer).setIssuedAt(timestamp).setJti(id()).setExpirationTime(timestamp + 3600).sign(key)
  let refreshToken: string | undefined
  if (includeRefresh) {
    refreshToken = id(32)
    db().prepare('INSERT INTO tokens(id,pool_id,client_id,user_id,kind,token_hash,scopes,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id(), poolId, clientId, userId, 'refresh', tokenHash(refreshToken), JSON.stringify(scopes), epochMs() + 30 * 24 * 3600_000, epochMs())
  }
  return { AccessToken: accessToken, IdToken: idToken, RefreshToken: refreshToken, ExpiresIn: 3600, TokenType: 'Bearer' }
}

export async function verifyAccessToken(token: string) {
  const payloadPart = token.split('.')[1]
  if (!payloadPart) cognitoError('NotAuthorizedException', 'Invalid access token.')
  let payload: Record<string, unknown>
  try { payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString()) } catch { cognitoError('NotAuthorizedException', 'Invalid access token.') }
  const issuer = String(payload!.iss || '')
  const poolId = issuer.split('/').pop() || ''
  const pool = getPool(poolId)
  if (!pool?.public_jwk) cognitoError('NotAuthorizedException', 'Invalid access token.')
  const key = await importJWK(json<JWK>(pool.public_jwk, {}), 'RS256')
  try {
    const verified = await jwtVerify(token, key, { issuer })
    if (verified.payload.token_use !== 'access') throw new Error('token_use')
    return verified.payload
  } catch { cognitoError('NotAuthorizedException', 'Invalid or expired access token.') }
}

export function createOpaqueToken(kind: 'authorization_code' | 'session', poolId: string, clientId: string, userId: string, options: { scopes?: string[], nonce?: string, redirectUri?: string, challenge?: string, ttlMs?: number, metadata?: Record<string, unknown> } = {}) {
  const raw = id(32)
  db().prepare('INSERT INTO tokens(id,pool_id,client_id,user_id,kind,token_hash,scopes,nonce,redirect_uri,code_challenge,expires_at,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id(), poolId, clientId, userId, kind, tokenHash(raw), JSON.stringify(options.scopes || []), options.nonce || null, options.redirectUri || null, options.challenge || null, epochMs() + (options.ttlMs || 5 * 60_000), JSON.stringify(options.metadata || {}), epochMs())
  return raw
}

export function consumeOpaqueToken(raw: string, kind: string) {
  const row = db().prepare('SELECT * FROM tokens WHERE token_hash=? AND kind=?').get(tokenHash(raw), kind) as unknown as Record<string, unknown> | undefined
  if (!row || Number(row.expires_at) < epochMs() || row.revoked_at) cognitoError('NotAuthorizedException', `Invalid or expired ${kind}.`)
  if (kind === 'authorization_code') db().prepare('UPDATE tokens SET revoked_at=? WHERE id=?').run(epochMs(), String(row.id))
  return row
}

export function revokeOpaqueToken(raw: string) {
  db().prepare('UPDATE tokens SET revoked_at=? WHERE token_hash=?').run(epochMs(), tokenHash(raw))
}
