import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import { strFromU8, unzipSync, zipSync } from 'fflate'
import { sha256 } from '@noble/hashes/sha2.js'
import { loginWorkbench, mockWorkbench, seedTodo } from './mocks'

// 计划验收：V7 备份导出 → 再导入的完整回环（V1–V6 兼容矩阵由 backup.test.ts 单测覆盖）。

test('exports a V7 backup and restores it back through the staged restore RPCs', async ({ page }) => {
  const todos = [seedTodo({ text: '备份回环待办' })]
  await mockWorkbench(page, { todos })
  await loginWorkbench(page)

  const stagedChunks: Array<{ table: string; rows: unknown[] }> = []
  await page.route('**/rest/v1/rpc/stage_restore_chunk', async (route) => {
    const payload = JSON.parse(route.request().postData() ?? '{}') as { p_table: string; p_rows: unknown[] }
    stagedChunks.push({ table: payload.p_table, rows: payload.p_rows })
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })
  const finalized: unknown[] = []
  await page.route('**/rest/v1/rpc/finalize_restore', async (route) => {
    finalized.push(JSON.parse(route.request().postData() ?? '{}'))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ counts: { todos: 1 }, deleted_counts: {}, old_avatar_paths: [], revision: 1, restore_epoch: 1 })
    })
  })
  // 导入前的覆盖确认弹窗直接接受。
  page.on('dialog', (dialog) => void dialog.accept())

  // 导出：拿到 V7 JSON 文件。
  await page.getByRole('button', { name: '数据备份' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '全部数据 (JSON)' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^工作台备份-\d{8}\.json$/)
  const targetPath = test.info().outputPath('workbench-backup-roundtrip.json')
  await download.saveAs(targetPath)
  const exported = JSON.parse(fs.readFileSync(targetPath, 'utf8')) as {
    metadata: { version: number }
    tables: Record<string, Record<string, unknown>[]>
  }
  expect(exported.metadata.version).toBe(7)
  expect(exported.tables.todos.some((row) => row.text === '备份回环待办')).toBe(true)
  expect(exported.tables.todo_status_history).toEqual([])

  // 导入：同一文件走分块恢复（导入成功后会自动 reload）。
  await page.setInputFiles('input[type="file"]', {
    name: 'workbench-backup-roundtrip.json',
    mimeType: 'application/json',
    buffer: fs.readFileSync(targetPath)
  })
  // Restore is a sensitive operation: satisfy the same recent-auth gate used
  // in production before asserting the staged/finalize RPCs.
  await expect(page.getByRole('heading', { name: '验证后恢复备份' }).last()).toBeVisible()
  await page.getByLabel('当前密码').fill('e2e-test-password-123')
  await page.getByRole('button', { name: '验证' }).click()
  await expect
    .poll(() => finalized.length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1)
  const stagedTables = new Set(stagedChunks.map((chunk) => chunk.table))
  expect(stagedTables.has('todos')).toBe(true)
})

test('exports and imports a V8 streaming archive with manifest hashes', async ({ page }) => {
  // Force the browser fallback used by non-FSA browsers so Playwright can
  // capture the generated ZIP as a download.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
  await mockWorkbench(page, { todos: [seedTodo({ text: 'V8 streaming todo' })] })
  await loginWorkbench(page)
  page.on('dialog', (dialog) => void dialog.accept())

  const beginRestore = page.waitForRequest('**/rest/v1/rpc/begin_restore')
  const finalized = page.waitForRequest('**/rest/v1/rpc/finalize_restore')
  await page.getByRole('button', { name: '数据备份' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'V8 流式备份' }).click()
  const download = await downloadPromise
  const targetPath = test.info().outputPath('workbench-backup-v8.workbench.zip')
  await download.saveAs(targetPath)

  const entries = unzipSync(fs.readFileSync(targetPath))
  const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as {
    version: number
    scope?: { kind: string }
    tables: Record<string, { path: string; rows: number; sha256: string }>
  }
  expect(manifest.version).toBe(8)
  expect(manifest.scope?.kind).toBe('full')
  expect(Object.keys(manifest.tables).length).toBeGreaterThan(20)
  expect(manifest.tables.todos.rows).toBe(1)
  expect(manifest.tables.todos.sha256).toMatch(/^[a-f0-9]{64}$/)
  const todoBytes = entries['tables/todos.ndjson']
  const todoHash = [...sha256(todoBytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  expect(todoHash).toBe(manifest.tables.todos.sha256)
  expect(strFromU8(todoBytes).trim().split('\n')).toHaveLength(manifest.tables.todos.rows)

  await page.setInputFiles('input[type="file"]', {
    name: 'workbench-backup-v8.workbench.zip',
    mimeType: 'application/zip',
    buffer: fs.readFileSync(targetPath)
  })
  await expect(page.getByRole('heading').last()).toBeVisible()
  await page.locator('input[type="password"]').fill('e2e-test-password-123')
  await page.getByRole('button').filter({ hasText: /./ }).last().click()
  const beginRequest = await beginRestore
  expect(JSON.parse(beginRequest.postData() ?? '{}').p_source_version).toBe(8)
  await expect(finalized).resolves.toBeTruthy()
})

test('rejects a V8 table hash mismatch before finalizing restore', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
  await mockWorkbench(page, { todos: [seedTodo({ text: 'hash source' })] })
  await loginWorkbench(page)

  let finalized = 0
  await page.route('**/rest/v1/rpc/finalize_restore', async (route) => {
    finalized++
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ counts: {}, deleted_counts: {}, old_avatar_paths: [] }) })
  })
  page.on('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: '数据备份' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'V8 流式备份' }).click()
  const download = await downloadPromise
  const sourcePath = test.info().outputPath('v8-hash-source.workbench.zip')
  await download.saveAs(sourcePath)

  const entries = unzipSync(fs.readFileSync(sourcePath))
  const row = JSON.parse(strFromU8(entries['tables/todos.ndjson'])) as Record<string, unknown>
  row.text = 'tampered after manifest'
  entries['tables/todos.ndjson'] = new TextEncoder().encode(`${JSON.stringify(row)}\n`)
  const tampered = zipSync(entries)
  await page.setInputFiles('input[type="file"]', {
    name: 'tampered.workbench.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(tampered),
  })
  await expect(page.getByRole('heading').last()).toBeVisible()
  await page.locator('input[type="password"]').fill('e2e-test-password-123')
  await page.getByRole('button').filter({ hasText: /./ }).last().click()
  await page.waitForTimeout(1000)
  expect(finalized).toBe(0)
})
