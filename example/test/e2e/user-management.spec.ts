import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const adminUsername = 'developer@example.com'
const adminPassword = 'Password123!'

async function directLogin(page: Page, username = adminUsername, password = adminPassword) {
  await page.goto('/login')
  await page.getByLabel('ユーザー名').fill(username)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'ID・パスワードでログイン' }).click()
}

async function openAction(page: Page, username: string, label: string) {
  await page.getByTestId(`actions-${username}`).click()
  await page.getByRole('menuitem', { name: label }).click()
}

async function adminAws(request: APIRequestContext, operation: string, body: Record<string, unknown>) {
  return request.post('http://localhost:9999/', {
    headers: {
      authorization: 'Bearer local-example-admin-token',
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': `AWSCognitoIdentityProviderService.${operation}`
    },
    data: body
  })
}

test.describe.serial('cognito-mock ユーザー管理', () => {
  test('未認証APIと不正なOAuth stateを拒否する', async ({ page, request }) => {
    const response = await request.get('/api/users')
    expect(response.status()).toBe(401)

    await page.goto('/auth/callback?code=invalid&state=invalid')
    await expect(page).toHaveURL(/\/login\?error=/)
    await expect(page.getByText('OAuth state が無効または期限切れです。')).toBeVisible()
  })

  test('adminsに所属しないユーザーを拒否する', async ({ page, request }) => {
    const username = `non-admin-${Date.now()}@example.com`
    const password = 'NonAdminPassword123!'
    expect((await adminAws(request, 'AdminCreateUser', {
      UserPoolId: 'ap-northeast-1_example', Username: username, TemporaryPassword: password,
      UserAttributes: [{ Name: 'email', Value: username }]
    })).ok()).toBe(true)
    expect((await adminAws(request, 'AdminSetUserPassword', {
      UserPoolId: 'ap-northeast-1_example', Username: username, Password: password, Permanent: true
    })).ok()).toBe(true)

    await directLogin(page, username, password)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText(/admins グループ/)).toBeVisible()

    expect((await adminAws(request, 'AdminDeleteUser', {
      UserPoolId: 'ap-northeast-1_example', Username: username
    })).ok()).toBe(true)
  })

  test('両ログイン方式とユーザー管理操作を実際に完了できる', async ({ page }) => {
    const suffix = Date.now()
    const username = `e2e-${suffix}@example.com`
    const updatedEmail = `e2e-updated-${suffix}@example.com`
    const temporaryPassword = 'E2eTemporaryPassword123!'
    const changedPassword = 'E2eChangedPassword123!'

    await directLogin(page)
    await expect(page).toHaveURL(/\/users$/)
    await expect(page.getByRole('heading', { name: 'ユーザー管理' })).toBeVisible()

    await page.getByRole('button', { name: 'ユーザーを作成' }).click()
    const createPanel = page.getByRole('dialog', { name: 'ユーザーを作成' })
    await createPanel.getByLabel('ユーザー名').fill(username)
    await createPanel.getByLabel('メールアドレス').fill(username)
    await createPanel.getByLabel('表示名').fill('E2E User')
    await createPanel.locator('input[name="temporaryPassword"]').fill(temporaryPassword)
    await createPanel.getByLabel('admins').check()
    await createPanel.getByRole('button', { name: '作成', exact: true }).click()
    await expect(page.getByText('ユーザーを作成しました', { exact: true })).toBeVisible()
    await expect(page.getByTestId(`actions-${username}`)).toBeVisible()

    await openAction(page, username, '編集')
    const editDialog = page.getByRole('dialog', { name: 'ユーザーを編集' })
    await editDialog.getByLabel('メールアドレス').fill(updatedEmail)
    await editDialog.getByLabel('表示名').fill('E2E Updated User')
    await editDialog.getByRole('switch').click()
    await editDialog.getByRole('button', { name: '保存' }).click()
    await expect(page.getByText('ユーザーを更新しました', { exact: true })).toBeVisible()
    await expect(page.getByText('無効', { exact: true })).toBeVisible()

    await openAction(page, username, '編集')
    await page.getByRole('dialog', { name: 'ユーザーを編集' }).getByRole('switch').click()
    await page.getByRole('dialog', { name: 'ユーザーを編集' }).getByRole('button', { name: '保存' }).click()
    await expect(page.getByRole('dialog', { name: 'ユーザーを編集' })).toBeHidden()

    await openAction(page, username, 'グループ所属')
    const groupDialog = page.getByRole('dialog', { name: 'グループ所属' })
    await groupDialog.getByTestId('group-admins').click()
    await expect(page.getByText('admins から解除しました', { exact: true })).toBeVisible()
    await groupDialog.getByTestId('group-admins').click()
    await expect(page.getByText('admins に追加しました', { exact: true })).toBeVisible()
    await groupDialog.getByRole('button', { name: '閉じる' }).click()

    await openAction(page, username, 'パスワード設定')
    const passwordDialog = page.getByRole('dialog', { name: 'パスワードを設定' })
    await passwordDialog.locator('input[name="password"]').fill(temporaryPassword)
    await passwordDialog.getByRole('switch').click()
    await passwordDialog.getByRole('button', { name: '設定', exact: true }).click()
    await expect(page.getByText('仮パスワードを設定しました', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'ログアウト' }).click()
    await directLogin(page, username, temporaryPassword)
    await expect(page).toHaveURL(/\/new-password$/)
    await page.locator('input[name="password"]').fill(changedPassword)
    await page.locator('input[name="confirmation"]').fill(changedPassword)
    await page.getByRole('button', { name: '変更してログイン' }).click()
    await expect(page).toHaveURL(/\/users$/)

    await page.getByRole('button', { name: 'ログアウト' }).click()
    await page.getByRole('link', { name: 'Managed Login（PKCE）を使う' }).click()
    await expect(page).toHaveURL(/localhost:9999\/login/)
    await page.locator('input[autocomplete="username"]').fill(adminUsername)
    await page.locator('input[autocomplete="current-password"]').fill(adminPassword)
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/localhost:3001\/users$/)

    await openAction(page, username, '削除')
    const deleteDialog = page.getByRole('dialog', { name: 'ユーザーを削除' })
    await deleteDialog.getByRole('button', { name: '削除', exact: true }).click()
    await expect(page.getByText('ユーザーを削除しました', { exact: true })).toBeVisible()
    await expect(page.getByTestId(`actions-${username}`)).toHaveCount(0)
  })
})
