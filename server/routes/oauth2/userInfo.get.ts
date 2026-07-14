import { defineEventHandler, getHeader } from 'h3'
import { verifyAccessToken } from '../../utils/tokens'
import { cognitoError } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  const authorization = getHeader(event, 'authorization') || ''
  if (!authorization.startsWith('Bearer ')) cognitoError('NotAuthorizedException', 'Missing bearer token.', 401)
  const payload = await verifyAccessToken(authorization.slice(7))
  const { iss: _iss, exp: _exp, iat: _iat, jti: _jti, token_use: _type, client_id: _client, scope: _scope, ...profile } = payload
  return profile
})
