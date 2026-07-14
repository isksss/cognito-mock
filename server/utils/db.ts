import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

let database: DatabaseSync | undefined
let nextCleanupAt = 0

const CLEANUP_INTERVAL_MS = 5 * 60_000
const CORS_RETENTION_MS = 7 * 24 * 60 * 60_000
const DEFAULT_CORS_EVENT_LIMIT = 1_000

export function db() {
  if (database) {
    cleanupExpired(database)
    return database
  }
  const configured = process.env.DATABASE_PATH || './data/cognito-mock.sqlite'
  const path = configured === ':memory:' ? configured : resolve(configured)
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  database = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 5000 })
  database.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;')
  migrate(database)
  cleanupExpired(database, true)
  return database
}

function migrate(sql: DatabaseSync) {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS pools (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT NOT NULL DEFAULT 'local-1',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      settings TEXT NOT NULL DEFAULT '{}', private_jwk TEXT, public_jwk TEXT
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY, pool_id TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
      name TEXT NOT NULL, secret TEXT, callbacks TEXT NOT NULL DEFAULT '[]',
      logouts TEXT NOT NULL DEFAULT '[]', scopes TEXT NOT NULL DEFAULT '["openid","email","profile"]',
      theme TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, pool_id TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
      username TEXT NOT NULL, password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'UNCONFIRMED',
      enabled INTEGER NOT NULL DEFAULT 1, attributes TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(pool_id, username)
    );
    CREATE TABLE IF NOT EXISTS groups_table (
      pool_id TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE, name TEXT NOT NULL,
      description TEXT, precedence INTEGER, role_arn TEXT, created_at INTEGER NOT NULL,
      PRIMARY KEY(pool_id, name)
    );
    CREATE TABLE IF NOT EXISTS memberships (
      pool_id TEXT NOT NULL, group_name TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(pool_id, group_name, user_id),
      FOREIGN KEY(pool_id, group_name) REFERENCES groups_table(pool_id, name) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS codes (
      id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, client_id TEXT, user_id TEXT,
      kind TEXT NOT NULL, code TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER,
      metadata TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, client_id TEXT NOT NULL, user_id TEXT,
      kind TEXT NOT NULL, token_hash TEXT, scopes TEXT NOT NULL DEFAULT '[]', nonce TEXT,
      redirect_uri TEXT, code_challenge TEXT, expires_at INTEGER NOT NULL, revoked_at INTEGER,
      metadata TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, client_id TEXT NOT NULL, user_id TEXT,
      data TEXT NOT NULL DEFAULT '{}', expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cors_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, origin TEXT NOT NULL, path TEXT NOT NULL,
      allowed INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS allowed_origins (
      origin TEXT PRIMARY KEY, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_clients_pool ON clients(pool_id);
    CREATE INDEX IF NOT EXISTS idx_users_pool ON users(pool_id);
    CREATE INDEX IF NOT EXISTS idx_users_pool_email ON users(pool_id, json_extract(attributes,'$.email'));
    CREATE INDEX IF NOT EXISTS idx_codes_user_kind_code ON codes(user_id, kind, code, used_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_codes_expiry ON codes(expires_at);
    CREATE INDEX IF NOT EXISTS idx_tokens_hash_kind ON tokens(token_hash, kind);
    CREATE INDEX IF NOT EXISTS idx_tokens_expiry ON tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_cors_events_created ON cors_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON rate_limits(expires_at);
  `)
  for (const statement of [
    'ALTER TABLE users ADD COLUMN srp_salt TEXT',
    'ALTER TABLE users ADD COLUMN srp_verifier TEXT'
  ]) {
    try {
      sql.exec(statement)
    } catch (error) {
      if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) throw error
    }
  }
}

export function cleanupExpired(sql = db(), force = false) {
  const timestamp = Date.now()
  if (!force && timestamp < nextCleanupAt) return
  nextCleanupAt = timestamp + CLEANUP_INTERVAL_MS
  sql.exec('BEGIN')
  try {
    sql.prepare('DELETE FROM tokens WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)').run(timestamp, timestamp - CLEANUP_INTERVAL_MS)
    sql.prepare('DELETE FROM codes WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)').run(timestamp, timestamp - CLEANUP_INTERVAL_MS)
    sql.prepare('DELETE FROM sessions WHERE expires_at < ?').run(timestamp)
    sql.prepare('DELETE FROM cors_events WHERE created_at < ?').run(timestamp - CORS_RETENTION_MS)
    sql.prepare('DELETE FROM rate_limits WHERE expires_at < ?').run(timestamp)
    trimCorsEvents(sql)
    sql.exec('COMMIT')
  } catch (error) {
    sql.exec('ROLLBACK')
    throw error
  }
}

export function trimCorsEvents(sql = db()) {
  const configured = Number.parseInt(process.env.CORS_EVENT_LIMIT || '', 10)
  const limit = Number.isSafeInteger(configured) && configured >= 0 ? configured : DEFAULT_CORS_EVENT_LIMIT
  sql.prepare('DELETE FROM cors_events WHERE id IN (SELECT id FROM cors_events ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?)').run(limit)
}

export function resetDbForTests() {
  database?.close()
  database = undefined
  nextCleanupAt = 0
}
