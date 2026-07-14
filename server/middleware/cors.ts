import { defineEventHandler, getMethod } from 'h3'
import { applyCors, noContent } from '../utils/response'

export default defineEventHandler((event) => {
  const allowed = applyCors(event)
  if (getMethod(event) === 'OPTIONS') return allowed ? noContent(event) : noContent(event)
})
