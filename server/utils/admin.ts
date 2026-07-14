import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { cognitoError } from './errors'

export function requireAdmin(event: H3Event) {
  const expected = process.env.ADMIN_TOKEN || ''
  if (!expected) return
  const authorization = getHeader(event, 'authorization') || ''
  if (authorization !== `Bearer ${expected}`) cognitoError('NotAuthorizedException', 'Invalid admin token.', 401)
}
