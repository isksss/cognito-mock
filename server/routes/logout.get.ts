import { defineEventHandler, deleteCookie, getQuery, sendRedirect } from 'h3'
import { ensureClient, learnAuthorize } from '../utils/models'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  deleteCookie(event, 'cognito_mock_session', { path: '/' })
  const logoutUri = String(query.logout_uri || '')
  if (logoutUri) {
    const client = ensureClient(String(query.client_id || 'default-client'))
    learnAuthorize(client, logoutUri, true)
    return sendRedirect(event, logoutUri, 302)
  }
  return sendRedirect(event, `/login?${new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)])).toString()}`, 302)
})
