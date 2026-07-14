<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const route = useRoute()
const lang = computed(() => route.query.lang === 'ja' || useCookie('cognito_mock_lang').value === 'ja' ? 'ja' : 'en')
const t = computed(() => lang.value === 'ja' ? {
  title: 'サインイン', description: 'アカウント情報を入力してください', username: 'ユーザー名またはメール', password: 'パスワード', submit: 'サインイン', signup: 'アカウントを作成', forgot: 'パスワードを忘れた場合'
} : { title: 'Sign in', description: 'Enter your account details', username: 'Username or email', password: 'Password', submit: 'Sign in', signup: 'Create account', forgot: 'Forgot password?' })
const schema = z.object({ username: z.string().min(1), password: z.string().min(1) })
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ username: String(route.query.login_hint || ''), password: '' })
const error = ref('')
const loading = ref(false)
const queryString = computed(() => new URLSearchParams(Object.entries(route.query).map(([key, value]) => [key, String(value)])).toString())

async function submit(event: FormSubmitEvent<Schema>) {
  loading.value = true; error.value = ''
  try {
    const result = await $fetch<{ redirectTo?: string, challenge?: string }>('/api/auth/login', { method: 'POST', body: {
      ...event.data, clientId: String(route.query.client_id || 'default-client'), redirectUri: String(route.query.redirect_uri || 'http://localhost:3001/callback'),
      scope: String(route.query.scope || 'openid'), state: String(route.query.state || ''), nonce: String(route.query.nonce || ''), codeChallenge: String(route.query.code_challenge || '')
    } })
    if (result.challenge) { await navigateTo(`/new-password?${queryString.value}`); return }
    if (result.redirectTo) await navigateTo(result.redirectTo, { external: true })
  } catch (cause: any) { error.value = cause?.data?.message || cause?.message || 'Authentication failed' } finally { loading.value = false }
}
</script>

<template>
  <AuthShell :title="t.title" :description="t.description">
    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" class="mb-5" />
    <UForm :schema="schema" :state="state" class="space-y-5" @submit="submit">
      <UFormField name="username" :label="t.username" required><UInput v-model="state.username" autocomplete="username" class="w-full" /></UFormField>
      <UFormField name="password" :label="t.password" required><UInput v-model="state.password" type="password" autocomplete="current-password" class="w-full" /></UFormField>
      <UButton type="submit" block size="lg" :loading="loading" :label="t.submit" />
    </UForm>
    <div class="mt-5 flex items-center justify-between text-sm">
      <NuxtLink :to="`/forgot-password?${queryString}`" class="text-primary">{{ t.forgot }}</NuxtLink>
      <NuxtLink :to="`/signup?${queryString}`" class="text-primary">{{ t.signup }}</NuxtLink>
    </div>
  </AuthShell>
</template>
