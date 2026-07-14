import { db } from './db'
import { epochMs, id, json, uuid } from './ids'
import { hashPassword } from './password'
import { createSrpVerifier } from './srp'
import { callbackAllowed, isPermissive } from './config'
import { cognitoError } from './errors'

export interface PoolRow { id: string, name: string, region: string, created_at: number, updated_at: number, settings: string, private_jwk: string | null, public_jwk: string | null }
export interface ClientRow { id: string, pool_id: string, name: string, secret: string | null, callbacks: string, logouts: string, scopes: string, theme: string, created_at: number, updated_at: number }
export interface UserRow { id: string, pool_id: string, username: string, password_hash: string, srp_salt: string | null, srp_verifier: string | null, status: string, enabled: number, attributes: string, created_at: number, updated_at: number }

export function listPools() { return db().prepare('SELECT * FROM pools ORDER BY created_at').all() as unknown as PoolRow[] }
export function getPool(poolId: string) { return db().prepare('SELECT * FROM pools WHERE id=?').get(poolId) as unknown as PoolRow | undefined }

export function ensurePool(poolId = 'local-1_default') {
  let pool = getPool(poolId)
  if (!pool) {
    if (!isPermissive()) cognitoError('ResourceNotFoundException', 'User pool does not exist.')
    const timestamp = epochMs()
    db().prepare('INSERT INTO pools(id,name,region,created_at,updated_at) VALUES(?,?,?,?,?)').run(poolId, `Auto ${poolId}`, poolId.split('_')[0] || 'local-1', timestamp, timestamp)
    pool = getPool(poolId)!
  }
  return pool
}

export function getClient(clientId: string) { return db().prepare('SELECT * FROM clients WHERE id=?').get(clientId) as unknown as ClientRow | undefined }
export function listClients(poolId?: string) {
  return (poolId ? db().prepare('SELECT * FROM clients WHERE pool_id=? ORDER BY created_at').all(poolId) : db().prepare('SELECT * FROM clients ORDER BY created_at').all()) as unknown as ClientRow[]
}

export function ensureClient(clientId: string, poolId?: string) {
  let client = getClient(clientId)
  if (client) {
    if (poolId && client.pool_id !== poolId) cognitoError('ResourceNotFoundException', 'App client does not exist in this user pool.')
    return client
  }
  if (!isPermissive()) cognitoError('ResourceNotFoundException', 'App client does not exist.')
  const pools = listPools()
  const selectedPool = poolId || (pools.length === 1 ? pools[0]!.id : 'local-1_default')
  ensurePool(selectedPool)
  const timestamp = epochMs()
  db().prepare('INSERT INTO clients(id,pool_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run(clientId, selectedPool, `Auto ${clientId}`, timestamp, timestamp)
  client = getClient(clientId)!
  return client
}

export function validateManagedLoginRequest(client: ClientRow, redirectUri: string, scopes: string[], codeChallenge?: string) {
  const callbacks = json<string[]>(client.callbacks, [])
  if (!redirectUri || !callbacks.includes(redirectUri)) cognitoError('InvalidParameterException', 'Invalid redirect URI.')
  const allowedScopes = new Set(json<string[]>(client.scopes, []))
  if (scopes.some(scope => !allowedScopes.has(scope))) cognitoError('InvalidParameterException', 'Invalid OAuth scope.')
  if (!client.secret && !codeChallenge) cognitoError('InvalidParameterException', 'PKCE is required for public clients.')
  if (codeChallenge && !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) cognitoError('InvalidParameterException', 'Invalid S256 PKCE challenge.')
}

export function learnAuthorize(client: ClientRow, redirectUri: string, logout = false, scopes: string[] = []) {
  const field = logout ? 'logouts' : 'callbacks'
  const values = json<string[]>(client[field], [])
  if (!values.includes(redirectUri)) {
    if (!isPermissive() || !callbackAllowed(redirectUri)) cognitoError('InvalidParameterException', `Invalid ${logout ? 'logout' : 'redirect'} URI.`)
    values.push(redirectUri)
    try { db().prepare('INSERT OR IGNORE INTO allowed_origins(origin,created_at) VALUES(?,?)').run(new URL(redirectUri).origin, epochMs()) } catch { /* URI validation already handled */ }
  }
  const currentScopes = json<string[]>(client.scopes, [])
  for (const scope of scopes) {
    if (currentScopes.includes(scope)) continue
    if (!isPermissive()) cognitoError('InvalidParameterException', `Invalid OAuth scope: ${scope}`)
    currentScopes.push(scope)
  }
  db().prepare(`UPDATE clients SET ${field}=?, scopes=?, updated_at=? WHERE id=?`).run(JSON.stringify(values), JSON.stringify(currentScopes), epochMs(), client.id)
}

export function findUser(poolId: string, username: string) {
  const exact = db().prepare('SELECT * FROM users WHERE pool_id=? AND username=?').get(poolId, username) as unknown as UserRow | undefined
  if (exact) return exact
  const emailMatches = db().prepare('SELECT * FROM users WHERE pool_id=? AND json_extract(attributes,\'$.email\')=? LIMIT 2').all(poolId, username) as unknown as UserRow[]
  if (emailMatches.length > 1) cognitoError('InvalidParameterException', 'Multiple users share this email address.')
  return emailMatches[0]
}

export function getUserById(userId: string) { return db().prepare('SELECT * FROM users WHERE id=?').get(userId) as unknown as UserRow | undefined }
export function listUsers(poolId: string) { return db().prepare('SELECT * FROM users WHERE pool_id=? ORDER BY created_at').all(poolId) as unknown as UserRow[] }

export async function createUser(poolId: string, username: string, password: string, attributes: Record<string, string> = {}, status = 'UNCONFIRMED') {
  ensurePool(poolId)
  if (!username || password.length < 8) cognitoError('InvalidPasswordException', 'Password must contain at least 8 characters and username is required.')
  if (findUser(poolId, username)) cognitoError('UsernameExistsException', 'An account with the given username already exists.')
  if (attributes.email && findUser(poolId, attributes.email)) cognitoError('UsernameExistsException', 'An account with the given email already exists.')
  const timestamp = epochMs()
  const srp = createSrpVerifier(poolId, username, password)
  const user: UserRow = { id: uuid(), pool_id: poolId, username, password_hash: await hashPassword(password), srp_salt: srp.salt, srp_verifier: srp.verifier, status, enabled: 1, attributes: JSON.stringify(attributes), created_at: timestamp, updated_at: timestamp }
  db().prepare('INSERT INTO users(id,pool_id,username,password_hash,srp_salt,srp_verifier,status,enabled,attributes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(user.id, poolId, username, user.password_hash, srp.salt, srp.verifier, status, 1, user.attributes, timestamp, timestamp)
  return user
}

export async function updateUser(userId: string, patch: { status?: string, enabled?: boolean, password?: string, attributes?: Record<string, string> }) {
  const user = getUserById(userId)
  if (!user) cognitoError('UserNotFoundException', 'User does not exist.')
  if (patch.password !== undefined && patch.password.length < 8) cognitoError('InvalidPasswordException', 'Password must contain at least 8 characters.')
  if (patch.attributes?.email) {
    const existing = findUser(user.pool_id, patch.attributes.email)
    if (existing && existing.id !== user.id) cognitoError('UsernameExistsException', 'An account with the given email already exists.')
  }
  const attributes = patch.attributes ? { ...json<Record<string, string>>(user.attributes, {}), ...patch.attributes } : json(user.attributes, {})
  const srp = patch.password ? createSrpVerifier(user.pool_id, user.username, patch.password) : { salt: user.srp_salt, verifier: user.srp_verifier }
  db().prepare('UPDATE users SET status=?, enabled=?, password_hash=?, srp_salt=?, srp_verifier=?, attributes=?, updated_at=? WHERE id=?').run(
    patch.status ?? user.status, patch.enabled === undefined ? user.enabled : Number(patch.enabled), patch.password ? await hashPassword(patch.password) : user.password_hash,
    srp.salt, srp.verifier, JSON.stringify(attributes), epochMs(), userId)
  return getUserById(userId)!
}

export function createCode(poolId: string, clientId: string | null, userId: string, kind: string, value: string, metadata: Record<string, unknown> = {}) {
  const timestamp = epochMs()
  db().prepare('INSERT INTO codes(id,pool_id,client_id,user_id,kind,code,expires_at,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id(), poolId, clientId, userId, kind, value, timestamp + 15 * 60_000, JSON.stringify(metadata), timestamp)
}
