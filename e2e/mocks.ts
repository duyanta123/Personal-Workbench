import { expect, type Page } from '@playwright/test'

/** 共享 E2E mock：认证、REST 兜底、RPC payload 与可选的服务端状态模拟。 */

export const e2eUser = {
  id: '10000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'invitee@example.test',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-08-10T00:00:00.000Z'
}

export function e2eToken() {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const issuedAt = Math.floor(Date.now() / 1000)
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'authenticated',
    iat: issuedAt,
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: e2eUser.id,
    email: e2eUser.email,
    role: 'authenticated',
    app_metadata: e2eUser.app_metadata,
    user_metadata: e2eUser.user_metadata
  })}.e2e-signature1`
}

export interface V2CommandPayload {
  p_command_id: string
  p_entity_id: string
  p_restore_epoch: number
  p_kind: string
  p_payload: Record<string, unknown>
  p_expected?: Record<string, unknown>
  p_base_version?: number | null
  p_depends_on?: string[]
}

export interface CommandResult {
  status: 'applied' | 'duplicate' | 'conflict' | 'not_found' | 'stale_restore' | 'failed'
  command_id: string
  entity_id: string
  data: Record<string, unknown> | null
  current: Record<string, unknown> | null
  conflicting_fields: string[]
  message: string | null
}

export function v2Result(payload: V2CommandPayload, overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    status: 'applied',
    command_id: payload.p_command_id,
    entity_id: payload.p_entity_id,
    data: { id: payload.p_entity_id },
    current: null,
    conflicting_fields: [],
    message: null,
    ...overrides
  }
}

export interface MockOptions {
  /** rest/v1/todos 返回的行（缺省空数组）。 */
  todos?: Record<string, unknown>[]
  /** 动态 todos：路由每次请求读取 ref.current（优先于 todos）。 */
  todosRef?: { current: Record<string, unknown>[] }
  /** rest/v1/recurrence_rules 返回的行。 */
  recurrenceRules?: Record<string, unknown>[]
  /** 自定义 apply_workbench_command_v2 的响应（用于模拟冲突/失败）。 */
  applyV2?: (payload: V2CommandPayload) => CommandResult
}

export function seedTodo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '30000000-0000-0000-0000-000000000001',
    user_id: e2eUser.id,
    text: '种子待办',
    level: 'mid',
    done: false,
    pinned: false,
    due_date: null,
    sort_order: 1024,
    status: 'open',
    recurrence_rule_id: null,
    occurrence_date: null,
    recurrence_detached: false,
    row_version: 1,
    created_at: '2026-08-15T00:00:00.000Z',
    updated_at: '2026-08-15T00:00:00.000Z',
    ...overrides
  }
}

export async function mockWorkbench(page: Page, options: MockOptions = {}) {
  const todos = options.todos ?? []
  const rules = options.recurrenceRules ?? []

  // 跨源（dev server :4173 → supabase :54321）下 Content-Range 不在 CORS
  // 安全头列表，必须显式暴露，否则 supabase-js 的 count 解析恒为 null。
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'Content-Range'
  }
  const rangeHeaders = (count: number) => ({ ...corsHeaders, 'content-range': `0-${Math.max(count - 1, 0)}/${count}` })

  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({ user: e2eUser }) })
  })
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ access_token: e2eToken(), refresh_token: 'refresh-token', expires_in: 3600, token_type: 'bearer', user: e2eUser })
    })
  })
  await page.route('**/auth/v1/factors**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({ all: [], totp: [], phone: [] }) })
  })
  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: rangeHeaders(0), body: '[]' })
  })
  // Playwright resolves the most recently registered matching route first.
  await page.route('**/rest/v1/todos**', async (route) => {
    const current = options.todosRef ? options.todosRef.current : todos
    const body = JSON.stringify(current)
    await route.fulfill({ status: 200, contentType: 'application/json', headers: rangeHeaders(current.length), body })
  })
  await page.route('**/rest/v1/recurrence_rules**', async (route) => {
    const body = JSON.stringify(rules)
    await route.fulfill({ status: 200, contentType: 'application/json', headers: rangeHeaders(rules.length), body })
  })
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'apply_workbench_command_v2') {
      const payload = JSON.parse(route.request().postData() ?? '{}') as V2CommandPayload
      const result = options.applyV2 ? options.applyV2(payload) : v2Result(payload)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
      return
    }
    const payloads: Record<string, unknown> = {
      get_user_sync_state: { revision: 0, restore_epoch: 0 },
      get_dashboard_summary: {
        today_todos: [], habits: [], habit_logs: [], weekly_habits: [], expense_categories: [],
        overview: { todo_total: 0, todo_done: 0, habit_total: 0, habit_done: 0, goal_total: 0, goal_percent: 0, week_workouts: 0, ledger_total: 0, note_total: 0, problem_total: 0, workout_total: 0, total_records: 0, pinned_total: 0, month_income: 0, month_expense: 0 },
        fitness: { total: 0, month_sessions: 0, month_minutes: 0, week_sessions: 0, week_volume: 0, body_parts: [], month_body_parts: [] }
      },
      get_dashboard_summary_v2: {
        today_todos: [], habits: [], habit_logs: [], weekly_habits: [], expense_categories: [],
        overview: { todo_total: 0, todo_done: 0, habit_total: 0, habit_done: 0, goal_total: 0, goal_percent: 0, week_workouts: 0, ledger_total: 0, note_total: 0, problem_total: 0, workout_total: 0, total_records: 0, pinned_total: 0, month_income: 0, month_expense: 0 },
        fitness: { total: 0, month_sessions: 0, month_minutes: 0, week_sessions: 0, week_volume: 0, body_parts: [], month_body_parts: [] }
      },
      get_today_todos: [],
      get_focus_items: [],
      get_today_workspace: { inbox: [], todos: [], habits: [], habit_logs: [], planned_ledger: [] },
      materialize_recurrences: { todos: 0, ledger_entries: 0, through: null },
      move_todo_v2: { status: 'applied', command_id: 'mock', entity_id: 'mock', data: null, current: null, conflicting_fields: [], message: null },
      route_inbox_item: { status: 'applied', command_id: 'mock', entity_id: 'mock', data: null, current: null, conflicting_fields: [], message: null },
      search_workbench_v2: [],
      begin_restore: '40000000-0000-0000-0000-000000000001',
      stage_restore_chunk: null,
      finalize_restore: { counts: {}, deleted_counts: {}, old_avatar_paths: [], revision: 1, restore_epoch: 0 },
      abort_restore: null,
      apply_workbench_operation: { id: 'created-1' }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payloads[name ?? ''] ?? {}) })
  })
  await page.route('**/storage/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

/** 建立会话并进入首页（与旧 mockAuthenticatedWorkbench 相同的登录仪式）。 */
export async function loginWorkbench(page: Page) {
  await page.goto(`/update-password#access_token=${e2eToken()}&refresh_token=refresh-token&expires_in=3600&token_type=bearer&type=invite`)
  await expect(page.getByRole('heading', { name: '设置新密码' })).toBeVisible()
  await page.goto('/')
  await expect(page.getByLabel('智能快速记录')).toBeVisible()
}
