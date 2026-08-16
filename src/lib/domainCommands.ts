import type { QueryClient } from '@tanstack/react-query'
import type { VersionedRow } from '../types'
import { enqueueCommand } from './commands'
import { supabase } from './supabase'
import type { WorkbenchCommandV2 } from './commands'

export type EntityCommandKind =
  | 'todo' | 'habit' | 'habit_log' | 'ledger' | 'goal' | 'note' | 'practice'
  | 'workout_session' | 'workout_exercise' | 'body_metric' | 'inbox' | 'recurrence'
  | 'ledger_account' | 'ledger_payee' | 'ledger_rule' | 'ledger_split'
  | 'ledger_reconciliation' | 'entity_link' | 'template' | 'saved_view'

const TABLES: Partial<Record<EntityCommandKind, string>> = {
  todo: 'todos', habit: 'habits', habit_log: 'habit_logs', ledger: 'ledger_entries', goal: 'goals', note: 'notes',
  practice: 'practice_problems', workout_session: 'workout_sessions', workout_exercise: 'workout_exercises',
  body_metric: 'body_metrics', inbox: 'inbox_items', recurrence: 'recurrence_rules', ledger_account: 'ledger_accounts',
  ledger_payee: 'ledger_payees', ledger_rule: 'ledger_rules', ledger_split: 'ledger_splits',
  ledger_reconciliation: 'ledger_reconciliations', entity_link: 'entity_links', template: 'workbench_templates', saved_view: 'saved_views'
}

const QUERY_PREFIXES: Partial<Record<EntityCommandKind, string[]>> = {
  todo: ['todos', 'today_todos', 'dashboard_summary', 'focus_items', 'today_workspace'],
  habit: ['habits', 'dashboard_summary', 'focus_items', 'today_workspace'],
  habit_log: ['habit_logs', 'dashboard_summary', 'today_workspace'],
  ledger: ['ledger_entries', 'dashboard_summary', 'today_workspace'],
  goal: ['goals', 'dashboard_summary', 'focus_items'],
  note: ['notes', 'dashboard_summary'], practice: ['problems', 'dashboard_summary'],
  workout_session: ['workouts', 'dashboard_summary'], workout_exercise: ['workout-exercises'], body_metric: ['body-metrics'],
  inbox: ['inbox', 'today_workspace'], recurrence: ['recurrence_rules'],
  ledger_account: ['ledger_accounts'], ledger_payee: ['ledger_payees'], ledger_rule: ['ledger_rules'],
  ledger_reconciliation: ['ledger_reconciliations'], entity_link: ['workbench_artifact'], template: ['workbench_artifact'], saved_view: ['workbench_artifact']
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function findById(value: unknown, id: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findById(item, id)
      if (found) return found
    }
    return null
  }
  if (!isRecord(value)) return null
  if (value.id === id) return value
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'data' || key === 'items' || key === 'todos' || key === 'habits' || key === 'inbox' || key === 'planned_ledger') {
      const found = findById(nested, id)
      if (found) return found
    }
  }
  return null
}

function projectValue(value: unknown, id: string, action: 'update' | 'delete', patch: Record<string, unknown>): unknown {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.flatMap((item) => {
      if (isRecord(item) && item.id === id) {
        if (action === 'delete') { changed = true; return [] }
        if (Object.entries(patch).some(([key, nextValue]) => item[key] !== nextValue) || item._local_pending !== true) {
          changed = true
          return [{ ...item, ...patch, _local_pending: true }]
        }
        return [item]
      }
      const projected = projectValue(item, id, action, patch)
      if (projected !== item) changed = true
      return [projected]
    })
    return changed ? next : value
  }
  if (!isRecord(value)) return value
  if (value.id === id) {
    if (action === 'delete') return value
    if (Object.entries(patch).every(([key, nextValue]) => value[key] === nextValue) && value._local_pending === true) return value
    return { ...value, ...patch, _local_pending: true }
  }
  const next: Record<string, unknown> = { ...value }
  let changed = false
  for (const key of ['items', 'todos', 'habits', 'habit_logs', 'inbox', 'planned_ledger']) {
    if (key in next) {
      const projected = projectValue(next[key], id, action, patch)
      if (projected !== next[key]) { next[key] = projected; changed = true }
    }
  }
  if (action === 'delete' && Array.isArray(value.items) && changed && typeof value.total === 'number') {
    next.total = Math.max(0, value.total - 1)
    changed = true
  }
  return changed ? next : value
}

function legacyDefaults(kind: EntityCommandKind, id: string, userId: string, payload: Record<string, unknown>) {
  const now = new Date().toISOString()
  const base = { id, user_id: userId, row_version: 1, created_at: now, ...payload, _local_pending: true }
  if (kind === 'todo') return { done: false, status: 'open', pinned: false, sort_order: Date.now(), due_date: null, updated_at: now, ...base }
  if (kind === 'habit') return { emoji: 'flame', pinned: false, tracking_type: 'boolean', period_days: 1, target_count: 1, target_value: null, target_mode: 'at_least', reminder_time: null, ...base }
  if (kind === 'habit_log') return { state: 'done', value: null, ...base }
  if (kind === 'ledger') return { note: null, status: 'posted', currency_code: 'CNY', amount: Number(payload.amount_minor ?? 0) / 100, ...base }
  if (kind === 'note') return { title: null, tags: [], pinned: false, layout: 'default', image_url: null, updated_at: now, ...base }
  if (kind === 'goal' || kind === 'practice') return { updated_at: now, ...base }
  return base
}

function matchesText(value: unknown, query: string) {
  return String(value ?? '').toLocaleLowerCase().includes(query.toLocaleLowerCase())
}

function matchesPagedList(kind: EntityCommandKind, row: Record<string, unknown>, queryKey: readonly unknown[]) {
  if (queryKey[2] !== 'page') return true
  if (Number(queryKey[3] ?? 0) !== 0) return false
  const query = typeof queryKey[4] === 'string' ? queryKey[4].trim() : ''
  const filters = isRecord(queryKey[5]) ? queryKey[5] : {}
  if (kind === 'todo') {
    if (query && !matchesText(row.text, query)) return false
    if (filters.showDone !== true && row.done === true) return false
    if (filters.level && row.level !== filters.level) return false
    const due = typeof row.due_date === 'string' ? row.due_date : null
    const currentDate = typeof filters.currentDate === 'string' ? filters.currentDate : ''
    if (filters.due === 'none' && due !== null) return false
    if (filters.due === 'today' && due !== currentDate) return false
    if (filters.due === 'overdue' && (!due || !currentDate || due >= currentDate)) return false
    if (filters.due === 'future' && (!due || !currentDate || due <= currentDate)) return false
  }
  if (kind === 'ledger') {
    if (query && !matchesText(row.category, query) && !matchesText(row.note, query)) return false
    if (filters.kind && row.kind !== filters.kind) return false
    if (filters.category && row.category !== filters.category) return false
    if (filters.accountId && row.account_id !== filters.accountId) return false
    if (filters.status && row.status !== filters.status) return false
    const date = typeof row.entry_date === 'string' ? row.entry_date : ''
    if (filters.dateFrom && date < String(filters.dateFrom)) return false
    if (filters.dateTo && date > String(filters.dateTo)) return false
  }
  return true
}

function projectCreate(qc: QueryClient, kind: EntityCommandKind, row: Record<string, unknown>, pagedOnly = false) {
  const prefixes = QUERY_PREFIXES[kind] ?? []
  for (const [queryKey, data] of qc.getQueriesData({ predicate: (query) =>
    prefixes.includes(String(query.queryKey[0])) && (!pagedOnly || query.queryKey[2] === 'page') })) {
    if (!data || findById(data, String(row.id)) || !matchesPagedList(kind, row, queryKey)) continue
    // 先算后写：投影结果与缓存同引用时绝不能调用 setQueryData —— QueryCache
    // 的 subscribe 回调（useCommandSync 重放）是同步通知，"写回原值"也会触发
    // notify → replay → 写回的同步无限递归（栈溢出）。
    const projected = (() => {
      if (Array.isArray(data)) return [row, ...data]
      if (!isRecord(data)) return data
      if (Array.isArray(data.items)) return { ...data, items: [row, ...data.items], total: typeof data.total === 'number' ? data.total + 1 : data.total }
      const collection = kind === 'inbox' ? 'inbox' : kind === 'todo' ? 'todos' : kind === 'habit' ? 'habits' : kind === 'habit_log' ? 'habit_logs' : null
      return collection && Array.isArray(data[collection]) ? { ...data, [collection]: [row, ...(data[collection] as unknown[])] } : data
    })()
    if (projected !== data) qc.setQueryData(queryKey, projected)
  }
}

function prunePagedProjection(kind: EntityCommandKind, queryKey: readonly unknown[], value: unknown) {
  if ((kind !== 'todo' && kind !== 'ledger') || queryKey[2] !== 'page' || !isRecord(value) || !Array.isArray(value.items)) return value
  const items = value.items.filter((item) => !isRecord(item) || matchesPagedList(kind, item, queryKey))
  if (items.length === value.items.length) return value
  return { ...value, items, total: typeof value.total === 'number' ? Math.max(0, value.total - (value.items.length - items.length)) : value.total }
}

function projectMutation(qc: QueryClient, kind: EntityCommandKind, id: string, action: 'update' | 'delete', patch: Record<string, unknown>) {
  const prefixes = QUERY_PREFIXES[kind] ?? []
  let updatedRow: Record<string, unknown> | null = null
  if (action === 'update') {
    for (const [, value] of qc.getQueriesData({ predicate: (query) => prefixes.includes(String(query.queryKey[0])) })) {
      const found = findById(value, id)
      if (found) { updatedRow = { ...found, ...patch, _local_pending: true }; break }
    }
  }
  for (const [queryKey, current] of qc.getQueriesData({ predicate: (query) => prefixes.includes(String(query.queryKey[0])) })) {
    const projected = prunePagedProjection(kind, queryKey, projectValue(current, id, action, patch))
    if (projected !== current) qc.setQueryData(queryKey, projected)
  }
  if (updatedRow) projectCreate(qc, kind, updatedRow, true)
}

function projectMoveValue(value: unknown, id: string, anchorId: string, position: 'before' | 'after'): unknown {
  if (Array.isArray(value)) {
    const movedIndex = value.findIndex((item) => isRecord(item) && item.id === id)
    const anchorIndex = value.findIndex((item) => isRecord(item) && item.id === anchorId)
    if (movedIndex >= 0 && anchorIndex >= 0) {
      const next = [...value]
      const [moved] = next.splice(movedIndex, 1)
      const nextAnchor = next.findIndex((item) => isRecord(item) && item.id === anchorId)
      next.splice(nextAnchor + (position === 'after' ? 1 : 0), 0, isRecord(moved) ? { ...moved, _local_pending: true } : moved)
      if (next.length === value.length && next.every((item, index) => isRecord(item) && isRecord(value[index]) ? item.id === value[index].id : item === value[index])) return value
      return next
    }
    let changed = false
    const next = value.map((item) => {
      const projected = projectMoveValue(item, id, anchorId, position)
      if (projected !== item) changed = true
      return projected
    })
    return changed ? next : value
  }
  if (!isRecord(value)) return value
  const next = { ...value }
  let changed = false
  for (const key of ['items', 'todos']) if (key in next) {
    const projected = projectMoveValue(next[key], id, anchorId, position)
    if (projected !== next[key]) { next[key] = projected; changed = true }
  }
  return changed ? next : value
}

async function resolveRow(qc: QueryClient, kind: EntityCommandKind, id: string) {
  // 只在该实体的查询前缀内查找：全缓存扫描在跨表 UUID 碰撞（如备份导入）
  // 时可能取到其他实体的行，导致 expected/baseVersion 错误。
  const prefixes = QUERY_PREFIXES[kind] ?? []
  for (const [, data] of qc.getQueriesData({ predicate: (query) => prefixes.includes(String(query.queryKey[0])) })) {
    const found = findById(data, id)
    if (found) return found
  }
  if (!navigator.onLine) throw new Error('该记录尚未缓存，无法离线修改')
  const table = TABLES[kind]
  if (!table || !supabase) throw new Error('实体不支持修改')
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('记录不存在')
  return data as Record<string, unknown>
}

export async function createEntity(qc: QueryClient, userId: string, kind: EntityCommandKind, payload: Record<string, unknown>, options: { entityId?: string; commandId?: string; dependsOnCommandIds?: string[] } = {}) {
  const entityId = options.entityId ?? crypto.randomUUID()
  const result = await enqueueCommand(userId, { kind: `${kind}.create`, entityId, payload, commandId: options.commandId, dependsOnCommandIds: options.dependsOnCommandIds })
  const row = result.data ?? legacyDefaults(kind, entityId, userId, payload)
  projectCreate(qc, kind, row)
  return { ...result, data: row }
}

export async function updateEntity(qc: QueryClient, userId: string, kind: EntityCommandKind, id: string, patch: Record<string, unknown>) {
  const current = await resolveRow(qc, kind, id)
  const expected = Object.fromEntries(Object.keys(patch).map((key) => [key, current[key]]))
  const result = await enqueueCommand(userId, { kind: `${kind}.update`, entityId: id, payload: patch, expected, baseVersion: Number((current as VersionedRow).row_version ?? 1) })
  projectMutation(qc, kind, id, 'update', patch)
  return result
}

export async function deleteEntity(qc: QueryClient, userId: string, kind: EntityCommandKind, id: string) {
  const current = await resolveRow(qc, kind, id)
  const result = await enqueueCommand(userId, { kind: `${kind}.delete`, entityId: id, baseVersion: Number((current as VersionedRow).row_version ?? 1) })
  projectMutation(qc, kind, id, 'delete', {})
  return result
}

/** Re-apply unresolved V2 commands after a page reload/refetch. */
export function replayPendingCommands(qc: QueryClient, commands: WorkbenchCommandV2[]) {
  const active = commands
    .filter((command) => ['pending', 'syncing', 'conflict', 'failed'].includes(command.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const command of active) {
    const [entity, action] = command.kind.split('.')
    if (!TABLES[entity as EntityCommandKind] || !['create', 'update', 'delete', 'move'].includes(action)) continue
    const kind = entity as EntityCommandKind
    if (action === 'create') {
      const row = command.result?.data ?? legacyDefaults(kind, command.entityId, command.userId, command.payload)
      projectCreate(qc, kind, row)
    } else if (action === 'update') {
      projectMutation(qc, kind, command.entityId, 'update', command.payload)
    } else if (action === 'delete') {
      projectMutation(qc, kind, command.entityId, 'delete', {})
    } else if (command.kind === 'todo.move') {
      const anchorId = String(command.payload.anchor_id ?? '')
      const position = command.payload.position === 'after' ? 'after' : 'before'
      if (anchorId) {
        for (const [queryKey] of qc.getQueriesData({ predicate: (query) => QUERY_PREFIXES.todo?.includes(String(query.queryKey[0])) ?? false })) {
          qc.setQueryData(queryKey, (value: unknown) => projectMoveValue(value, command.entityId, anchorId, position))
        }
      }
    }
  }
}

export async function moveTodoEntity(qc: QueryClient, userId: string, id: string, anchorId: string, position: 'before' | 'after') {
  const current = await resolveRow(qc, 'todo', id)
  await resolveRow(qc, 'todo', anchorId)
  const result = await enqueueCommand(userId, {
    kind: 'todo.move', entityId: id, payload: { anchor_id: anchorId, position },
    expected: { sort_order: current.sort_order }, baseVersion: Number((current as VersionedRow).row_version ?? 1)
  })
  for (const [queryKey] of qc.getQueriesData({ predicate: (query) => QUERY_PREFIXES.todo?.includes(String(query.queryKey[0])) ?? false })) {
    qc.setQueryData(queryKey, (value: unknown) => projectMoveValue(value, id, anchorId, position))
  }
  return result
}
