import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'
import { readValidatedBody } from 'h3'
import { z } from 'zod'
import { establishSession } from '../../utils/auth'
import { cognitoMessage, cognitoUserClient } from '../../utils/cognito'
import { assertSameOrigin, exampleSession } from '../../utils/session'

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(8)
})

export default defineEventHandler(async event => {
  assertSameOrigin(event)
  const body = await readValidatedBody(event, value => schema.parse(value))
  const config = useRuntimeConfig(event)
  const session = await exampleSession(event)
  await session.clear()

  try {
    const result = await cognitoUserClient(event).send(new InitiateAuthCommand({
      ClientId: config.cognitoClientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: body.username, PASSWORD: body.password }
    }))
    if (result.ChallengeName === 'NEW_PASSWORD_REQUIRED' && result.Session) {
      await session.update({ pendingChallenge: { username: body.username, session: result.Session } })
      return { challenge: 'NEW_PASSWORD_REQUIRED' as const }
    }
    await establishSession(event, result.AuthenticationResult || {})
    return { authenticated: true as const }
  } catch (error) {
    throw createError({ statusCode: 401, statusMessage: cognitoMessage(error) })
  }
})
