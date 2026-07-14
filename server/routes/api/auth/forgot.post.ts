import { defineEventHandler, readBody } from 'h3'
import { code } from '../../../utils/ids'
import { createCode, ensureClient, findUser } from '../../../utils/models'
import { cognitoError, sendCognitoError } from '../../../utils/errors'
import { shouldLogCodes } from '../../../utils/config'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, string>>(event)
    const client = ensureClient(body.clientId || 'default-client')
    const user = findUser(client.pool_id, body.username || '')
    if (!user) cognitoError('UserNotFoundException', 'User does not exist.')
    const value = code()
    createCode(client.pool_id, client.id, user.id, 'forgot', value)
    if (shouldLogCodes()) console.info(`[cognito-mock] password reset code for ${user.username}: ${value}`)
    return { codeDeliveryDetails: { Destination: user.username, DeliveryMedium: 'EMAIL', AttributeName: 'email' } }
  } catch (error) { return sendCognitoError(event, error) }
})
