import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'
import { db } from './db'

export const isPermissive = () => (process.env.COGNITO_MOCK_MODE || 'permissive') !== 'strict'
export const shouldLogCodes = () => process.env.LOG_CODES !== 'false'

export function publicUrl(event?: H3Event) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '')
  return event ? getRequestURL(event).origin : 'http://localhost:3000'
}

export function splitList(value: string | undefined) {
  return (value || '').split(',').map(item => item.trim()).filter(Boolean)
}

export function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin)
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
  } catch { return false }
}

export function allowedOrigin(origin: string) {
  if (isLoopbackOrigin(origin)) return true
  const configured = splitList(process.env.ALLOWED_ORIGINS)
  if (configured.includes('*') || configured.includes(origin)) return true
  return Boolean(db().prepare('SELECT origin FROM allowed_origins WHERE origin=?').get(origin))
}

export function callbackAllowed(uri: string) {
  try {
    const url = new URL(uri)
    if (isLoopbackOrigin(url.origin)) return true
    return splitList(process.env.ALLOWED_CALLBACK_HOSTS).includes(url.hostname)
      || splitList(process.env.ALLOWED_ORIGINS).includes(url.origin)
      || splitList(process.env.ALLOWED_ORIGINS).includes('*')
      || Boolean(db().prepare('SELECT origin FROM allowed_origins WHERE origin=?').get(url.origin))
  } catch { return false }
}
