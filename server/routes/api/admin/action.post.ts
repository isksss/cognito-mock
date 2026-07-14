import { defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../utils/admin'
import { db } from '../../../utils/db'
import { cognitoError, sendCognitoError } from '../../../utils/errors'
import { epochMs, id } from '../../../utils/ids'
import { createUser, ensureClient, ensurePool, findUser } from '../../../utils/models'

export default defineEventHandler(async event => {
  try {
    requireAdmin(event)
    const body = await readBody<Record<string, any>>(event)
    const timestamp = epochMs()
    switch (body.action) {
      case 'createPool': ensurePool(body.id || `local-1_${id(7)}`); return {}
      case 'createClient': { const pool = ensurePool(body.poolId); const clientId = body.id || id(13); db().prepare('INSERT INTO clients(id,pool_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run(clientId, pool.id, body.name || clientId, timestamp, timestamp); return { clientId } }
      case 'createUser': return { user: await createUser(body.poolId, body.username, body.password, { email: body.email || body.username }, body.confirmed === false ? 'UNCONFIRMED' : 'CONFIRMED') }
      case 'createGroup': ensurePool(body.poolId); db().prepare('INSERT INTO groups_table(pool_id,name,description,created_at) VALUES(?,?,?,?)').run(body.poolId, body.name, body.description || null, timestamp); return {}
      case 'updateTheme': ensureClient(body.clientId); db().prepare('UPDATE clients SET theme=?,updated_at=? WHERE id=?').run(JSON.stringify(body.theme || {}), timestamp, body.clientId); return {}
      case 'addOrigin': db().prepare('INSERT OR IGNORE INTO allowed_origins(origin,created_at) VALUES(?,?)').run(body.origin, timestamp); return {}
      case 'deleteUser': { const user = findUser(body.poolId, body.username); if (!user) cognitoError('UserNotFoundException', 'User does not exist.'); db().prepare('DELETE FROM users WHERE id=?').run(user.id); return {} }
      case 'clearEvents': db().prepare('DELETE FROM cors_events').run(); return {}
      default: cognitoError('InvalidParameterException', 'Unknown admin action.')
    }
  } catch (error) { return sendCognitoError(event, error) }
})
