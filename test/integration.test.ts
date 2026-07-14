import { createHash, createHmac } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { AuthenticationHelper, DateHelper } from 'amazon-cognito-identity-js'
import { decodeJwt } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

const poolId = 'ap-northeast-1_integration'
const clientId = 'integrationclient'
const username = 'integration@example.com'
const password = 'Password123!'
const adminToken = 'test-admin-token'

await setup({
  rootDir: resolve(import.meta.dirname, '..'),
  browser: false,
  server: true,
  env: {
    DATABASE_PATH: resolve(tmpdir(), `cognito-mock-vitest-${process.pid}.sqlite`),
    COGNITO_MOCK_MODE: 'permissive',
    ADMIN_TOKEN: adminToken,
    LOG_CODES: 'false'
  }
})

async function aws<T = Record<string, unknown>>(operation: string, body: Record<string, unknown>) {
  return $fetch<T>('/', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': `AWSCognitoIdentityProviderService.${operation}`,
      'x-amz-date': '20260714T000000Z',
      'x-amz-security-token': 'local'
    },
    body
  })
}

beforeAll(async () => {
  await aws('CreateUserPool', { UserPoolId: poolId, PoolName: 'Integration' })
  await aws('CreateUserPoolClient', {
    UserPoolId: poolId,
    ClientId: clientId,
    ClientName: 'Integration client',
    CallbackURLs: ['http://localhost:5173/callback'],
    LogoutURLs: ['http://localhost:5173'],
    AllowedOAuthScopes: ['openid', 'email', 'profile']
  })
})

describe('HTTP and CORS', () => {
  it('returns health and renders management/login pages', async () => {
    expect(await $fetch('/health')).toEqual({ status: 'ok' })
    expect(await $fetch<string>('/__cognito_mock')).toContain('Cognito Mock')
    expect(await $fetch<string>(`/login?client_id=${clientId}`)).toContain('Integration client')
  })

  it('allows loopback cross-origin preflight with AWS headers', async () => {
    const response = await fetch('/', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-amz-target,x-amz-date,x-amz-security-token'
      }
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(response.headers.get('access-control-allow-headers')).toContain('X-Amz-Target')
    expect(response.headers.get('vary')).toBe('Origin')
  })

  it('does not emit CORS permission for an unapproved origin', async () => {
    const response = await fetch('/oauth2/token', { method: 'OPTIONS', headers: { origin: 'https://blocked.example.test', 'access-control-request-method': 'POST' } })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('requires the configured admin bearer token and records CORS decisions', async () => {
    const unauthorized = await fetch('/api/admin/state')
    expect(unauthorized.status).toBe(401)
    const state = await $fetch<{ cors: Array<{ origin: string, allowed: number }> }>('/api/admin/state', { headers: { authorization: `Bearer ${adminToken}` } })
    expect(state.cors).toEqual(expect.arrayContaining([
      expect.objectContaining({ origin: 'http://localhost:5173', allowed: 1 }),
      expect.objectContaining({ origin: 'https://blocked.example.test', allowed: 0 })
    ]))
  })
})

describe('Cognito User Pools AWS JSON protocol', () => {
  it('signs up, exposes a confirmation code, confirms, and authenticates a user', async () => {
    const signUp = await aws<{ UserSub: string, UserConfirmed: boolean }>('SignUp', {
      ClientId: clientId,
      Username: username,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: username }, { Name: 'name', Value: 'Integration User' }]
    })
    expect(signUp.UserSub).toMatch(/^[0-9a-f-]{36}$/)
    expect(signUp.UserConfirmed).toBe(false)

    const state = await $fetch<{ codes: Array<{ username: string, kind: string, code: string }> }>('/api/admin/state', { headers: { authorization: `Bearer ${adminToken}` } })
    const confirmation = state.codes.find(item => item.username === username && item.kind === 'signup')
    expect(confirmation?.code).toMatch(/^\d{6}$/)

    await aws('ConfirmSignUp', { ClientId: clientId, Username: username, ConfirmationCode: confirmation!.code })
    await aws('CreateGroup', { UserPoolId: poolId, GroupName: 'developers', Description: 'Developers' })
    await aws('AdminAddUserToGroup', { UserPoolId: poolId, Username: username, GroupName: 'developers' })

    const auth = await aws<{ AuthenticationResult: { AccessToken: string, IdToken: string, RefreshToken: string, TokenType: string } }>('InitiateAuth', {
      ClientId: clientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: username, PASSWORD: password }
    })
    expect(auth.AuthenticationResult.TokenType).toBe('Bearer')
    expect(decodeJwt(auth.AuthenticationResult.IdToken)).toMatchObject({ token_use: 'id', email: username })
    expect(decodeJwt(auth.AuthenticationResult.AccessToken)['cognito:groups']).toEqual(['developers'])

    const currentUser = await aws<{ Username: string, UserAttributes: Array<{ Name: string, Value: string }> }>('GetUser', { AccessToken: auth.AuthenticationResult.AccessToken })
    expect(currentUser.Username).toBe(username)
    expect(currentUser.UserAttributes).toContainEqual({ Name: 'email_verified', Value: 'true' })
  })

  it('returns Cognito-shaped errors for invalid credentials and duplicate users', async () => {
    const wrongPassword = await fetch('/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
      body: JSON.stringify({ ClientId: clientId, AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: username, PASSWORD: 'wrong' } })
    })
    expect(wrongPassword.status).toBe(400)
    expect(wrongPassword.headers.get('x-amzn-errortype')).toBe('NotAuthorizedException')
    expect(await wrongPassword.json()).toMatchObject({ __type: 'NotAuthorizedException' })

    const duplicate = await fetch('/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'AWSCognitoIdentityProviderService.SignUp' },
      body: JSON.stringify({ ClientId: clientId, Username: username, Password: password })
    })
    expect(duplicate.status).toBe(400)
    expect(await duplicate.json()).toMatchObject({ __type: 'UsernameExistsException' })
  })

  it('completes USER_SRP_AUTH using the official Cognito JavaScript helper', async () => {
    const helper = new AuthenticationHelper('integration') as any
    const largeA = await new Promise<any>((resolveValue, reject) => helper.getLargeAValue((error: Error | null, value: unknown) => error ? reject(error) : resolveValue(value)))
    const challenge = await aws<{ ChallengeName: string, Session: string, ChallengeParameters: Record<string, string> }>('InitiateAuth', {
      ClientId: clientId,
      AuthFlow: 'USER_SRP_AUTH',
      AuthParameters: { USERNAME: username, SRP_A: largeA.toString(16) }
    })
    expect(challenge.ChallengeName).toBe('PASSWORD_VERIFIER')
    const BigInteger = helper.N.constructor
    const key = await new Promise<Buffer>((resolveValue, reject) => helper.getPasswordAuthenticationKey(
      username,
      password,
      new BigInteger(challenge.ChallengeParameters.SRP_B, 16),
      new BigInteger(challenge.ChallengeParameters.SALT, 16),
      (error: Error | null, value: Buffer) => error ? reject(error) : resolveValue(value)
    ))
    const timestamp = new DateHelper().getNowString()
    const message = Buffer.concat([Buffer.from('integration'), Buffer.from(username), Buffer.from(challenge.ChallengeParameters.SECRET_BLOCK, 'base64'), Buffer.from(timestamp)])
    const signature = createHmac('sha256', key).update(message).digest('base64')
    const result = await aws<{ AuthenticationResult: { AccessToken: string } }>('RespondToAuthChallenge', {
      ClientId: clientId,
      ChallengeName: 'PASSWORD_VERIFIER',
      Session: challenge.Session,
      ChallengeResponses: {
        USERNAME: username,
        PASSWORD_CLAIM_SECRET_BLOCK: challenge.ChallengeParameters.SECRET_BLOCK,
        PASSWORD_CLAIM_SIGNATURE: signature,
        TIMESTAMP: timestamp
      }
    })
    expect(decodeJwt(result.AuthenticationResult.AccessToken)).toMatchObject({ token_use: 'access', client_id: clientId })
  })
})

describe('OAuth 2.0 and OpenID Connect', () => {
  const verifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~'
  const challenge = createHash('sha256').update(verifier).digest('base64url')

  it('publishes discovery metadata and an RS256 JWKS', async () => {
    const discovery = await $fetch<Record<string, any>>(`/${poolId}/.well-known/openid-configuration`)
    expect(discovery).toMatchObject({
      issuer: expect.stringContaining(`/${poolId}`),
      authorization_endpoint: expect.stringContaining('/oauth2/authorize'),
      code_challenge_methods_supported: ['S256']
    })
    const keySet = await $fetch<{ keys: Array<Record<string, string>> }>(`/${poolId}/.well-known/jwks.json`)
    expect(keySet.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig' })
  })

  it('redirects authorize requests to Managed Login and learns a loopback callback', async () => {
    const query = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: 'http://localhost:5173/callback', scope: 'openid email profile', state: 'state-1', code_challenge: challenge, code_challenge_method: 'S256' })
    const response = await fetch(`/oauth2/authorize?${query}`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('/login?')
  })

  it('exchanges a PKCE code, calls UserInfo, refreshes, and revokes the refresh token', async () => {
    const login = await $fetch<{ redirectTo: string }>('/api/auth/login', {
      method: 'POST',
      body: { clientId, username, password, redirectUri: 'http://localhost:5173/callback', scope: 'openid email profile', state: 'state-1', nonce: 'nonce-1', codeChallenge: challenge }
    })
    const callback = new URL(login.redirectTo)
    expect(callback.searchParams.get('state')).toBe('state-1')
    const code = callback.searchParams.get('code')!

    const tokens = await $fetch<{ access_token: string, id_token: string, refresh_token: string, token_type: string }>('/oauth2/token', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: 'http://localhost:5173/callback', code, code_verifier: verifier })
    })
    expect(tokens.token_type).toBe('Bearer')
    expect(decodeJwt(tokens.id_token).nonce).toBe('nonce-1')

    const userInfo = await $fetch<Record<string, unknown>>('/oauth2/userInfo', { headers: { authorization: `Bearer ${tokens.access_token}`, origin: 'http://localhost:5173' } })
    expect(userInfo).toMatchObject({ email: username, name: 'Integration User' })

    const refreshed = await $fetch<{ access_token: string, id_token: string }>('/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token })
    })
    expect(decodeJwt(refreshed.access_token).token_use).toBe('access')

    await $fetch('/oauth2/revoke', { method: 'POST', body: new URLSearchParams({ token: tokens.refresh_token, client_id: clientId }) })
    const revoked = await fetch('/oauth2/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token }) })
    expect(revoked.status).toBe(400)
  })

  it('rejects an incorrect PKCE verifier and authorization-code reuse', async () => {
    const login = await $fetch<{ redirectTo: string }>('/api/auth/login', { method: 'POST', body: { clientId, username, password, redirectUri: 'http://localhost:5173/callback', scope: 'openid', codeChallenge: challenge } })
    const code = new URL(login.redirectTo).searchParams.get('code')!
    const invalid = await fetch('/oauth2/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: 'http://localhost:5173/callback', code, code_verifier: 'incorrect' }) })
    expect(invalid.status).toBe(400)

    const reused = await fetch('/oauth2/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: 'http://localhost:5173/callback', code, code_verifier: verifier }) })
    expect(reused.status).toBe(400)
  })
})
