import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 64) as Buffer
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`
}

export async function verifyPassword(password: string, encoded: string) {
  const [, saltText, hashText] = encoded.split(':')
  if (!saltText || !hashText) return false
  const expected = Buffer.from(hashText, 'base64url')
  const actual = await scryptAsync(password, Buffer.from(saltText, 'base64url'), expected.length) as Buffer
  return timingSafeEqual(actual, expected)
}
