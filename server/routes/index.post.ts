import { defineEventHandler, getHeader, readBody } from 'h3'
import { db } from '../utils/db'
import { CognitoError, cognitoError, sendCognitoError } from '../utils/errors'
import { code, epochMs, id, json } from '../utils/ids'
import { createCode, createUser, ensureClient, ensurePool, findUser, getPool, getUserById, listClients, listPools, listUsers, updateUser, type UserRow } from '../utils/models'
import { verifyPassword } from '../utils/password'
import { consumeOpaqueToken, issueTokens, revokeOpaqueToken, verifyAccessToken } from '../utils/tokens'
import { createSrpChallenge, verifySrpResponse } from '../utils/srp'
import { shouldLogCodes } from '../utils/config'

type Input = Record<string, any>
const attributesToObject = (attributes: Array<{ Name: string, Value?: string }> = []) => Object.fromEntries(attributes.map(attribute => [attribute.Name, attribute.Value || '']))
const objectToAttributes = (value: string | Record<string, string>) => Object.entries(typeof value === 'string' ? json<Record<string, string>>(value, {}) : value).map(([Name, Value]) => ({ Name, Value }))
const userShape = (user: UserRow) => ({
  Username: user.username, UserAttributes: objectToAttributes(user.attributes), Attributes: objectToAttributes(user.attributes),
  UserCreateDate: user.created_at / 1000, UserLastModifiedDate: user.updated_at / 1000,
  Enabled: Boolean(user.enabled), UserStatus: user.status
})
const poolShape = (pool: ReturnType<typeof ensurePool>) => ({ Id: pool.id, Name: pool.name, Status: 'Enabled', CreationDate: pool.created_at / 1000, LastModifiedDate: pool.updated_at / 1000, LambdaConfig: {}, SchemaAttributes: [] })
const clientShape = (client: ReturnType<typeof ensureClient>) => ({ UserPoolId: client.pool_id, ClientId: client.id, ClientName: client.name, ClientSecret: client.secret || undefined, CallbackURLs: json(client.callbacks, []), LogoutURLs: json(client.logouts, []), AllowedOAuthScopes: json(client.scopes, []), AllowedOAuthFlows: ['code'], AllowedOAuthFlowsUserPoolClient: true, CreationDate: client.created_at / 1000, LastModifiedDate: client.updated_at / 1000 })

function requireUser(poolId: string, username: string) {
  const user = findUser(poolId, username)
  if (!user) cognitoError('UserNotFoundException', 'User does not exist.')
  return user
}

function confirmation(user: UserRow, clientId: string, kind: string) {
  const value = code()
  createCode(user.pool_id, clientId, user.id, kind, value)
  if (shouldLogCodes()) console.info(`[cognito-mock] ${kind} code for ${user.username}: ${value}`)
  return { CodeDeliveryDetails: { Destination: json<Record<string, string>>(user.attributes, {}).email || user.username, DeliveryMedium: 'EMAIL', AttributeName: 'email' } }
}

function consumeCode(user: UserRow, kind: string, value: string) {
  const record = db().prepare('SELECT * FROM codes WHERE user_id=? AND kind=? AND code=? AND used_at IS NULL ORDER BY created_at DESC').get(user.id, kind, value) as unknown as { id: string, expires_at: number } | undefined
  if (!record || record.expires_at < epochMs()) cognitoError('CodeMismatchException', 'Invalid verification code provided.')
  db().prepare('UPDATE codes SET used_at=? WHERE id=?').run(epochMs(), record.id)
}

async function authenticate(event: Parameters<typeof issueTokens>[0], clientId: string, poolId: string, input: Input, admin = false) {
  const flow = input.AuthFlow
  const parameters = input.AuthParameters || {}
  if (flow === 'REFRESH_TOKEN_AUTH' || flow === 'REFRESH_TOKEN') {
    const row = consumeOpaqueToken(parameters.REFRESH_TOKEN || '', 'refresh')
    if (row.client_id !== clientId) cognitoError('NotAuthorizedException', 'Invalid refresh token.')
    return { AuthenticationResult: await issueTokens(event, String(row.pool_id), clientId, String(row.user_id), json<string[]>(String(row.scopes), []), undefined, false) }
  }
  const username = parameters.USERNAME || parameters.USER_ID_FOR_SRP
  const user = requireUser(poolId, username)
  if (!user.enabled) cognitoError('NotAuthorizedException', 'User is disabled.')
  if (user.status === 'UNCONFIRMED') cognitoError('UserNotConfirmedException', 'User is not confirmed.')
  if (flow === 'USER_SRP_AUTH') {
    if (!user.srp_verifier || !user.srp_salt || !parameters.SRP_A) cognitoError('InvalidParameterException', 'SRP parameters are invalid.')
    const challenge = createSrpChallenge(user.srp_verifier)
    const session = id(32)
    db().prepare('INSERT INTO sessions(id,pool_id,client_id,user_id,data,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').run(session, poolId, clientId, user.id, JSON.stringify({ ...challenge, A: parameters.SRP_A }), epochMs() + 5 * 60_000, epochMs())
    return { ChallengeName: 'PASSWORD_VERIFIER', Session: session, ChallengeParameters: { USER_ID_FOR_SRP: user.username, USERNAME: user.username, SRP_B: challenge.B, SALT: user.srp_salt, SECRET_BLOCK: challenge.secretBlock } }
  }
  const passwordFlows = admin ? ['ADMIN_USER_PASSWORD_AUTH', 'ADMIN_NO_SRP_AUTH'] : ['USER_PASSWORD_AUTH']
  if (!passwordFlows.includes(flow) || !verifyPassword(parameters.PASSWORD || '', user.password_hash)) cognitoError('NotAuthorizedException', 'Incorrect username or password.')
  if (user.status === 'FORCE_CHANGE_PASSWORD') {
    const session = id(32)
    db().prepare('INSERT INTO sessions(id,pool_id,client_id,user_id,data,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').run(session, poolId, clientId, user.id, '{}', epochMs() + 5 * 60_000, epochMs())
    return { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: session, ChallengeParameters: { USERNAME: user.username, requiredAttributes: '[]', userAttributes: user.attributes } }
  }
  return { AuthenticationResult: await issueTokens(event, poolId, clientId, user.id, ['openid', 'email', 'profile']) }
}

async function respondToChallenge(event: Parameters<typeof issueTokens>[0], input: Input) {
  const session = db().prepare('SELECT * FROM sessions WHERE id=?').get(input.Session) as unknown as { id: string, pool_id: string, client_id: string, user_id: string, data: string, expires_at: number } | undefined
  if (!session || session.expires_at < epochMs()) cognitoError('NotAuthorizedException', 'Invalid session.')
  const user = getUserById(session.user_id)!
  if (input.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    const password = input.ChallengeResponses?.NEW_PASSWORD
    if (!password) cognitoError('InvalidParameterException', 'NEW_PASSWORD is required.')
    updateUser(user.id, { password, status: 'CONFIRMED' })
  } else if (input.ChallengeName === 'PASSWORD_VERIFIER') {
    const data = json<Record<string, string>>(session.data, {})
    const response = input.ChallengeResponses || {}
    const valid = verifySrpResponse({ poolId: session.pool_id, username: user.username, verifier: user.srp_verifier!, b: data.b!, B: data.B!, A: data.A!, secretBlock: data.secretBlock!, timestamp: response.TIMESTAMP || '', signature: response.PASSWORD_CLAIM_SIGNATURE || '' })
    if (!valid) cognitoError('NotAuthorizedException', 'Incorrect username or password.')
  } else cognitoError('InvalidParameterException', 'Unsupported challenge.')
  db().prepare('DELETE FROM sessions WHERE id=?').run(session.id)
  return { AuthenticationResult: await issueTokens(event, session.pool_id, session.client_id, user.id, ['openid', 'email', 'profile']) }
}

export default defineEventHandler(async (event) => {
  try {
    const target = (getHeader(event, 'x-amz-target') || '').split('.').pop() || ''
    const input = await readBody<Input>(event) || {}
    switch (target) {
      case 'CreateUserPool': {
        const poolId = input.UserPoolId || `local-1_${id(7)}`; const timestamp = epochMs()
        if (getPool(poolId)) cognitoError('InvalidParameterException', 'User pool already exists.')
        db().prepare('INSERT INTO pools(id,name,region,settings,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(poolId, input.PoolName || 'cognito-mock', poolId.split('_')[0], JSON.stringify(input), timestamp, timestamp)
        return { UserPool: poolShape(ensurePool(poolId)) }
      }
      case 'DescribeUserPool': return { UserPool: poolShape(ensurePool(input.UserPoolId)) }
      case 'ListUserPools': return { UserPools: listPools().map(poolShape) }
      case 'UpdateUserPool': { const pool = ensurePool(input.UserPoolId); db().prepare('UPDATE pools SET settings=?,updated_at=? WHERE id=?').run(JSON.stringify({ ...json(pool.settings, {}), ...input }), epochMs(), pool.id); return {} }
      case 'DeleteUserPool': ensurePool(input.UserPoolId); db().prepare('DELETE FROM pools WHERE id=?').run(input.UserPoolId); return {}
      case 'CreateUserPoolClient': {
        ensurePool(input.UserPoolId); const clientId = input.ClientId || id(13); const timestamp = epochMs()
        db().prepare('INSERT INTO clients(id,pool_id,name,secret,callbacks,logouts,scopes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(clientId, input.UserPoolId, input.ClientName || 'cognito-mock', input.GenerateSecret ? id(24) : null, JSON.stringify(input.CallbackURLs || []), JSON.stringify(input.LogoutURLs || []), JSON.stringify(input.AllowedOAuthScopes || ['openid']), timestamp, timestamp)
        return { UserPoolClient: clientShape(ensureClient(clientId)) }
      }
      case 'DescribeUserPoolClient': return { UserPoolClient: clientShape(ensureClient(input.ClientId, input.UserPoolId)) }
      case 'ListUserPoolClients': return { UserPoolClients: listClients(input.UserPoolId).map(client => ({ ClientId: client.id, ClientName: client.name, UserPoolId: client.pool_id })) }
      case 'UpdateUserPoolClient': {
        const client = ensureClient(input.ClientId, input.UserPoolId)
        db().prepare('UPDATE clients SET name=?,callbacks=?,logouts=?,scopes=?,updated_at=? WHERE id=?').run(input.ClientName || client.name, JSON.stringify(input.CallbackURLs || json(client.callbacks, [])), JSON.stringify(input.LogoutURLs || json(client.logouts, [])), JSON.stringify(input.AllowedOAuthScopes || json(client.scopes, [])), epochMs(), client.id)
        return { UserPoolClient: clientShape(ensureClient(client.id)) }
      }
      case 'DeleteUserPoolClient': db().prepare('DELETE FROM clients WHERE id=? AND pool_id=?').run(input.ClientId, input.UserPoolId); return {}
      case 'SignUp': {
        const client = ensureClient(input.ClientId); const user = createUser(client.pool_id, input.Username, input.Password, attributesToObject(input.UserAttributes))
        return { UserSub: user.id, UserConfirmed: false, ...confirmation(user, client.id, 'signup') }
      }
      case 'ConfirmSignUp': { const client = ensureClient(input.ClientId); const user = requireUser(client.pool_id, input.Username); consumeCode(user, 'signup', input.ConfirmationCode); updateUser(user.id, { status: 'CONFIRMED', attributes: { email_verified: 'true' } }); return {} }
      case 'ResendConfirmationCode': { const client = ensureClient(input.ClientId); return confirmation(requireUser(client.pool_id, input.Username), client.id, 'signup') }
      case 'ForgotPassword': { const client = ensureClient(input.ClientId); return confirmation(requireUser(client.pool_id, input.Username), client.id, 'forgot') }
      case 'ConfirmForgotPassword': { const client = ensureClient(input.ClientId); const user = requireUser(client.pool_id, input.Username); consumeCode(user, 'forgot', input.ConfirmationCode); updateUser(user.id, { password: input.Password, status: 'CONFIRMED' }); return {} }
      case 'InitiateAuth': { const client = ensureClient(input.ClientId); return await authenticate(event, client.id, client.pool_id, input) }
      case 'AdminInitiateAuth': { const client = ensureClient(input.ClientId, input.UserPoolId); return await authenticate(event, client.id, input.UserPoolId, input, true) }
      case 'RespondToAuthChallenge': case 'AdminRespondToAuthChallenge': return await respondToChallenge(event, input)
      case 'RevokeToken': revokeOpaqueToken(input.Token); return {}
      case 'GetUser': { const payload = await verifyAccessToken(input.AccessToken); const poolId = String(payload.iss).split('/').pop()!; return userShape(requireUser(poolId, String(payload.username))) }
      case 'UpdateUserAttributes': { const payload = await verifyAccessToken(input.AccessToken); const poolId = String(payload.iss).split('/').pop()!; const user = requireUser(poolId, String(payload.username)); updateUser(user.id, { attributes: attributesToObject(input.UserAttributes) }); return {} }
      case 'DeleteUserAttributes': { const payload = await verifyAccessToken(input.AccessToken); const user = getUserById(String(payload.sub))!; const attrs = json<Record<string, string>>(user.attributes, {}); for (const name of input.UserAttributeNames || []) delete attrs[name]; db().prepare('UPDATE users SET attributes=?,updated_at=? WHERE id=?').run(JSON.stringify(attrs), epochMs(), user.id); return {} }
      case 'ChangePassword': { const payload = await verifyAccessToken(input.AccessToken); const user = getUserById(String(payload.sub))!; if (!verifyPassword(input.PreviousPassword, user.password_hash)) cognitoError('NotAuthorizedException', 'Incorrect password.'); updateUser(user.id, { password: input.ProposedPassword }); return {} }
      case 'GlobalSignOut': { const payload = await verifyAccessToken(input.AccessToken); db().prepare('UPDATE tokens SET revoked_at=? WHERE user_id=?').run(epochMs(), String(payload.sub)); return {} }
      case 'DeleteUser': { const payload = await verifyAccessToken(input.AccessToken); db().prepare('DELETE FROM users WHERE id=?').run(String(payload.sub)); return {} }
      case 'AdminCreateUser': { const password = input.TemporaryPassword || `Temp-${id(8)}!`; const user = createUser(input.UserPoolId, input.Username, password, attributesToObject(input.UserAttributes), 'FORCE_CHANGE_PASSWORD'); return { User: userShape(user) } }
      case 'AdminConfirmSignUp': { const user = requireUser(input.UserPoolId, input.Username); updateUser(user.id, { status: 'CONFIRMED' }); return {} }
      case 'AdminGetUser': return userShape(requireUser(input.UserPoolId, input.Username))
      case 'AdminUpdateUserAttributes': { const user = requireUser(input.UserPoolId, input.Username); updateUser(user.id, { attributes: attributesToObject(input.UserAttributes) }); return {} }
      case 'AdminDeleteUserAttributes': { const user = requireUser(input.UserPoolId, input.Username); const attrs = json<Record<string, string>>(user.attributes, {}); for (const name of input.UserAttributeNames || []) delete attrs[name]; db().prepare('UPDATE users SET attributes=?,updated_at=? WHERE id=?').run(JSON.stringify(attrs), epochMs(), user.id); return {} }
      case 'AdminSetUserPassword': { const user = requireUser(input.UserPoolId, input.Username); updateUser(user.id, { password: input.Password, status: input.Permanent ? 'CONFIRMED' : 'FORCE_CHANGE_PASSWORD' }); return {} }
      case 'AdminEnableUser': updateUser(requireUser(input.UserPoolId, input.Username).id, { enabled: true }); return {}
      case 'AdminDisableUser': updateUser(requireUser(input.UserPoolId, input.Username).id, { enabled: false }); return {}
      case 'AdminDeleteUser': db().prepare('DELETE FROM users WHERE id=?').run(requireUser(input.UserPoolId, input.Username).id); return {}
      case 'ListUsers': return { Users: listUsers(input.UserPoolId).map(userShape) }
      case 'CreateGroup': { ensurePool(input.UserPoolId); db().prepare('INSERT INTO groups_table(pool_id,name,description,precedence,role_arn,created_at) VALUES(?,?,?,?,?,?)').run(input.UserPoolId, input.GroupName, input.Description || null, input.Precedence ?? null, input.RoleArn || null, epochMs()); return { Group: { GroupName: input.GroupName, UserPoolId: input.UserPoolId, Description: input.Description, Precedence: input.Precedence, RoleArn: input.RoleArn } } }
      case 'GetGroup': { const group = db().prepare('SELECT * FROM groups_table WHERE pool_id=? AND name=?').get(input.UserPoolId, input.GroupName) as any; if (!group) cognitoError('ResourceNotFoundException', 'Group does not exist.'); return { Group: { GroupName: group.name, UserPoolId: group.pool_id, Description: group.description, Precedence: group.precedence, RoleArn: group.role_arn } } }
      case 'ListGroups': return { Groups: (db().prepare('SELECT * FROM groups_table WHERE pool_id=?').all(input.UserPoolId) as any[]).map(group => ({ GroupName: group.name, UserPoolId: group.pool_id, Description: group.description, Precedence: group.precedence, RoleArn: group.role_arn })) }
      case 'UpdateGroup': db().prepare('UPDATE groups_table SET description=?,precedence=?,role_arn=? WHERE pool_id=? AND name=?').run(input.Description || null, input.Precedence ?? null, input.RoleArn || null, input.UserPoolId, input.GroupName); return { Group: { GroupName: input.GroupName, UserPoolId: input.UserPoolId, Description: input.Description, Precedence: input.Precedence, RoleArn: input.RoleArn } }
      case 'DeleteGroup': db().prepare('DELETE FROM groups_table WHERE pool_id=? AND name=?').run(input.UserPoolId, input.GroupName); return {}
      case 'AdminAddUserToGroup': { const user = requireUser(input.UserPoolId, input.Username); db().prepare('INSERT OR IGNORE INTO memberships(pool_id,group_name,user_id) VALUES(?,?,?)').run(input.UserPoolId, input.GroupName, user.id); return {} }
      case 'AdminRemoveUserFromGroup': { const user = requireUser(input.UserPoolId, input.Username); db().prepare('DELETE FROM memberships WHERE pool_id=? AND group_name=? AND user_id=?').run(input.UserPoolId, input.GroupName, user.id); return {} }
      case 'AdminListGroupsForUser': { const user = requireUser(input.UserPoolId, input.Username); return { Groups: (db().prepare('SELECT g.* FROM groups_table g JOIN memberships m ON g.pool_id=m.pool_id AND g.name=m.group_name WHERE m.user_id=?').all(user.id) as any[]).map(group => ({ GroupName: group.name, UserPoolId: group.pool_id, Description: group.description })) } }
      case 'ListUsersInGroup': { const users = db().prepare('SELECT u.* FROM users u JOIN memberships m ON u.id=m.user_id WHERE m.pool_id=? AND m.group_name=?').all(input.UserPoolId, input.GroupName) as unknown as UserRow[]; return { Users: users.map(userShape) } }
      default: cognitoError('InvalidParameterException', `Unsupported Cognito operation: ${target || '(missing X-Amz-Target)'}`)
    }
  } catch (error) {
    if (error instanceof CognitoError) return sendCognitoError(event, error)
    console.error(error)
    return sendCognitoError(event, new CognitoError('InternalErrorException', 'cognito-mock internal error', 500))
  }
})
