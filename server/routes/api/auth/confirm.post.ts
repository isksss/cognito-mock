import { defineEventHandler, readBody } from 'h3'
import { ensureClient, findUser, updateUser } from '../../../utils/models'
import { cognitoError, sendCognitoError } from '../../../utils/errors'
import { consumeVerificationCode } from '../../../utils/codes'
import { assertRateLimit, clearRateLimit, recordRateLimitFailure } from '../../../utils/rate-limit'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, string>>(event)
    const client = ensureClient(body.clientId || 'default-client')
    const subject = `${client.id}:${body.username || ''}`
    assertRateLimit(event, 'confirm-signup', subject, 5)
    const user = findUser(client.pool_id, body.username || '')
    if (!user) cognitoError('UserNotFoundException', 'User does not exist.')
    if (!consumeVerificationCode(user.id, 'signup', body.code || '')) {
      recordRateLimitFailure(event, 'confirm-signup', subject)
      cognitoError('CodeMismatchException', 'Invalid verification code provided.')
    }
    clearRateLimit(event, 'confirm-signup', subject)
    await updateUser(user.id, { status: 'CONFIRMED', attributes: { email_verified: 'true' } })
    return {}
  } catch (error) { return sendCognitoError(event, error) }
})
