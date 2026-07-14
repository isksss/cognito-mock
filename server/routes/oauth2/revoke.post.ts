import { defineEventHandler, readFormData, setResponseStatus } from 'h3'
import { revokeOpaqueToken } from '../../utils/tokens'

export default defineEventHandler(async (event) => {
  const form = await readFormData(event)
  revokeOpaqueToken(String(form.get('token') || ''))
  setResponseStatus(event, 200)
  return null
})
