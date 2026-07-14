import { AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider'
import { getRouterParam } from 'h3'
import { requireAdminSession } from '../../utils/auth'
import { cognitoAdminClient, cognitoMessage } from '../../utils/cognito'
import { assertSameOrigin } from '../../utils/session'

export default defineEventHandler(async event => {
  assertSameOrigin(event)
  const identity = await requireAdminSession(event)
  const username = getRouterParam(event, 'username') || ''
  if (username === identity.username) throw createError({ statusCode: 400, statusMessage: 'ログイン中のユーザーは削除できません。' })
  const config = useRuntimeConfig(event)
  try {
    await cognitoAdminClient(event).send(new AdminDeleteUserCommand({
      UserPoolId: config.cognitoUserPoolId,
      Username: username
    }))
    return { deleted: true as const }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: cognitoMessage(error) })
  }
})
