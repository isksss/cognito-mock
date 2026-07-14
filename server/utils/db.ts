import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

let database: DatabaseSync | undefined

export function db() {
  if (database) return database
  const configured = process.env.DATABASE_PATH || './data/cognito-mock.sqlite'
  const path = configured === ':memory:' ? configured : resolve(configured)
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  database = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 5000 })
  database.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;')
  migrate(database)
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
    CREATE INDEX IF NOT EXISTS idx_clients_pool ON clients(pool_id);
    CREATE INDEX IF NOT EXISTS idx_users_pool ON users(pool_id);
    CREATE INDEX IF NOT EXISTS idx_codes_lookup ON codes(kind, code, expires_at);
    CREATE INDEX IF NOT EXISTS idx_tokens_lookup ON tokens(id, kind, expires_at);
  `)
  for (const statement of [
    'ALTER TABLE users ADD COLUMN srp_salt TEXT',
    'ALTER TABLE users ADD COLUMN srp_verifier TEXT'
  ]) {
    try { sql.exec(statement) } catch { /* already migrated */ }
  }
}

export function resetDbForTests() {
  database?.close()
  database = undefined
}
