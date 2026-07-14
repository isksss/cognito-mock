import {
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUpdateUserAttributesCommand
} from '@aws-sdk/client-cognito-identity-provider'
import { getRouterParam, readValidatedBody } from 'h3'
import { z } from 'zod'
import { requireAdminSession } from '../../utils/auth'
import { cognitoAdminClient, cognitoMessage } from '../../utils/cognito'
import { assertSameOrigin } from '../../utils/session'

const schema = z.object({
  email: z.email(),
  name: z.string().min(1).max(128),
  enabled: z.boolean()
})

export default defineEventHandler(async event => {
  assertSameOrigin(event)
  await requireAdminSession(event)
  const body = await readValidatedBody(event, value => schema.parse(value))
  const username = getRouterParam(event, 'username') || ''
  const config = useRuntimeConfig(event)
  const client = cognitoAdminClient(event)

  try {
    await client.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: config.cognitoUserPoolId,
      Username: username,
      UserAttributes: [
        { Name: 'email', Value: body.email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: body.name }
      ]
    }))
    await client.send(body.enabled
      ? new AdminEnableUserCommand({ UserPoolId: config.cognitoUserPoolId, Username: username })
      : new AdminDisableUserCommand({ UserPoolId: config.cognitoUserPoolId, Username: username }))
    return { updated: true as const }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: cognitoMessage(error) })
  }
})
