import { expect, test, type Browser } from '@playwright/test'
import { loginWorkbench, mockWorkbench, seedTodo, v2Result, type CommandResult, type V2CommandPayload } from './mocks'

// 计划验收：两个浏览器上下文模拟多设备——不同字段自动合并、同字段出现冲突且可处理。

interface ServerRow {
  id: string
  text: string
  level: string
  done: boolean
  pinned: boolean
  sort_order: number
  status: string
  row_version: number
  [key: string]: unknown
}

/** 与 apply_workbench_command_v2 服务端语义一致的简化模拟（仅 todo update）。 */
function makeServer(seed: ServerRow) {
  const rows = new Map<string, ServerRow>([[seed.id, { ...seed }]])
  return {
    apply(payload: V2CommandPayload): CommandResult {
      if (payload.p_kind === 'todo.create') {
        rows.set(payload.p_entity_id, {
          id: payload.p_entity_id,
          text: String(payload.p_payload.text ?? ''),
          level: String(payload.p_payload.level ?? 'mid'),
          done: false,
          pinned: false,
          sort_order: 1024,
          status: 'open',
          row_version: 1
        })
        return v2Result(payload)
      }
      if (payload.p_kind !== 'todo.update') return v2Result(payload)
      const row = rows.get(payload.p_entity_id)
      if (!row) return v2Result(payload, { status: 'not_found' })
      let conflicts: string[] = []
      if (row.row_version !== (payload.p_base_version ?? 0)) {
        conflicts = Object.keys(payload.p_payload).filter((key) =>
          JSON.stringify(row[key]) !== JSON.stringify(payload.p_expected?.[key]))
      }
      if (conflicts.length > 0) {
        return v2Result(payload, { status: 'conflict', current: { ...row }, conflicting_fields: conflicts, message: 'same fields changed on another device' })
      }
      Object.assign(row, payload.p_payload, { row_version: row.row_version + 1 })
      return v2Result(payload, { data: { ...row } })
    },
    list(): ServerRow[] {
      return [...rows.values()]
    }
  }
}

async function editFirstTodo(page: import('@playwright/test').Page, text: string, level?: string) {
  await page.locator('li').filter({ hasText: '种子待办' }).first().getByRole('button', { name: '编辑' }).click()
  await page.getByPlaceholder('今天要做什么？').fill(text)
  if (level) {
    await page.getByRole('tab', { name: level === 'high' ? '高优先级' : level === 'low' ? '低优先级' : '中优先级', exact: true }).click()
  }
  await page.getByRole('button', { name: '保存', exact: true }).click()
}

test.describe('multi-device field merge and conflict', () => {
  test('different-field edits auto merge across two devices', async ({ browser }: { browser: Browser }) => {
    const server = makeServer(seedTodo() as unknown as ServerRow)
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()
    const page1 = await context1.newPage()
    const page2 = await context2.newPage()

    const wire = async (page: import('@playwright/test').Page) => {
      await mockWorkbench(page, {
        get todos() { return server.list() as unknown as Record<string, unknown>[] },
        applyV2: (payload) => server.apply(payload)
      })
      await loginWorkbench(page)
      await page.goto('/todos')
      await expect(page.getByText('种子待办')).toBeVisible()
    }
    await wire(page2)
    await wire(page1)

    // 设备 2 在线改 level → applied（row_version 2）。
    await editFirstTodo(page2, '种子待办', 'high')
    await page2.waitForTimeout(500)

    // 设备 1 离线改 text → 恢复联网后 flush。
    await context1.setOffline(true)
    await editFirstTodo(page1, '设备一修改的标题')
    await expect(page1.getByText('设备一修改的标题')).toBeVisible()
    await context1.setOffline(false)

    // 自动合并：text 来自设备 1，level 仍是设备 2 的 high。
    await expect.poll(() => server.list()[0], { timeout: 15_000 }).toMatchObject({
      text: '设备一修改的标题',
      level: 'high',
      row_version: 3
    })
    await context1.close()
    await context2.close()
  })

  test('same-field edits surface a conflict with resolution actions', async ({ browser }: { browser: Browser }) => {
    const server = makeServer(seedTodo() as unknown as ServerRow)
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()
    const page1 = await context1.newPage()
    const page2 = await context2.newPage()

    const wire = async (page: import('@playwright/test').Page) => {
      await mockWorkbench(page, {
        get todos() { return server.list() as unknown as Record<string, unknown>[] },
        applyV2: (payload) => server.apply(payload)
      })
      await loginWorkbench(page)
      await page.goto('/todos')
      await expect(page.getByText('种子待办')).toBeVisible()
    }
    await wire(page2)
    await wire(page1)

    // 设备 2 先改 text（row_version 2，text = remote）。
    await editFirstTodo(page2, '远端标题')
    await page2.waitForTimeout(500)

    // 设备 1 离线改同一字段 → 联网后应出现冲突。
    await context1.setOffline(true)
    await editFirstTodo(page1, '本地标题')
    await context1.setOffline(false)

    await expect(page1.getByRole('button', { name: '同步中心' })).toBeVisible()
    await page1.getByRole('button', { name: '同步中心' }).click()
    await expect(page1.getByText('需要处理')).toBeVisible({ timeout: 15_000 })
    await expect(page1.getByText('冲突字段：text')).toBeVisible()
    await expect(page1.getByRole('button', { name: '保留远端' })).toBeVisible()
    await expect(page1.getByRole('button', { name: '重新应用本地' })).toBeVisible()

    // 选择"重新应用本地"：基于远端当前版本重放本地修改。
    await page1.getByRole('button', { name: '重新应用本地' }).click()
    await expect.poll(() => server.list()[0], { timeout: 15_000 }).toMatchObject({
      text: '本地标题',
      row_version: 3
    })
    await context1.close()
    await context2.close()
  })
})
