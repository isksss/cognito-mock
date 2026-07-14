import {
  AdminListGroupsForUserCommand,
  GetUserCommand,
  InitiateAuthCommand,
  type AuthenticationResultType
} from '@aws-sdk/client-cognito-identity-provider'
import type { H3Event } from 'h3'
import { cognitoAdminClient, cognitoUserClient } from './cognito'
import { exampleSession } from './session'

async function readIdentity(event: H3Event, accessToken: string) {
  const config = useRuntimeConfig(event)
  const profile = await cognitoUserClient(event).send(new GetUserCommand({ AccessToken: accessToken }))
  const username = profile.Username || ''
  const groupResult = await cognitoAdminClient(event).send(new AdminListGroupsForUserCommand({
    UserPoolId: config.cognitoUserPoolId,
    Username: username
  }))
  const groups = (groupResult.Groups || []).flatMap(group => group.GroupName ? [group.GroupName] : [])
  return {
    username,
    groups,
    attributes: Object.fromEntries((profile.UserAttributes || []).map(attribute => [attribute.Name!, attribute.Value || '']))
  }
}

function requireAdminGroup(identity: { groups: string[] }) {
  if (!identity.groups.includes('admins')) {
    throw createError({ statusCode: 403, statusMessage: 'admins グループのユーザーだけが利用できます。' })
  }
}

export async function establishSession(event: H3Event, result: AuthenticationResultType) {
  if (!result.AccessToken) throw createError({ statusCode: 401, statusMessage: 'アクセストークンを取得できませんでした。' })
  const identity = await readIdentity(event, result.AccessToken)
  requireAdminGroup(identity)
  const session = await exampleSession(event)
  await session.update({
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    username: identity.username,
    authenticatedAt: Date.now()
  })
  return identity
}

async function refreshAccessToken(event: H3Event, refreshToken: string) {
  const config = useRuntimeConfig(event)
  const result = await cognitoUserClient(event).send(new InitiateAuthCommand({
    ClientId: config.cognitoClientId,
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    AuthParameters: { REFRESH_TOKEN: refreshToken }
  }))
  if (!result.AuthenticationResult?.AccessToken) throw new Error('refresh failed')
  return result.AuthenticationResult.AccessToken
}

export async function requireAdminSession(event: H3Event) {
  const session = await exampleSession(event)
  if (!session.data.accessToken) throw createError({ statusCode: 401, statusMessage: 'ログインが必要です。' })

  try {
    const identity = await readIdentity(event, session.data.accessToken)
    requireAdminGroup(identity)
    return identity
  } catch {
    if (!session.data.refreshToken) {
      await session.clear()
      throw createError({ statusCode: 401, statusMessage: 'セッションの有効期限が切れました。' })
    }
    try {
      const accessToken = await refreshAccessToken(event, session.data.refreshToken)
      const identity = await readIdentity(event, accessToken)
      requireAdminGroup(identity)
      await session.update({ ...session.data, accessToken })
      return identity
    } catch {
      await session.clear()
      throw createError({ statusCode: 401, statusMessage: 'セッションの有効期限が切れました。' })
    }
  }
}
