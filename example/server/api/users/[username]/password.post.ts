import { AdminSetUserPasswordCommand } from '@aws-sdk/client-cognito-identity-provider'
import { getRouterParam, readValidatedBody } from 'h3'
import { z } from 'zod'
import { requireAdminSession } from '../../../utils/auth'
import { cognitoAdminClient, cognitoMessage } from '../../../utils/cognito'
import { assertSameOrigin } from '../../../utils/session'

const schema = z.object({ password: z.string().min(8), permanent: z.boolean() })

export default defineEventHandler(async event => {
  assertSameOrigin(event)
  await requireAdminSession(event)
  const body = await readValidatedBody(event, value => schema.parse(value))
  const config = useRuntimeConfig(event)
  try {
    await cognitoAdminClient(event).send(new AdminSetUserPasswordCommand({
      UserPoolId: config.cognitoUserPoolId,
      Username: getRouterParam(event, 'username') || '',
      Password: body.password,
      Permanent: body.permanent
    }))
    return { updated: true as const }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: cognitoMessage(error) })
  }
})
