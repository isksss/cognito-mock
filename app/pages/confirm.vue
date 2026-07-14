<script setup lang="ts">
import * as z from 'zod'; import type { FormSubmitEvent } from '@nuxt/ui'
const route = useRoute(); const schema = z.object({ code: z.string().length(6) }); type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ code: '' }); const error = ref(''); const loading = ref(false)
const cleanQuery = computed(() => new URLSearchParams(Object.entries(route.query).filter(([key]) => key !== 'username').map(([key, value]) => [key, String(value)])).toString())
async function submit(event: FormSubmitEvent<Schema>) { loading.value = true; error.value = ''; try { await $fetch('/api/auth/confirm', { method: 'POST', body: { username: String(route.query.username), code: event.data.code, clientId: String(route.query.client_id || 'default-client') } }); await navigateTo(`/login?${cleanQuery.value}`) } catch (cause: any) { error.value = cause?.data?.message || cause?.message } finally { loading.value = false } }
</script>
<template><AuthShell title="アカウントを確認" description="擬似受信箱に届いた6桁のコードを入力してください"><UAlert v-if="error" color="error" variant="soft" :description="error" class="mb-5" /><UForm :schema="schema" :state="state" class="space-y-5" @submit="submit"><UFormField name="code" label="確認コード" required><UInput v-model="state.code" inputmode="numeric" maxlength="6" class="w-full" /></UFormField><UButton type="submit" label="確認" block size="lg" :loading="loading" /></UForm></AuthShell></template>
