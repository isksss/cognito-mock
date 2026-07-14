export default defineNuxtRouteMiddleware(async () => {
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  const session = await $fetch('/api/auth/session', { headers }).catch(() => ({ authenticated: false as const }))
  if (!session.authenticated) return navigateTo('/login')
})
