import { defineEventHandler, readBody } from 'h3'
import { ensureClient, findUser } from '../../../utils/models'
import { verifyPassword } from '../../../utils/password'
import { cognitoError, sendCognitoError } from '../../../utils/errors'
import { createOpaqueToken } from '../../../utils/tokens'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, string>>(event)
    const client = ensureClient(body.clientId || 'default-client')
    const user = findUser(client.pool_id, body.username || '')
    if (!user || !verifyPassword(body.password || '', user.password_hash)) cognitoError('NotAuthorizedException', 'Incorrect username or password.')
    if (!user.enabled) cognitoError('NotAuthorizedException', 'User is disabled.')
    if (user.status === 'UNCONFIRMED') cognitoError('UserNotConfirmedException', 'User is not confirmed.')
    if (user.status === 'FORCE_CHANGE_PASSWORD') return { challenge: 'NEW_PASSWORD_REQUIRED', username: user.username }
    const scopes = (body.scope || 'openid').split(/[ +]/).filter(Boolean)
    const code = createOpaqueToken('authorization_code', client.pool_id, client.id, user.id, {
      scopes, nonce: body.nonce, redirectUri: body.redirectUri, challenge: body.codeChallenge
    })
    const destination = new URL(body.redirectUri || 'http://localhost:3001/callback')
    destination.searchParams.set('code', code)
    if (body.state) destination.searchParams.set('state', body.state)
    return { redirectTo: destination.toString() }
  } catch (error) { return sendCognitoError(event, error) }
})
