import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
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
  await expect
    .poll(() => finalized.length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1)
  const stagedTables = new Set(stagedChunks.map((chunk) => chunk.table))
  expect(stagedTables.has('todos')).toBe(true)
})
