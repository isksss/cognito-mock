<script setup lang="ts">
import * as z from 'zod'; import type { FormSubmitEvent } from '@nuxt/ui'
const route = useRoute(); const schema = z.object({ username: z.string().min(1) }); type Schema = z.output<typeof schema>; const state = reactive<Partial<Schema>>({ username: '' }); const error = ref('')
const queryString = computed(() => new URLSearchParams(Object.entries(route.query).map(([key, value]) => [key, String(value)])).toString())
async function submit(event: FormSubmitEvent<Schema>) { try { await $fetch('/api/auth/forgot', { method: 'POST', body: { username: event.data.username, clientId: String(route.query.client_id || 'default-client') } }); await navigateTo(`/reset-password?username=${encodeURIComponent(event.data.username)}&${queryString.value}`) } catch (cause: any) { error.value = cause?.data?.message || cause?.message } }
</script>
<template><AuthShell title="パスワードをリセット" description="確認コードを発行します"><UAlert v-if="error" color="error" variant="soft" :description="error" class="mb-5" /><UForm :schema="schema" :state="state" class="space-y-5" @submit="submit"><UFormField name="username" label="ユーザー名またはメール" required><UInput v-model="state.username" class="w-full" /></UFormField><UButton type="submit" label="コードを発行" block size="lg" /></UForm></AuthShell></template>
