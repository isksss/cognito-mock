<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

definePageMeta({ layout: false })
useHead({ title: '新しいパスワード' })
const schema = z.object({
  password: z.string().min(8, '8文字以上で入力してください。'),
  confirmation: z.string().min(8)
}).refine(value => value.password === value.confirmation, { path: ['confirmation'], message: 'パスワードが一致しません。' })
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ password: '', confirmation: '' })
const loading = ref(false)
const error = ref('')

async function submit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/new-password', { method: 'POST', body: { password: event.data.password } })
    await navigateTo('/users')
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.message || 'パスワードを変更できませんでした。'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="flex min-h-dvh items-center justify-center bg-elevated p-4">
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="text-lg font-semibold text-highlighted">新しいパスワードを設定</h1>
        <p class="mt-1 text-sm text-muted">仮パスワードでの初回ログインには変更が必要です。</p>
      </template>
      <UAlert v-if="error" class="mb-4" color="error" variant="soft" :description="error" />
      <UForm :schema="schema" :state="state" class="space-y-4" @submit="submit">
        <UFormField name="password" label="新しいパスワード" required>
          <UInput v-model="state.password" type="password" class="w-full" />
        </UFormField>
        <UFormField name="confirmation" label="確認入力" required>
          <UInput v-model="state.confirmation" type="password" class="w-full" />
        </UFormField>
        <UButton type="submit" label="変更してログイン" block :loading="loading" />
      </UForm>
    </UCard>
  </main>
</template>
