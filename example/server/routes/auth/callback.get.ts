import { getQuery, sendRedirect } from 'h3'
import { establishSession } from '../../utils/auth'
import { cognitoMessage } from '../../utils/cognito'
import { validOAuthCallback } from '../../utils/oauth'
import { exampleSession } from '../../utils/session'

interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in: number
  token_type: string
}

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const config = useRuntimeConfig(event)
  const session = await exampleSession(event)
  const oauth = session.data.oauth

  try {
    if (!validOAuthCallback(oauth, query.code, query.state)) {
      throw new Error('OAuth state が無効または期限切れです。')
    }
    const tokens = await $fetch<TokenResponse>(`${config.cognitoEndpoint}/oauth2/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.cognitoClientId,
        code: String(query.code),
        redirect_uri: `${config.appUrl}/auth/callback`,
        code_verifier: oauth.verifier
      })
    })
    await session.clear()
    await establishSession(event, {
      AccessToken: tokens.access_token,
      RefreshToken: tokens.refresh_token,
      IdToken: tokens.id_token,
      ExpiresIn: tokens.expires_in,
      TokenType: tokens.token_type
    })
    return sendRedirect(event, '/users', 302)
  } catch (error) {
    await session.clear()
    const message = error instanceof Error ? error.message : cognitoMessage(error)
    return sendRedirect(event, `/login?error=${encodeURIComponent(message)}`, 302)
  }
})
