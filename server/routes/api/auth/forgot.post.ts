import { defineEventHandler, readBody } from 'h3'
import { code } from '../../../utils/ids'
import { ensureClient, findUser } from '../../../utils/models'
import { cognitoError, sendCognitoError } from '../../../utils/errors'
import { shouldLogCodes } from '../../../utils/config'
import { consumeRateLimit } from '../../../utils/rate-limit'
import { replaceVerificationCode } from '../../../utils/codes'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, string>>(event)
    const client = ensureClient(body.clientId || 'default-client')
    consumeRateLimit(event, 'forgot-password-ip', '*', 30, 60 * 60_000)
    consumeRateLimit(event, 'forgot-password', `${client.id}:${body.username || ''}`, 3)
    const user = findUser(client.pool_id, body.username || '')
    if (!user) cognitoError('UserNotFoundException', 'User does not exist.')
    const value = code()
    replaceVerificationCode(client.pool_id, client.id, user.id, 'forgot', value)
    if (shouldLogCodes()) console.info(`[cognito-mock] password reset code for ${user.username}: ${value}`)
    return { codeDeliveryDetails: { Destination: user.username, DeliveryMedium: 'EMAIL', AttributeName: 'email' } }
  } catch (error) { return sendCognitoError(event, error) }
})
