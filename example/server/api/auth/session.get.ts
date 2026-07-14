import { requireAdminSession } from '../../utils/auth'
import { exampleSession } from '../../utils/session'

export default defineEventHandler(async event => {
  const session = await exampleSession(event)
  if (!session.data.accessToken) return { authenticated: false as const }
  try {
    const identity = await requireAdminSession(event)
    return {
      authenticated: true as const,
      user: { username: identity.username, name: identity.attributes.name || identity.username }
    }
  } catch {
    return { authenticated: false as const }
  }
})
