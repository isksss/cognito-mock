import type { H3Event } from 'h3'
import { getHeader, getRequestURL, useSession } from 'h3'
import type { SessionData } from './types'

export function exampleSession(event: H3Event) {
  const config = useRuntimeConfig(event)
  return useSession<SessionData>(event, {
    name: 'cognito-example-session',
    password: config.sessionPassword,
    maxAge: 30 * 24 * 60 * 60,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(config.appUrl).protocol === 'https:',
      path: '/'
    }
  })
}

export function assertSameOrigin(event: H3Event) {
  const origin = getHeader(event, 'origin')
  if (!origin) return
  const configured = new URL(useRuntimeConfig(event).appUrl).origin
  if (origin !== configured && origin !== getRequestURL(event).origin) {
    throw createError({ statusCode: 403, statusMessage: '許可されていないオリジンです。' })
  }
}
