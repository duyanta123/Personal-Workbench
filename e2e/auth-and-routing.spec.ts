import { expect, test } from '@playwright/test'

const user = {
  id: '10000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'invitee@example.test',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-08-10T00:00:00.000Z'
}

function token() {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata
  })}.e2e-signature`
}

test('first-load deep links fall back to the login page without a service worker', async ({ page }) => {
  await page.goto('/notes?focus=25000000-0000-0000-0000-000000000001')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: '个人工作台' })).toBeVisible()
})

test('login is invite-only and enforces the 12-character browser contract', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('账号由受信后台邀请')).toBeVisible()
  await expect(page.getByRole('link', { name: /忘记密码/ })).toBeVisible()
  await expect(page.getByText('注册', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('密码')).toHaveAttribute('minlength', '12')
})

test('password recovery sends the exact update-password callback', async ({ page }) => {
  let requestBody = ''
  let redirectTo = ''
  await page.route('**/auth/v1/recover*', async (route) => {
    requestBody = route.request().postData() ?? ''
    redirectTo = new URL(route.request().url()).searchParams.get('redirect_to') ?? ''
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.goto('/forgot-password')
  await page.getByLabel('邮箱').fill('invitee@example.test')
  await page.getByRole('button', { name: '发送重置链接' }).click()
  await expect(page.getByText('重置链接已经发送', { exact: false })).toBeVisible()
  expect(JSON.parse(requestBody)).toMatchObject({
    email: 'invitee@example.test'
  })
  expect(redirectTo).toBe('http://127.0.0.1:4173/update-password')
})

test('an invitation session can set a 12-character password', async ({ page }) => {
  let updatedPassword = ''
  await page.route('**/auth/v1/user', async (route) => {
    if (route.request().method() === 'PUT') {
      updatedPassword = String(JSON.parse(route.request().postData() ?? '{}').password ?? '')
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) })
  })
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: token(), refresh_token: 'refresh-token', expires_in: 3600, token_type: 'bearer', user })
    })
  })

  await page.goto(`/update-password#access_token=${token()}&refresh_token=refresh-token&expires_in=3600&token_type=bearer&type=invite`)
  await expect(page.getByRole('heading', { name: '设置新密码' })).toBeVisible()
  await page.getByLabel('新密码').fill('correct-horse-1')
  await page.getByLabel('确认密码').fill('correct-horse-1')
  await page.getByRole('button', { name: '保存密码' }).click()
  await expect.poll(() => updatedPassword).toBe('correct-horse-1')
})

test('logout warns about pending outbox data and clears user-scoped offline state', async ({ page }) => {
  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) })
  })
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: token(), refresh_token: 'refresh-token', expires_in: 3600, token_type: 'bearer', user })
    })
  })
  await page.route('**/auth/v1/logout*', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/0' },
      body: '[]'
    })
  })
  await page.route('**/storage/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto(`/update-password#access_token=${token()}&refresh_token=refresh-token&expires_in=3600&token_type=bearer&type=invite`)
  await expect(page.getByRole('heading', { name: '设置新密码' })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('button', { name: '退出登录' }).first()).toBeVisible()

  await page.evaluate(async (userId) => {
    localStorage.setItem('workbench:last-user:v1', userId)
    localStorage.setItem(`workbench:pomodoro:v3:${userId}`, '{"version":3}')
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(`personal-workbench:${userId}`, 1)
      request.onupgradeneeded = () => request.result.createObjectStore('kv')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('kv', 'readwrite')
        tx.objectStore('kv').put({ operationId: 'pending-1' }, 'outbox:v1:pending-1')
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      }
    })
  }, user.id)

  let warning = ''
  page.once('dialog', async (dialog) => {
    warning = dialog.message()
    await dialog.accept()
  })
  await page.getByRole('button', { name: '退出登录' }).first().click()
  await expect(page).toHaveURL(/\/login$/)
  expect(warning).toContain('1 条操作尚未同步')

  const cleanup = await page.evaluate(async (userId) => ({
    lastUser: localStorage.getItem('workbench:last-user:v1'),
    pomodoro: localStorage.getItem(`workbench:pomodoro:v3:${userId}`),
    databaseExists: (await indexedDB.databases()).some((database) => database.name === `personal-workbench:${userId}`)
  }), user.id)
  expect(cleanup).toEqual({ lastUser: null, pomodoro: null, databaseExists: false })
})
