import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { defineNitroPlugin } from 'nitropack/runtime'
import { db } from '../utils/db'
import { epochMs } from '../utils/ids'
import { createUser, ensureClient, ensurePool, findUser, getClient } from '../utils/models'

interface SeedClient { id: string, name?: string, secret?: string, callbacks?: string[], logouts?: string[], scopes?: string[], theme?: Record<string, unknown> }
interface SeedUser { username: string, password: string, confirmed?: boolean, attributes?: Record<string, string>, groups?: string[] }
interface SeedPool { id: string, name?: string, clients?: SeedClient[], users?: SeedUser[], groups?: Array<{ name: string, description?: string }> }

export default defineNitroPlugin(async () => {
  const path = process.env.CONFIG_PATH
  if (!path || !existsSync(path)) return
  const config = parse(readFileSync(path, 'utf8')) as { pools?: SeedPool[] }
  for (const seedPool of config.pools || []) {
    const pool = ensurePool(seedPool.id)
    if (seedPool.name) db().prepare('UPDATE pools SET name=?,updated_at=? WHERE id=?').run(seedPool.name, epochMs(), pool.id)
    for (const seedClient of seedPool.clients || []) {
      if (!getClient(seedClient.id)) ensureClient(seedClient.id, pool.id)
      db().prepare('UPDATE clients SET name=?,secret=?,callbacks=?,logouts=?,scopes=?,theme=?,updated_at=? WHERE id=?').run(
        seedClient.name || seedClient.id, seedClient.secret || null, JSON.stringify(seedClient.callbacks || []), JSON.stringify(seedClient.logouts || []), JSON.stringify(seedClient.scopes || ['openid', 'email', 'profile']), JSON.stringify(seedClient.theme || {}), epochMs(), seedClient.id)
    }
    for (const group of seedPool.groups || []) db().prepare('INSERT INTO groups_table(pool_id,name,description,created_at) VALUES(?,?,?,?) ON CONFLICT(pool_id,name) DO UPDATE SET description=excluded.description').run(pool.id, group.name, group.description || null, epochMs())
    for (const seedUser of seedPool.users || []) {
      let user = findUser(pool.id, seedUser.username)
      if (!user) user = await createUser(pool.id, seedUser.username, seedUser.password, seedUser.attributes || {}, seedUser.confirmed === false ? 'UNCONFIRMED' : 'CONFIRMED')
      for (const group of seedUser.groups || []) db().prepare('INSERT OR IGNORE INTO memberships(pool_id,group_name,user_id) VALUES(?,?,?)').run(pool.id, group, user.id)
    }
  }
  console.info(`[cognito-mock] loaded configuration from ${path}`)
})
