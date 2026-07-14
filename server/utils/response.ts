import type { H3Event } from 'h3'
import { getHeader, getRequestURL, setHeader, setResponseStatus } from 'h3'
import { allowedOrigin } from './config'
import { db, trimCorsEvents } from './db'
import { epochMs } from './ids'

export function applyCors(event: H3Event) {
  const origin = getHeader(event, 'origin')
  if (!origin) return true
  const allowed = allowedOrigin(origin)
  db().prepare('INSERT INTO cors_events(origin,path,allowed,created_at) VALUES(?,?,?,?)').run(origin, getRequestURL(event).pathname, Number(allowed), epochMs())
  trimCorsEvents()
  if (allowed) {
    setHeader(event, 'access-control-allow-origin', origin)
    setHeader(event, 'vary', 'Origin')
    setHeader(event, 'access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    setHeader(event, 'access-control-allow-headers', 'Content-Type, Authorization, X-Amz-Target, X-Amz-Date, X-Amz-Security-Token, X-Api-Key, X-XSRF-TOKEN')
    setHeader(event, 'access-control-expose-headers', 'x-amzn-errortype, x-amzn-requestid')
    setHeader(event, 'access-control-max-age', 86400)
  }
  return allowed
}

export function noContent(event: H3Event) {
  setResponseStatus(event, 204)
  return null
}
