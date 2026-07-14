<script setup lang="ts">
type State = { pools: any[], clients: any[], users: any[], groups: any[], codes: any[], cors: any[] }
const token = ref('')
const state = ref<State>({ pools: [], clients: [], users: [], groups: [], codes: [], cors: [] })
const loading = ref(false); const error = ref('')
const active = ref('overview')
const form = reactive({ poolId: '', clientId: '', username: '', email: '', password: 'Password123!', name: '', origin: '', primaryColor: '#4f46e5', backgroundColor: '' })
const tabs = [{ label: '概要', value: 'overview', icon: 'i-lucide-layout-dashboard' }, { label: 'ユーザー', value: 'users', icon: 'i-lucide-users' }, { label: '確認コード', value: 'codes', icon: 'i-lucide-mail' }, { label: 'CORS', value: 'cors', icon: 'i-lucide-globe-2' }, { label: '設定', value: 'settings', icon: 'i-lucide-settings' }]
const headers = computed<Record<string, string>>(() => {
  const value: Record<string, string> = {}
  if (token.value) value.Authorization = `Bearer ${token.value}`
  return value
})
async function load() { loading.value = true; error.value = ''; try { state.value = await $fetch<State>('/api/admin/state', { headers: headers.value }); if (!form.poolId && state.value.pools[0]) form.poolId = state.value.pools[0].id; if (!form.clientId && state.value.clients[0]) form.clientId = state.value.clients[0].id } catch (cause: any) { error.value = cause?.data?.message || cause?.message } finally { loading.value = false } }
async function action(action: string, extra: Record<string, unknown> = {}) { try { await $fetch('/api/admin/action', { method: 'POST', headers: headers.value, body: { action, ...form, ...extra } }); await load() } catch (cause: any) { error.value = cause?.data?.message || cause?.message } }
onMounted(() => { token.value = localStorage.getItem('cognito-mock-admin-token') || ''; load() })
watch(token, value => localStorage.setItem('cognito-mock-admin-token', value))
</script>

<template>
  <div class="min-h-dvh bg-muted">
    <header class="border-b border-muted bg-default">
      <UContainer class="flex h-16 items-center justify-between">
        <div class="flex items-center gap-3"><div class="flex size-9 items-center justify-center rounded-lg bg-primary text-inverted"><UIcon name="i-lucide-shield-check" class="size-5" /></div><div><p class="font-semibold text-highlighted">Cognito Mock</p><p class="text-xs text-muted">Development console</p></div></div>
        <div class="flex items-center gap-2"><UBadge color="success" variant="soft">Running</UBadge><UColorModeButton /><UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="load" /></div>
      </UContainer>
    </header>
    <UContainer class="py-8">
      <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" class="mb-6" />
      <UTabs v-model="active" :items="tabs" class="mb-6" />

      <div v-if="active === 'overview'" class="space-y-6">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UCard v-for="item in [{ label: 'User Pools', value: state.pools.length, icon: 'i-lucide-database' }, { label: 'App Clients', value: state.clients.length, icon: 'i-lucide-app-window' }, { label: 'Users', value: state.users.length, icon: 'i-lucide-users' }, { label: 'Groups', value: state.groups.length, icon: 'i-lucide-folders' }]" :key="item.label"><div class="flex items-center justify-between"><div><p class="text-sm text-muted">{{ item.label }}</p><p class="mt-1 text-3xl font-semibold text-highlighted">{{ item.value }}</p></div><UIcon :name="item.icon" class="size-8 text-primary" /></div></UCard>
        </div>
        <UCard><template #header><h2 class="font-semibold">User Pools / App Clients</h2></template><div class="space-y-3"><div v-for="pool in state.pools" :key="pool.id" class="rounded-lg border border-muted p-4"><div class="flex flex-wrap items-center justify-between gap-2"><div><p class="font-medium">{{ pool.name }}</p><code class="text-xs text-muted">{{ pool.id }}</code></div><UBadge>{{ state.clients.filter(c => c.pool_id === pool.id).length }} clients</UBadge></div><div class="mt-3 flex flex-wrap gap-2"><UBadge v-for="client in state.clients.filter(c => c.pool_id === pool.id)" :key="client.id" color="neutral" variant="soft">{{ client.name }} · {{ client.id }}</UBadge></div></div><UAlert v-if="!state.pools.length" title="まだPoolがありません" description="SDKからアクセスすると自動作成されます。" color="info" variant="soft" /></div></UCard>
      </div>

      <UCard v-else-if="active === 'users'"><template #header><div class="flex items-center justify-between"><h2 class="font-semibold">Users</h2><UBadge color="neutral">{{ state.users.length }}</UBadge></div></template><div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead class="border-b border-muted text-muted"><tr><th class="p-3">Username</th><th class="p-3">Pool</th><th class="p-3">Status</th><th class="p-3">Email</th><th class="p-3" /></tr></thead><tbody><tr v-for="user in state.users" :key="user.id" class="border-b border-muted"><td class="p-3 font-medium">{{ user.username }}</td><td class="p-3"><code class="text-xs">{{ user.pool_id }}</code></td><td class="p-3"><UBadge :color="user.status === 'CONFIRMED' ? 'success' : 'warning'" variant="soft">{{ user.status }}</UBadge></td><td class="p-3 text-muted">{{ user.attributes.email }}</td><td class="p-3 text-right"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" @click="action('deleteUser', { poolId: user.pool_id, username: user.username })" /></td></tr></tbody></table></div></UCard>

      <UCard v-else-if="active === 'codes'"><template #header><h2 class="font-semibold">擬似受信箱</h2></template><div class="space-y-3"><div v-for="item in state.codes" :key="item.id" class="flex items-center justify-between rounded-lg border border-muted p-4"><div><p class="font-medium">{{ item.username }}</p><p class="text-xs text-muted">{{ item.kind }} · {{ new Date(item.created_at).toLocaleString() }}</p></div><code class="rounded-md bg-elevated px-3 py-2 text-lg font-semibold tracking-widest">{{ item.code }}</code></div><UAlert v-if="!state.codes.length" title="通知はありません" color="info" variant="soft" /></div></UCard>

      <UCard v-else-if="active === 'cors'"><template #header><div class="flex items-center justify-between"><h2 class="font-semibold">CORS requests</h2><UButton label="履歴を消去" color="neutral" variant="outline" size="sm" @click="action('clearEvents')" /></div></template><div class="space-y-2"><div v-for="item in state.cors" :key="item.id" class="flex items-center gap-3 rounded-lg border border-muted p-3"><UBadge :color="item.allowed ? 'success' : 'error'" variant="soft">{{ item.allowed ? 'Allowed' : 'Rejected' }}</UBadge><code class="min-w-0 flex-1 truncate text-xs">{{ item.origin }} → {{ item.path }}</code></div></div></UCard>

      <div v-else class="grid gap-6 lg:grid-cols-2">
        <UCard><template #header><h2 class="font-semibold">管理アクセス</h2></template><UFormField name="token" label="ADMIN_TOKEN" description="未設定の場合は空欄"><UInput v-model="token" type="password" class="w-full" /></UFormField></UCard>
        <UCard><template #header><h2 class="font-semibold">ユーザーを作成</h2></template><div class="space-y-4"><UFormField name="pool" label="Pool"><USelect v-model="form.poolId" :items="state.pools.map(p => ({ label: p.name, value: p.id }))" class="w-full" /></UFormField><UFormField name="username" label="Username"><UInput v-model="form.username" class="w-full" /></UFormField><UFormField name="email" label="Email"><UInput v-model="form.email" class="w-full" /></UFormField><UFormField name="password" label="Password"><UInput v-model="form.password" type="password" class="w-full" /></UFormField><UButton label="作成" @click="action('createUser')" /></div></UCard>
        <UCard><template #header><h2 class="font-semibold">App Clientテーマ</h2></template><div class="space-y-4"><UFormField name="client" label="Client"><USelect v-model="form.clientId" :items="state.clients.map(c => ({ label: c.name, value: c.id }))" class="w-full" /></UFormField><UFormField name="primary" label="Primary color"><UInput v-model="form.primaryColor" type="color" /></UFormField><UFormField name="background" label="Background color"><UInput v-model="form.backgroundColor" type="color" /></UFormField><UButton label="テーマを保存" @click="action('updateTheme', { theme: { primaryColor: form.primaryColor, backgroundColor: form.backgroundColor } })" /></div></UCard>
        <UCard><template #header><h2 class="font-semibold">許可origin</h2></template><div class="flex gap-2"><UInput v-model="form.origin" placeholder="https://app.example.test" class="flex-1" /><UButton label="追加" @click="action('addOrigin')" /></div></UCard>
      </div>
    </UContainer>
  </div>
</template>
