import { AdminAddUserToGroupCommand, AdminRemoveUserFromGroupCommand } from '@aws-sdk/client-cognito-identity-provider'
import { getRouterParam, readValidatedBody } from 'h3'
import { z } from 'zod'
import { requireAdminSession } from '../../../utils/auth'
import { cognitoAdminClient, cognitoMessage } from '../../../utils/cognito'
import { assertSameOrigin } from '../../../utils/session'

const schema = z.object({ group: z.string().min(1), member: z.boolean() })

export default defineEventHandler(async event => {
  assertSameOrigin(event)
  await requireAdminSession(event)
  const body = await readValidatedBody(event, value => schema.parse(value))
  const config = useRuntimeConfig(event)
  const input = {
    UserPoolId: config.cognitoUserPoolId,
    Username: getRouterParam(event, 'username') || '',
    GroupName: body.group
  }
  try {
    await cognitoAdminClient(event).send(body.member
      ? new AdminAddUserToGroupCommand(input)
      : new AdminRemoveUserFromGroupCommand(input))
    return { updated: true as const }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: cognitoMessage(error) })
  }
})
