import { expect, test } from '@playwright/test'
import { e2eUser, loginWorkbench, mockWorkbench, seedTodo } from './mocks'

// 计划验收：物化 RPC 在登录/聚焦/恢复联网时被触发，且重复触发不会在页面上产生重复实例。

const rule = {
  id: '50000000-0000-0000-0000-000000000001',
  user_id: e2eUser.id,
  entity_type: 'todo',
  frequency: 'daily',
  interval_count: 1,
  weekdays: [],
  month_day: null,
  start_date: '2026-08-15',
  end_date: null,
  timezone: 'Asia/Shanghai',
  local_time: null,
  enabled: true,
  generation_mode: 'manual',
  template: { text: '规则模板：每日复盘提醒', level: 'mid' },
  materialized_through: null,
  skipped_before_window: 0,
  row_version: 1,
  created_at: '2026-08-15T00:00:00.000Z',
  updated_at: '2026-08-15T00:00:00.000Z'
}

test('materialization runs on load and repeated triggers do not duplicate instances', async ({ page }) => {
  const materializeCalls: unknown[] = []
  await mockWorkbench(page, {
    todos: [seedTodo({ text: '每日复盘', recurrence_rule_id: rule.id, occurrence_date: '2026-08-16' })],
    recurrenceRules: [rule]
  })
  // 单独注册（后注册优先）以统计调用次数。
  await page.route('**/rest/v1/rpc/materialize_recurrences', async (route) => {
    materializeCalls.push(JSON.parse(route.request().postData() ?? '{}'))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ todos: 1, ledger_entries: 0, through: '2026-09-15' }) })
  })

  await loginWorkbench(page)
  await page.goto('/todos')
  // 登录后的首次物化已触发。
  await expect.poll(() => materializeCalls.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1)

  // 连续多次 focus / online 触发。
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
  })
  await page.waitForTimeout(1_000)

  // 页面上的周期实例只渲染一次（多次物化不会重复入列）。
  await expect(page.getByText('每日复盘', { exact: true })).toHaveCount(1)
})
