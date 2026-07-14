<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

definePageMeta({ layout: false })
useHead({ title: 'ログイン' })

const route = useRoute()
const loading = ref(false)
const error = ref(typeof route.query.error === 'string' ? route.query.error : '')
const fields: AuthFormField[] = [
  { name: 'username', type: 'text', label: 'ユーザー名', placeholder: 'developer@example.com', required: true },
  { name: 'password', type: 'password', label: 'パスワード', placeholder: 'Password123!', required: true }
]
const schema = z.object({ username: z.string().min(1, 'ユーザー名を入力してください。'), password: z.string().min(8, '8文字以上で入力してください。') })
type Schema = z.output<typeof schema>

async function login(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''
  try {
    const result = await $fetch('/api/auth/login', { method: 'POST', body: event.data })
    await navigateTo('challenge' in result && result.challenge === 'NEW_PASSWORD_REQUIRED' ? '/new-password' : '/users')
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.data?.message || cause?.message || 'ログインに失敗しました。'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="flex min-h-dvh items-center justify-center bg-elevated p-4">
    <UPageCard class="w-full max-w-md">
      <UAuthForm
        :schema="schema"
        :fields="fields"
        title="管理画面へログイン"
        description="cognito-mock を使った2種類の認証方法を試せます。"
        icon="i-lucide-shield-check"
        :submit="{ label: 'ID・パスワードでログイン', loading, block: true }"
        @submit="login"
      >
        <template #validation>
          <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
        </template>
        <template #footer>
          <div class="space-y-3">
            <USeparator label="または" />
            <UButton
              label="Managed Login（PKCE）を使う"
              icon="i-lucide-external-link"
              color="neutral"
              variant="outline"
              block
              to="/api/auth/oauth"
              external
            />
            <p class="text-center text-xs text-muted">初期ユーザー: developer@example.com / Password123!</p>
          </div>
        </template>
      </UAuthForm>
    </UPageCard>
  </main>
</template>
