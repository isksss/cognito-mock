import { defineEventHandler, getRouterParam } from 'h3'
import { ensureClient } from '../../../../utils/models'
import { json } from '../../../../utils/ids'

export default defineEventHandler(event => {
  const client = ensureClient(getRouterParam(event, 'id') || 'default-client')
  return { id: client.id, poolId: client.pool_id, name: client.name, theme: json(client.theme, {}) }
})
