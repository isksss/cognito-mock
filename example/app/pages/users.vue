<script setup lang="ts">
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import * as z from 'zod'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useHead({ title: 'ユーザー管理' })

interface UserRow {
  username: string
  email: string
  name: string
  enabled: boolean
  status: string
  createdAt?: string
  updatedAt?: string
  groups: string[]
}

interface UserResponse { users: UserRow[], groups: string[] }

const toast = useToast()
const search = ref('')
const requestHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined
const { data, status, refresh } = await useAsyncData('example-users', () => $fetch<UserResponse>('/api/users', { headers: requestHeaders }))
const users = computed(() => data.value?.users || [])
const groups = computed(() => data.value?.groups || [])
const filteredUsers = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return users.value
  return users.value.filter(user => [user.username, user.email, user.name, ...user.groups].some(value => value.toLowerCase().includes(query)))
})

const columns: TableColumn<UserRow>[] = [
  { accessorKey: 'username', header: 'ユーザー' },
  { accessorKey: 'status', header: '状態' },
  { accessorKey: 'groups', header: 'グループ' },
  { id: 'actions' }
]

const createOpen = ref(false)
const editOpen = ref(false)
const passwordOpen = ref(false)
const groupsOpen = ref(false)
const deleteOpen = ref(false)
const saving = ref(false)
const selected = ref<UserRow>()

const createSchema = z.object({
  username: z.string().min(1, 'ユーザー名を入力してください。').refine(value => !value.includes('/'), '/ は使用できません。'),
  email: z.email('正しいメールアドレスを入力してください。'),
  name: z.string().min(1, '表示名を入力してください。'),
  temporaryPassword: z.string().min(8, '8文字以上で入力してください。'),
  groups: z.array(z.string())
})
type CreateSchema = z.output<typeof createSchema>
const createState = reactive<CreateSchema>({ username: '', email: '', name: '', temporaryPassword: 'TemporaryPassword123!', groups: [] })

const editSchema = z.object({
  email: z.email('正しいメールアドレスを入力してください。'),
  name: z.string().min(1, '表示名を入力してください。'),
  enabled: z.boolean()
})
type EditSchema = z.output<typeof editSchema>
const editState = reactive<EditSchema>({ email: '', name: '', enabled: true })

const passwordSchema = z.object({ password: z.string().min(8, '8文字以上で入力してください。'), permanent: z.boolean() })
type PasswordSchema = z.output<typeof passwordSchema>
const passwordState = reactive<PasswordSchema>({ password: '', permanent: true })

function message(error: any) {
  return error?.data?.statusMessage || error?.data?.message || error?.message || '操作に失敗しました。'
}

function success(title: string) {
  toast.add({ title, color: 'success', icon: 'i-lucide-circle-check' })
}

function showError(error: unknown) {
  toast.add({ title: '操作に失敗しました', description: message(error), color: 'error', icon: 'i-lucide-circle-alert' })
}

function select(user: UserRow) {
  selected.value = user
}

function openCreate() {
  createOpen.value = true
}

function openEdit(user: UserRow) {
  select(user)
  Object.assign(editState, { email: user.email, name: user.name, enabled: user.enabled })
  editOpen.value = true
}

function openPassword(user: UserRow) {
  select(user)
  Object.assign(passwordState, { password: '', permanent: true })
  passwordOpen.value = true
}

function openGroups(user: UserRow) {
  select(user)
  groupsOpen.value = true
}

function openDelete(user: UserRow) {
  select(user)
  deleteOpen.value = true
}

function actionItems(user: UserRow): any[][] {
  return [[
    { label: '編集', icon: 'i-lucide-pencil', onSelect: () => openEdit(user) },
    { label: 'パスワード設定', icon: 'i-lucide-key-round', onSelect: () => openPassword(user) },
    { label: 'グループ所属', icon: 'i-lucide-users-round', onSelect: () => openGroups(user) }
  ], [
    { label: '削除', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDelete(user) }
  ]]
}

async function createUser(event: FormSubmitEvent<CreateSchema>) {
  saving.value = true
  try {
    await $fetch('/api/users', { method: 'POST', body: event.data })
    createOpen.value = false
    Object.assign(createState, { username: '', email: '', name: '', temporaryPassword: 'TemporaryPassword123!', groups: [] })
    await refresh()
    success('ユーザーを作成しました')
  } catch (error) { showError(error) } finally { saving.value = false }
}

async function updateUser(event: FormSubmitEvent<EditSchema>) {
  if (!selected.value) return
  saving.value = true
  try {
    await $fetch(`/api/users/${encodeURIComponent(selected.value.username)}`, { method: 'PATCH', body: event.data })
    editOpen.value = false
    await refresh()
    success('ユーザーを更新しました')
  } catch (error) { showError(error) } finally { saving.value = false }
}

async function setPassword(event: FormSubmitEvent<PasswordSchema>) {
  if (!selected.value) return
  saving.value = true
  try {
    await $fetch(`/api/users/${encodeURIComponent(selected.value.username)}/password`, { method: 'POST', body: event.data })
    passwordOpen.value = false
    await refresh()
    success(event.data.permanent ? 'パスワードを更新しました' : '仮パスワードを設定しました')
  } catch (error) { showError(error) } finally { saving.value = false }
}

async function changeGroup(group: string, member: boolean) {
  if (!selected.value) return
  saving.value = true
  try {
    await $fetch(`/api/users/${encodeURIComponent(selected.value.username)}/groups`, { method: 'PATCH', body: { group, member } })
    await refresh()
    selected.value = users.value.find(user => user.username === selected.value?.username)
    success(member ? `${group} に追加しました` : `${group} から解除しました`)
  } catch (error) { showError(error) } finally { saving.value = false }
}

async function deleteUser() {
  if (!selected.value) return
  saving.value = true
  try {
    await $fetch(`/api/users/${encodeURIComponent(selected.value.username)}`, { method: 'DELETE' })
    deleteOpen.value = false
    await refresh()
    success('ユーザーを削除しました')
  } catch (error) { showError(error) } finally { saving.value = false }
}
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar title="ユーザー管理">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <UColorModeButton />
          <UButton label="ユーザーを作成" icon="i-lucide-user-plus" @click="openCreate" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UInput v-model="search" icon="i-lucide-search" placeholder="ユーザー名、メール、グループで検索" class="w-80 max-w-full" />
        </template>
        <template #right>
          <UBadge color="neutral" variant="soft">{{ filteredUsers.length }} ユーザー</UBadge>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh()" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UContainer>
        <UTable :data="filteredUsers" :columns="columns" :loading="status === 'pending'">
          <template #username-cell="{ row }">
            <div>
              <p class="font-medium text-highlighted">{{ row.original.name || row.original.username }}</p>
              <p class="text-xs text-muted">{{ row.original.username }}</p>
              <p class="text-xs text-muted">{{ row.original.email }}</p>
            </div>
          </template>
          <template #status-cell="{ row }">
            <div class="flex flex-wrap gap-1">
              <UBadge :color="row.original.enabled ? 'success' : 'neutral'" variant="soft">
                {{ row.original.enabled ? '有効' : '無効' }}
              </UBadge>
              <UBadge :color="row.original.status === 'CONFIRMED' ? 'success' : 'warning'" variant="outline">
                {{ row.original.status }}
              </UBadge>
            </div>
          </template>
          <template #groups-cell="{ row }">
            <div class="flex flex-wrap gap-1">
              <UBadge v-for="group in row.original.groups" :key="group" color="neutral" variant="soft">{{ group }}</UBadge>
              <span v-if="!row.original.groups.length" class="text-xs text-muted">所属なし</span>
            </div>
          </template>
          <template #actions-cell="{ row }">
            <div class="text-right">
              <UDropdownMenu :items="actionItems(row.original)">
                <UButton
                  icon="i-lucide-ellipsis"
                  color="neutral"
                  variant="ghost"
                  aria-label="操作"
                  :data-testid="`actions-${row.original.username}`"
                />
              </UDropdownMenu>
            </div>
          </template>
          <template #empty>
            <div class="py-10 text-center text-sm text-muted">条件に一致するユーザーはいません。</div>
          </template>
        </UTable>
      </UContainer>
    </template>
  </UDashboardPanel>

  <USlideover v-model:open="createOpen" title="ユーザーを作成" description="仮パスワードで新しいユーザーを登録します。">
    <template #body>
      <UForm id="create-user-form" :schema="createSchema" :state="createState" class="space-y-4" @submit="createUser">
        <UFormField name="username" label="ユーザー名" required><UInput v-model="createState.username" class="w-full" /></UFormField>
        <UFormField name="email" label="メールアドレス" required><UInput v-model="createState.email" type="email" class="w-full" /></UFormField>
        <UFormField name="name" label="表示名" required><UInput v-model="createState.name" class="w-full" /></UFormField>
        <UFormField name="temporaryPassword" label="仮パスワード" required><UInput v-model="createState.temporaryPassword" type="password" class="w-full" /></UFormField>
        <UFormField name="groups" label="初期グループ"><UCheckboxGroup v-model="createState.groups" :items="groups" /></UFormField>
      </UForm>
    </template>
    <template #footer="{ close }">
      <UButton label="キャンセル" color="neutral" variant="outline" @click="close" />
      <UButton type="submit" form="create-user-form" label="作成" :loading="saving" />
    </template>
  </USlideover>

  <UModal v-model:open="editOpen" title="ユーザーを編集" :description="selected?.username" :ui="{ footer: 'justify-end' }">
    <template #body>
      <UForm id="edit-user-form" :schema="editSchema" :state="editState" class="space-y-4" @submit="updateUser">
        <UFormField name="email" label="メールアドレス" required><UInput v-model="editState.email" type="email" class="w-full" /></UFormField>
        <UFormField name="name" label="表示名" required><UInput v-model="editState.name" class="w-full" /></UFormField>
        <UFormField name="enabled" label="ログインを許可"><USwitch v-model="editState.enabled" /></UFormField>
      </UForm>
    </template>
    <template #footer="{ close }">
      <UButton label="キャンセル" color="neutral" variant="outline" @click="close" />
      <UButton type="submit" form="edit-user-form" label="保存" :loading="saving" />
    </template>
  </UModal>

  <UModal v-model:open="passwordOpen" title="パスワードを設定" :description="selected?.username" :ui="{ footer: 'justify-end' }">
    <template #body>
      <UForm id="password-form" :schema="passwordSchema" :state="passwordState" class="space-y-4" @submit="setPassword">
        <UFormField name="password" label="新しいパスワード" required><UInput v-model="passwordState.password" type="password" class="w-full" /></UFormField>
        <UFormField name="permanent" label="恒久パスワード" description="オフの場合、次回ログイン時にパスワード変更が必要です。"><USwitch v-model="passwordState.permanent" /></UFormField>
      </UForm>
    </template>
    <template #footer="{ close }">
      <UButton label="キャンセル" color="neutral" variant="outline" @click="close" />
      <UButton type="submit" form="password-form" label="設定" :loading="saving" />
    </template>
  </UModal>

  <UModal v-model:open="groupsOpen" title="グループ所属" :description="selected?.username">
    <template #body>
      <div class="space-y-3">
        <div v-for="group in groups" :key="group" class="flex items-center justify-between rounded-lg border border-muted p-3">
          <span class="font-medium text-highlighted">{{ group }}</span>
          <USwitch
            :model-value="selected?.groups.includes(group)"
            :disabled="saving"
            :data-testid="`group-${group}`"
            @update:model-value="value => changeGroup(group, Boolean(value))"
          />
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="deleteOpen"
    title="ユーザーを削除"
    :description="`${selected?.username || ''} を削除します。この操作は取り消せません。`"
    :ui="{ footer: 'justify-end' }"
  >
    <template #footer="{ close }">
      <UButton label="キャンセル" color="neutral" variant="outline" @click="close" />
      <UButton label="削除" color="error" icon="i-lucide-trash-2" :loading="saving" @click="deleteUser" />
    </template>
  </UModal>
</template>
