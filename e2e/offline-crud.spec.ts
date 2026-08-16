import { expect, test } from '@playwright/test'
import { loginWorkbench, mockWorkbench, seedTodo } from './mocks'

// 计划验收：断网可完成核心 CRUD（命令入队 IndexedDB），联网后服务端收敛。
// 注：dev server 无 Service Worker，离线 reload 无法加载页面资源，
// 因此"刷新后仍在"以联网 reload + 服务端已收敛 + 持久化查询缓存验证，
// 离线持久化本身通过直接断言 IndexedDB 命令队列证明。

const userId = '10000000-0000-0000-0000-000000000001'

async function listCommandKeys(page: import('@playwright/test').Page) {
  return page.evaluate(async (uid) => {
    const keys: string[] = []
    await new Promise<void>((resolve) => {
      const request = indexedDB.open(`personal-workbench:${uid}`)
      request.onsuccess = () => {
        const db = request.result
        try {
          const tx = db.transaction('kv', 'readonly')
          const cursorRequest = tx.objectStore('kv').openCursor()
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (cursor) { keys.push(String(cursor.key)); cursor.continue() } else resolve()
          }
          cursorRequest.onerror = () => resolve()
        } catch { resolve() }
      }
      request.onerror = () => resolve()
    })
    return keys
  }, userId)
}

test('offline todo create survives reload and converges after reconnect', async ({ page }) => {
  const v2Commands: string[] = []
  const createdTexts: string[] = []
  const todosRef = { current: [seedTodo()] }
  await mockWorkbench(page, {
    todosRef,
    applyV2: (payload) => {
      v2Commands.push(payload.p_kind)
      if (payload.p_kind === 'todo.create') {
        createdTexts.push(String(payload.p_payload.text ?? ''))
        todosRef.current = [...todosRef.current, seedTodo({ id: payload.p_entity_id, text: String(payload.p_payload.text ?? ''), ...payload.p_payload })]
      }
      return {
        status: 'applied',
        command_id: payload.p_command_id,
        entity_id: payload.p_entity_id,
        data: { id: payload.p_entity_id, ...payload.p_payload },
        current: null,
        conflicting_fields: [],
        message: null
      }
    }
  })
  await loginWorkbench(page)
  await page.goto('/todos')
  await expect(page.getByText('种子待办')).toBeVisible()

  // 断网创建：投影立即出现（networkMode:'all' 让 mutationFn 立即执行入队）。
  await page.context().setOffline(true)
  await page.getByPlaceholder('今天要做什么？').fill('离线任务A')
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await expect(page.getByText('离线任务A')).toBeVisible()

  // 持久化证据：命令确实写入 IndexedDB outbox。
  const offlineKeys = await listCommandKeys(page)
  expect(offlineKeys.some((key) => key.startsWith('command:v2:'))).toBe(true)

  // 恢复联网：flush 后命令送达 V2 RPC，服务端列表包含新行。
  await page.context().setOffline(false)
  await expect.poll(() => createdTexts, { timeout: 15_000 }).toContain('离线任务A')
  expect(v2Commands).toContain('todo.create')

  // 联网 reload：服务端已收敛 + 持久化查询缓存恢复，投影仍在。
  await page.reload()
  await expect(page.getByText('离线任务A')).toBeVisible()
  await expect(page.getByText('种子待办')).toBeVisible()
})

test('offline todo toggle stays local until reconnect', async ({ page }) => {
  const v2Commands: string[] = []
  await mockWorkbench(page, {
    todos: [seedTodo()],
    applyV2: (payload) => {
      v2Commands.push(payload.p_kind)
      return {
        status: 'applied',
        command_id: payload.p_command_id,
        entity_id: payload.p_entity_id,
        data: { id: payload.p_entity_id, ...payload.p_payload },
        current: null,
        conflicting_fields: [],
        message: null
      }
    }
  })
  await loginWorkbench(page)
  await page.goto('/todos')
  await expect(page.getByText('种子待办')).toBeVisible()

  // 在线时勾选"包含已完成"（让该筛选视图的查询缓存就绪，离线后无需重新拉取）。
  await page.getByRole('checkbox', { name: '包含已完成' }).check()
  await expect(page.getByRole('listitem').filter({ hasText: '种子待办' })).toBeVisible()

  // 断网勾选完成：投影立即更新（移入已完成分组）。
  await page.context().setOffline(true)
  const row = page.getByRole('listitem').filter({ hasText: '种子待办' })
  await row.getByRole('button', { name: '切换完成' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: '种子待办' }).getByRole('button', { name: '恢复未完成' })).toBeVisible()

  const offlineKeys = await listCommandKeys(page)
  expect(offlineKeys.some((key) => key.startsWith('command:v2:'))).toBe(true)

  // 恢复联网：todo.update 命令送达。
  await page.context().setOffline(false)
  await expect.poll(() => v2Commands, { timeout: 15_000 }).toContain('todo.update')
})
