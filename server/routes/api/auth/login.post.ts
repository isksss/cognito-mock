import { defineEventHandler, readBody } from 'h3'
import { ensureClient, findUser, validateManagedLoginRequest } from '../../../utils/models'
import { verifyPassword } from '../../../utils/password'
import { cognitoError, sendCognitoError } from '../../../utils/errors'
import { createOpaqueToken } from '../../../utils/tokens'
import { assertRateLimit, clearRateLimit, consumeRateLimit, recordRateLimitFailure } from '../../../utils/rate-limit'
import { createChallengeSession } from '../../../utils/sessions'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, string>>(event)
    const client = ensureClient(body.clientId || 'default-client')
    consumeRateLimit(event, 'login-ip', '*', 60, 60_000)
    const subject = `${client.id}:${body.username || ''}`
    assertRateLimit(event, 'login', subject, 5)
    const user = findUser(client.pool_id, body.username || '')
    if (!user || !await verifyPassword(body.password || '', user.password_hash)) {
      recordRateLimitFailure(event, 'login', subject)
      cognitoError('NotAuthorizedException', 'Incorrect username or password.')
    }
    clearRateLimit(event, 'login', subject)
    if (!user.enabled) cognitoError('NotAuthorizedException', 'User is disabled.')
    if (user.status === 'UNCONFIRMED') cognitoError('UserNotConfirmedException', 'User is not confirmed.')
    const scopes = (body.scope || 'openid').split(/[ +]/).filter(Boolean)
    validateManagedLoginRequest(client, body.redirectUri || 'http://localhost:3001/callback', scopes, body.codeChallenge || undefined)
    if (user.status === 'FORCE_CHANGE_PASSWORD') {
      const session = createChallengeSession(client.pool_id, client.id, user.id, {
        challengeName: 'NEW_PASSWORD_REQUIRED',
        scopes,
        nonce: body.nonce || '',
        redirectUri: body.redirectUri || 'http://localhost:3001/callback',
        state: body.state || '',
        codeChallenge: body.codeChallenge || ''
      })
      return { challenge: 'NEW_PASSWORD_REQUIRED', username: user.username, session }
    }
    const code = createOpaqueToken('authorization_code', client.pool_id, client.id, user.id, {
      scopes, nonce: body.nonce, redirectUri: body.redirectUri, challenge: body.codeChallenge
    })
    const destination = new URL(body.redirectUri || 'http://localhost:3001/callback')
    destination.searchParams.set('code', code)
    if (body.state) destination.searchParams.set('state', body.state)
    return { redirectTo: destination.toString() }
  } catch (error) { return sendCognitoError(event, error) }
})
