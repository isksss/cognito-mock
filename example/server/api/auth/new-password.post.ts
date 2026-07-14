import { RespondToAuthChallengeCommand } from '@aws-sdk/client-cognito-identity-provider'
import { readValidatedBody } from 'h3'
import { z } from 'zod'
import { establishSession } from '../../utils/auth'
import { cognitoMessage, cognitoUserClient } from '../../utils/cognito'
import { assertSameOrigin, exampleSession } from '../../utils/session'

const schema = z.object({ password: z.string().min(8) })

export default defineEventHandler(async event => {
  assertSameOrigin(event)
  const body = await readValidatedBody(event, value => schema.parse(value))
  const config = useRuntimeConfig(event)
  const session = await exampleSession(event)
  const pending = session.data.pendingChallenge
  if (!pending) throw createError({ statusCode: 400, statusMessage: 'パスワード変更セッションがありません。' })

  try {
    const result = await cognitoUserClient(event).send(new RespondToAuthChallengeCommand({
      ClientId: config.cognitoClientId,
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      Session: pending.session,
      ChallengeResponses: {
        USERNAME: pending.username,
        NEW_PASSWORD: body.password
      }
    }))
    await session.clear()
    await establishSession(event, result.AuthenticationResult || {})
    return { authenticated: true as const }
  } catch (error) {
    await session.clear()
    throw createError({ statusCode: 400, statusMessage: cognitoMessage(error) })
  }
})
