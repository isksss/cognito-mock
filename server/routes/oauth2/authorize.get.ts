import { defineEventHandler, getQuery, sendRedirect, setCookie } from 'h3'
import { ensureClient, learnAuthorize, validateManagedLoginRequest } from '../../utils/models'
import { badRequest } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clientId = String(query.client_id || '')
  const redirectUri = String(query.redirect_uri || '')
  if (!clientId || !redirectUri) badRequest('client_id and redirect_uri are required')
  if (query.response_type !== 'code') badRequest('Only response_type=code is supported')
  if (query.code_challenge_method && query.code_challenge_method !== 'S256') badRequest('Only S256 PKCE is supported')
  const scopes = String(query.scope || 'openid').split(/[ +]/).filter(Boolean)
  const client = ensureClient(clientId)
  learnAuthorize(client, redirectUri, false, scopes)
  validateManagedLoginRequest(ensureClient(clientId), redirectUri, scopes, query.code_challenge ? String(query.code_challenge) : undefined)
  if (query.lang === 'ja' || query.lang === 'en') setCookie(event, 'cognito_mock_lang', query.lang, { sameSite: 'lax', httpOnly: false, path: '/' })
  return sendRedirect(event, `/login?${new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)])).toString()}`, 302)
})
