<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
const route = useRoute()
const schema = z.object({ username: z.string().min(1), email: z.email(), password: z.string().min(8) })
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ username: '', email: '', password: '' })
const error = ref(''); const loading = ref(false)
const queryString = computed(() => new URLSearchParams(Object.entries(route.query).map(([key, value]) => [key, String(value)])).toString())
async function submit(event: FormSubmitEvent<Schema>) {
  loading.value = true; error.value = ''
  try { await $fetch('/api/auth/signup', { method: 'POST', body: { ...event.data, clientId: String(route.query.client_id || 'default-client') } }); await navigateTo(`/confirm?username=${encodeURIComponent(event.data.username)}&${queryString.value}`) }
  catch (cause: any) { error.value = cause?.data?.message || cause?.message } finally { loading.value = false }
}
</script>
<template><AuthShell title="アカウントを作成" description="確認コードを使って登録を完了します">
  <UAlert v-if="error" color="error" variant="soft" :description="error" class="mb-5" />
  <UForm :schema="schema" :state="state" class="space-y-5" @submit="submit">
    <UFormField name="username" label="ユーザー名" required><UInput v-model="state.username" class="w-full" /></UFormField>
    <UFormField name="email" label="メールアドレス" required><UInput v-model="state.email" type="email" class="w-full" /></UFormField>
    <UFormField name="password" label="パスワード" description="8文字以上" required><UInput v-model="state.password" type="password" class="w-full" /></UFormField>
    <UButton type="submit" label="登録" block size="lg" :loading="loading" />
  </UForm><NuxtLink :to="`/login?${queryString}`" class="mt-5 block text-center text-sm text-primary">サインインへ戻る</NuxtLink>
</AuthShell></template>
