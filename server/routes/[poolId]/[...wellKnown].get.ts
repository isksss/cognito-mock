import { createError, defineEventHandler, getRouterParam } from 'h3'
import { ensurePool } from '../../utils/models'
import { publicUrl } from '../../utils/config'
import { jwks } from '../../utils/tokens'

export default defineEventHandler(async event => {
  const poolId = getRouterParam(event, 'poolId')!
  const path = getRouterParam(event, 'wellKnown') || ''
  ensurePool(poolId)
  if (path === '.well-known/jwks.json') return jwks(poolId)
  if (path !== '.well-known/openid-configuration') throw createError({ statusCode: 404 })
  const origin = publicUrl(event); const issuer = `${origin}/${poolId}`
  return {
    issuer,
    authorization_endpoint: `${origin}/oauth2/authorize`, token_endpoint: `${origin}/oauth2/token`, userinfo_endpoint: `${origin}/oauth2/userInfo`, revocation_endpoint: `${origin}/oauth2/revoke`, jwks_uri: `${issuer}/.well-known/jwks.json`,
    response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], scopes_supported: ['openid', 'email', 'profile', 'aws.cognito.signin.user.admin'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'], code_challenge_methods_supported: ['S256']
  }
})
