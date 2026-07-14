import { defineEventHandler, readBody } from 'h3'
import { createOpaqueToken } from '../../../utils/tokens'
import { getUserById, updateUser } from '../../../utils/models'
import { cognitoError, sendCognitoError } from '../../../utils/errors'
import { consumeChallengeSession } from '../../../utils/sessions'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, string>>(event)
    const session = consumeChallengeSession(body.session || '', 'NEW_PASSWORD_REQUIRED')
    const user = getUserById(session.userId)
    if (!user || !user.enabled || user.pool_id !== session.poolId || user.status !== 'FORCE_CHANGE_PASSWORD') cognitoError('NotAuthorizedException', 'Password change challenge is not active.')
    const scopes = Array.isArray(session.data.scopes) ? session.data.scopes.map(String) : ['openid']
    const redirectUri = String(session.data.redirectUri || 'http://localhost:3001/callback')
    await updateUser(user.id, { password: body.password || '', status: 'CONFIRMED' })
    const authCode = createOpaqueToken('authorization_code', session.poolId, session.clientId, user.id, {
      scopes,
      nonce: String(session.data.nonce || '') || undefined,
      redirectUri,
      challenge: String(session.data.codeChallenge || '') || undefined
    })
    const destination = new URL(redirectUri)
    destination.searchParams.set('code', authCode)
    if (session.data.state) destination.searchParams.set('state', String(session.data.state))
    return { redirectTo: destination.toString() }
  } catch (error) { return sendCognitoError(event, error) }
})
