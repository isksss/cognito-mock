import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand
} from '@aws-sdk/client-cognito-identity-provider'
import { readValidatedBody } from 'h3'
import { z } from 'zod'
import { requireAdminSession } from '../utils/auth'
import { cognitoAdminClient, cognitoMessage } from '../utils/cognito'
import { assertSameOrigin } from '../utils/session'

const schema = z.object({
  username: z.string().min(1).max(128).refine(value => !value.includes('/'), 'ユーザー名に / は使用できません。'),
  email: z.email(),
  name: z.string().min(1).max(128),
  temporaryPassword: z.string().min(8),
  groups: z.array(z.string()).default([])
})

export default defineEventHandler(async event => {
  assertSameOrigin(event)
  await requireAdminSession(event)
  const body = await readValidatedBody(event, value => schema.parse(value))
  const config = useRuntimeConfig(event)
  const client = cognitoAdminClient(event)

  try {
    await client.send(new AdminCreateUserCommand({
      UserPoolId: config.cognitoUserPoolId,
      Username: body.username,
      TemporaryPassword: body.temporaryPassword,
      UserAttributes: [
        { Name: 'email', Value: body.email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: body.name }
      ]
    }))
    try {
      await Promise.all(body.groups.map(group => client.send(new AdminAddUserToGroupCommand({
        UserPoolId: config.cognitoUserPoolId,
        Username: body.username,
        GroupName: group
      }))))
    } catch (error) {
      await client.send(new AdminDeleteUserCommand({ UserPoolId: config.cognitoUserPoolId, Username: body.username }))
      throw error
    }
    return { created: true as const }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: cognitoMessage(error) })
  }
})
