import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../../utils/admin'
import { db } from '../../../utils/db'
import { json } from '../../../utils/ids'
import { listClients, listPools, listUsers } from '../../../utils/models'

export default defineEventHandler(event => {
  requireAdmin(event)
  const pools = listPools().map(pool => ({ ...pool, settings: json(pool.settings, {}) }))
  const clients = listClients().map(client => ({ ...client, callbacks: json(client.callbacks, []), logouts: json(client.logouts, []), scopes: json(client.scopes, []), theme: json(client.theme, {}) }))
  const users = pools.flatMap(pool => listUsers(pool.id).map(user => ({ ...user, password_hash: undefined, srp_verifier: undefined, attributes: json(user.attributes, {}) })))
  const groups = db().prepare('SELECT * FROM groups_table ORDER BY pool_id,name').all()
  const codes = db().prepare('SELECT c.*,u.username FROM codes c LEFT JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC LIMIT 100').all()
  const cors = db().prepare('SELECT * FROM cors_events ORDER BY created_at DESC LIMIT 100').all()
  const origins = db().prepare('SELECT * FROM allowed_origins ORDER BY origin').all()
  return { pools, clients, users, groups, codes, cors, origins }
})
