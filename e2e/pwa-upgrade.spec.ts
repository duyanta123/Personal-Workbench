import { expect, test } from '@playwright/test'

test('old generateSW shell stays available while injectManifest worker takes over', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/legacy-sw.js', { scope: '/' })
    const worker = registration.installing
    if (worker) await new Promise<void>((resolve) => worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'activated') resolve()
    }))
    await navigator.serviceWorker.ready
  })
  await expect.poll(() => context.serviceWorkers().length).toBeGreaterThan(0)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  const legacyShell = await page.evaluate(async () => (await caches.match('/index.html'))?.text() ?? '')
  expect(legacyShell).toContain('个人工作台')
  await context.setOffline(false)

  await page.evaluate(async () => {
    const old = await navigator.serviceWorker.getRegistration('/')
    await old?.unregister()
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    const worker = registration.installing
    if (worker) await new Promise<void>((resolve) => worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'activated') resolve()
    }))
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')).toMatch(/\/sw\.js$/)
  await context.setOffline(true)
  const upgradedShell = await page.evaluate(async () => (await caches.match('/index.html'))?.text() ?? '')
  expect(upgradedShell).toContain('个人工作台')
})
