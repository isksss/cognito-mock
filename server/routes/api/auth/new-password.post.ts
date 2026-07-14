import { defineEventHandler, readBody } from 'h3'
import { createOpaqueToken } from '../../../utils/tokens'
import { ensureClient, findUser, updateUser } from '../../../utils/models'
import { cognitoError, sendCognitoError } from '../../../utils/errors'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, string>>(event)
    const client = ensureClient(body.clientId || 'default-client')
    const user = findUser(client.pool_id, body.username || '')
    if (!user || user.status !== 'FORCE_CHANGE_PASSWORD') cognitoError('NotAuthorizedException', 'Password change challenge is not active.')
    updateUser(user.id, { password: body.password || '', status: 'CONFIRMED' })
    const authCode = createOpaqueToken('authorization_code', client.pool_id, client.id, user.id, { scopes: (body.scope || 'openid').split(/[ +]/), nonce: body.nonce, redirectUri: body.redirectUri, challenge: body.codeChallenge })
    const destination = new URL(body.redirectUri || 'http://localhost:3001/callback'); destination.searchParams.set('code', authCode); if (body.state) destination.searchParams.set('state', body.state)
    return { redirectTo: destination.toString() }
  } catch (error) { return sendCognitoError(event, error) }
})
