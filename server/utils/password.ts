import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`
}

export function verifyPassword(password: string, encoded: string) {
  const [, saltText, hashText] = encoded.split(':')
  if (!saltText || !hashText) return false
  const expected = Buffer.from(hashText, 'base64url')
  const actual = scryptSync(password, Buffer.from(saltText, 'base64url'), expected.length)
  return timingSafeEqual(actual, expected)
}
