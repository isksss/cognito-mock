import { sendRedirect } from 'h3'
import { createPkce } from '../../utils/oauth'
import { exampleSession } from '../../utils/session'

export default defineEventHandler(async event => {
  const config = useRuntimeConfig(event)
  const { state, verifier, challenge } = createPkce()
  const session = await exampleSession(event)
  await session.clear()
  await session.update({ oauth: { state, verifier, createdAt: Date.now() } })

  const authorize = new URL('/oauth2/authorize', config.public.cognitoUrl)
  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.cognitoClientId,
    redirect_uri: `${config.appUrl}/auth/callback`,
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    lang: 'ja'
  }).toString()
  return sendRedirect(event, authorize.toString(), 302)
})
