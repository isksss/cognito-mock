import { defineEventHandler, readBody } from 'h3'
import { code } from '../../../utils/ids'
import { createUser, ensureClient } from '../../../utils/models'
import { sendCognitoError } from '../../../utils/errors'
import { shouldLogCodes } from '../../../utils/config'
import { consumeRateLimit } from '../../../utils/rate-limit'
import { replaceVerificationCode } from '../../../utils/codes'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, string>>(event)
    const client = ensureClient(body.clientId || 'default-client')
    consumeRateLimit(event, 'signup-ip', '*', 30, 60 * 60_000)
    consumeRateLimit(event, 'signup', `${client.id}:${body.username || ''}`, 5, 60 * 60_000)
    const user = await createUser(client.pool_id, body.username || '', body.password || '', { email: body.email || body.username || '' })
    const confirmationCode = code()
    replaceVerificationCode(client.pool_id, client.id, user.id, 'signup', confirmationCode)
    if (shouldLogCodes()) console.info(`[cognito-mock] signup code for ${user.username}: ${confirmationCode}`)
    return { userSub: user.id, codeDeliveryDetails: { Destination: body.email || body.username, DeliveryMedium: 'EMAIL', AttributeName: 'email' } }
  } catch (error) { return sendCognitoError(event, error) }
})
