import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { cognitoError } from './errors'

export function requireAdmin(event: H3Event) {
  const expected = process.env.ADMIN_TOKEN || ''
  if (!expected) cognitoError('NotAuthorizedException', 'Admin API is disabled because ADMIN_TOKEN is not configured.', 401)
  const authorization = getHeader(event, 'authorization') || ''
  if (authorization !== `Bearer ${expected}`) cognitoError('NotAuthorizedException', 'Invalid admin token.', 401)
}

const adminOperations = new Set([
  'CreateUserPool', 'DescribeUserPool', 'ListUserPools', 'UpdateUserPool', 'DeleteUserPool',
  'CreateUserPoolClient', 'DescribeUserPoolClient', 'ListUserPoolClients', 'UpdateUserPoolClient', 'DeleteUserPoolClient',
  'AdminInitiateAuth', 'AdminRespondToAuthChallenge', 'AdminCreateUser', 'AdminConfirmSignUp', 'AdminGetUser',
  'AdminUpdateUserAttributes', 'AdminDeleteUserAttributes', 'AdminSetUserPassword', 'AdminEnableUser', 'AdminDisableUser',
  'AdminDeleteUser', 'ListUsers', 'CreateGroup', 'GetGroup', 'ListGroups', 'UpdateGroup', 'DeleteGroup',
  'AdminAddUserToGroup', 'AdminRemoveUserFromGroup', 'AdminListGroupsForUser', 'ListUsersInGroup'
])

export function requireAdminOperation(event: H3Event, operation: string) {
  if (adminOperations.has(operation)) requireAdmin(event)
}
