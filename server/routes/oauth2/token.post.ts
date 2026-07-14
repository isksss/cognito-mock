import { createHash, timingSafeEqual } from 'node:crypto'
import { defineEventHandler, getHeader, readFormData, setHeader } from 'h3'
import { consumeAuthorizationCode, consumeOpaqueToken, getOpaqueToken, issueTokens } from '../../utils/tokens'
import { getClient } from '../../utils/models'
import { cognitoError } from '../../utils/errors'
import { json } from '../../utils/ids'

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a); const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const form = await readFormData(event)
  const grant = String(form.get('grant_type') || '')
  let clientId = String(form.get('client_id') || '')
  let suppliedSecret = String(form.get('client_secret') || '')
  const authorization = getHeader(event, 'authorization')
  if (authorization?.startsWith('Basic ')) {
    const [basicId, basicSecret] = Buffer.from(authorization.slice(6), 'base64').toString().split(':')
    clientId = basicId || clientId; suppliedSecret = basicSecret || suppliedSecret
  }
  const client = getClient(clientId)
  if (!client) cognitoError('invalid_client', 'Unknown client.', 401)
  if (client.secret && !safeEqual(client.secret, suppliedSecret)) cognitoError('invalid_client', 'Invalid client secret.', 401)
  if (grant === 'authorization_code') {
    const row = getOpaqueToken(String(form.get('code') || ''), 'authorization_code')
    if (row.client_id !== clientId || row.redirect_uri !== String(form.get('redirect_uri') || '')) cognitoError('invalid_grant', 'Authorization code does not match this request.')
    if (row.code_challenge) {
      const actual = createHash('sha256').update(String(form.get('code_verifier') || '')).digest('base64url')
      if (!safeEqual(String(row.code_challenge), actual)) cognitoError('invalid_grant', 'Invalid PKCE verifier.')
    }
    if (!consumeAuthorizationCode(String(row.id))) cognitoError('invalid_grant', 'Authorization code has already been used.')
    const result = await issueTokens(event, String(row.pool_id), clientId, String(row.user_id), json<string[]>(String(row.scopes), []), row.nonce ? String(row.nonce) : undefined)
    return { access_token: result.AccessToken, id_token: result.IdToken, refresh_token: result.RefreshToken, expires_in: result.ExpiresIn, token_type: result.TokenType }
  }
  if (grant === 'refresh_token') {
    const row = consumeOpaqueToken(String(form.get('refresh_token') || ''), 'refresh')
    if (row.client_id !== clientId) cognitoError('invalid_grant', 'Refresh token does not match this client.')
    const result = await issueTokens(event, String(row.pool_id), clientId, String(row.user_id), json<string[]>(String(row.scopes), []), undefined, false)
    return { access_token: result.AccessToken, id_token: result.IdToken, expires_in: result.ExpiresIn, token_type: result.TokenType }
  }
  cognitoError('unsupported_grant_type', 'Only authorization_code and refresh_token are supported.')
})
