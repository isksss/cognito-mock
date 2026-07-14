import { randomBytes, randomUUID } from 'node:crypto'

export const id = (size = 24) => randomBytes(size).toString('base64url')
export const uuid = () => randomUUID()
export const now = () => Math.floor(Date.now() / 1000)
export const code = () => String(Math.floor(100000 + Math.random() * 900000))
export const epochMs = () => Date.now()

export function json<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}
