import { defineEventHandler, readBody } from 'h3'
import { db } from '../../../utils/db'
import { epochMs } from '../../../utils/ids'
import { ensureClient, findUser, updateUser } from '../../../utils/models'
import { cognitoError, sendCognitoError } from '../../../utils/errors'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, string>>(event)
    const client = ensureClient(body.clientId || 'default-client')
    const user = findUser(client.pool_id, body.username || '')
    if (!user) cognitoError('UserNotFoundException', 'User does not exist.')
    const record = db().prepare('SELECT * FROM codes WHERE user_id=? AND kind=? AND code=? AND used_at IS NULL ORDER BY created_at DESC').get(user.id, 'forgot', body.code || '') as unknown as { id: string, expires_at: number } | undefined
    if (!record || record.expires_at < epochMs()) cognitoError('CodeMismatchException', 'Invalid verification code provided.')
    db().prepare('UPDATE codes SET used_at=? WHERE id=?').run(epochMs(), record.id)
    updateUser(user.id, { password: body.password || '', status: 'CONFIRMED' })
    return {}
  } catch (error) { return sendCognitoError(event, error) }
})
