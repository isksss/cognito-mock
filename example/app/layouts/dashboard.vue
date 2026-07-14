<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
const { data: session } = await useFetch('/api/auth/session', { headers })
const loggingOut = ref(false)
const items: NavigationMenuItem[] = [{ label: 'ユーザー管理', icon: 'i-lucide-users', to: '/users' }]

async function logout() {
  loggingOut.value = true
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await navigateTo('/login')
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible resizable>
      <template #header="{ collapsed }">
        <div class="flex items-center gap-3 px-2">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-inverted">
            <UIcon name="i-lucide-shield-check" class="size-4" />
          </div>
          <div v-if="!collapsed" class="min-w-0">
            <p class="truncate font-semibold text-highlighted">Cognito Mock</p>
            <p class="truncate text-xs text-muted">ユーザー管理サンプル</p>
          </div>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="items" orientation="vertical" />
      </template>

      <template #footer="{ collapsed }">
        <div v-if="!collapsed" class="mb-2 px-2 text-xs text-muted">
          {{ session?.authenticated ? session.user.name : '' }}
        </div>
        <UButton
          :icon="collapsed ? 'i-lucide-log-out' : undefined"
          :label="collapsed ? undefined : 'ログアウト'"
          color="neutral"
          variant="ghost"
          block
          :loading="loggingOut"
          @click="logout"
        />
      </template>
    </UDashboardSidebar>
    <slot />
  </UDashboardGroup>
</template>
