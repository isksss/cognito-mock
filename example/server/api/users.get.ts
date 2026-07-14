import {
  AdminListGroupsForUserCommand,
  ListGroupsCommand,
  ListUsersCommand
} from '@aws-sdk/client-cognito-identity-provider'
import { requireAdminSession } from '../utils/auth'
import { cognitoAdminClient } from '../utils/cognito'
import type { ExampleUser } from '../utils/types'

export default defineEventHandler(async event => {
  await requireAdminSession(event)
  const config = useRuntimeConfig(event)
  const client = cognitoAdminClient(event)
  const [usersResult, groupsResult] = await Promise.all([
    client.send(new ListUsersCommand({ UserPoolId: config.cognitoUserPoolId })),
    client.send(new ListGroupsCommand({ UserPoolId: config.cognitoUserPoolId }))
  ])

  const users = await Promise.all((usersResult.Users || []).map(async user => {
    const username = user.Username || ''
    const membership = await client.send(new AdminListGroupsForUserCommand({
      UserPoolId: config.cognitoUserPoolId,
      Username: username
    }))
    const attributes = Object.fromEntries((user.Attributes || []).map(attribute => [attribute.Name!, attribute.Value || '']))
    return {
      username,
      email: attributes.email || '',
      name: attributes.name || '',
      enabled: Boolean(user.Enabled),
      status: user.UserStatus || 'UNKNOWN',
      createdAt: user.UserCreateDate,
      updatedAt: user.UserLastModifiedDate,
      groups: (membership.Groups || []).flatMap(group => group.GroupName ? [group.GroupName] : [])
    } satisfies ExampleUser
  }))

  return {
    users,
    groups: (groupsResult.Groups || []).flatMap(group => group.GroupName ? [group.GroupName] : [])
  }
})
