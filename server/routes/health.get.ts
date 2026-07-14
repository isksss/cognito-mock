import { defineEventHandler } from 'h3'
import { db } from '../utils/db'

export default defineEventHandler(() => {
  db().prepare('SELECT 1').get()
  return { status: 'ok' }
})
