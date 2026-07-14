import { defineEventHandler, readBody } from 'h3'
import { code } from '../../../utils/ids'
import { createCode, createUser, ensureClient } from '../../../utils/models'
import { sendCognitoError } from '../../../utils/errors'
import { shouldLogCodes } from '../../../utils/config'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, string>>(event)
    const client = ensureClient(body.clientId || 'default-client')
    const user = createUser(client.pool_id, body.username || '', body.password || '', { email: body.email || body.username || '' })
    const confirmationCode = code()
    createCode(client.pool_id, client.id, user.id, 'signup', confirmationCode)
    if (shouldLogCodes()) console.info(`[cognito-mock] signup code for ${user.username}: ${confirmationCode}`)
    return { userSub: user.id, codeDeliveryDetails: { Destination: body.email || body.username, DeliveryMedium: 'EMAIL', AttributeName: 'email' } }
  } catch (error) { return sendCognitoError(event, error) }
})
