import { supabase } from './supabase'
import type { Json } from './database.types'
import type { NoteLayout, PracticeDifficulty, PracticeStatus, Priority } from '../types'
import { deleteLocalValue, getLocalValue, listLocalValues, localKeys, setLocalValue } from './localData'

export type WorkbenchOperationKind =
  | 'todo.create'
  | 'habit.create'
  | 'ledger.create'
  | 'goal.create'
  | 'goal.adjust'
  | 'note.create'
  | 'practice.create'
  | 'workout_session.create'
  | 'workout_exercise.create'
  | 'pomodoro.complete'
  | 'avatar.register'

export interface WorkbenchOperationPayloads {
  'todo.create': { text: string; level: Priority; due_date?: string | null; done?: boolean; pinned?: boolean }
  'habit.create': { name: string; emoji: string; pinned?: boolean }
  'ledger.create': { kind: 'income' | 'expense'; category: string; amount: number; note: string | null; entry_date: string }
  'goal.create': { name: string; emoji: string; current: number; target: number; unit: string | null; note?: string | null; pinned?: boolean }
  'goal.adjust': { goal_id: string; delta: number }
  'note.create': { title: string | null; body: string; tags: string[]; pinned?: boolean; layout?: NoteLayout; image_url?: string | null }
  'practice.create': { title: string; platform: string; difficulty: PracticeDifficulty; status: PracticeStatus; tags: string[]; url: string | null; note?: string | null; solved_at?: string | null }
  'workout_session.create': { date: string; body_part: string; duration_min: number | null; note: string | null }
  'workout_exercise.create': { session_id: string; name: string; sets: number; reps: number; weight: number; note: string | null }
  'pomodoro.complete': { date: string; minutes: number }
  'avatar.register': { path: string }
}

export interface SyncState {
  revision: number
  restore_epoch: number
}

interface PendingOperationBase {
  version: 1
  operationId: string
  userId: string
  restoreEpoch: number
  createdAt: string
  attempts: number
  lastError?: string
}

export type PendingOperation = {
  [Kind in WorkbenchOperationKind]: PendingOperationBase & {
    kind: Kind
    payload: WorkbenchOperationPayloads[Kind]
  }
}[WorkbenchOperationKind]

export interface OperationResult<T = unknown> {
  status: 'applied' | 'queued'
  operationId: string
  data: T | null
}

export interface FlushResult {
  applied: number
  stale: number
  pending: number
}

const localFlushes = new Map<string, Promise<FlushResult>>()

/** V1 上限与 V2 对齐；该协议已停止新增调用方（见 ADR 0004）。 */
const MAX_PENDING_OPERATIONS = 1000

function isNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error)
  return /fetch|abort|network|timeout|offline|failed to fetch/i.test(message)
}

function validSyncState(value: unknown): value is SyncState {
  const state = value as Partial<SyncState> | null
  return Boolean(state)
    && Number.isSafeInteger(state?.revision) && Number(state?.revision) >= 0
    && Number.isSafeInteger(state?.restore_epoch) && Number(state?.restore_epoch) >= 0
}

export async function refreshSyncState(userId: string): Promise<SyncState> {
  if (!supabase) throw new Error('Supabase 未配置')
  const { data, error } = await supabase.rpc('get_user_sync_state')
  if (error) throw error
  if (!validSyncState(data)) throw new Error('服务端同步状态无效')
  await setLocalValue(userId, localKeys.syncState, data)
  return data
}

export async function getCachedSyncState(userId: string): Promise<SyncState | null> {
  try {
    const value = await getLocalValue<unknown>(userId, localKeys.syncState)
    return validSyncState(value) ? value : null
  } catch {
    return null
  }
}

async function requireSyncState(userId: string): Promise<SyncState> {
  if (navigator.onLine) {
    try {
      return await refreshSyncState(userId)
    } catch (error) {
      if (!isNetworkError(error)) throw error
    }
  }
  const cached = await getCachedSyncState(userId)
  if (!cached) throw new Error('首次同步前无法离线保存操作')
  return cached
}

function operationKey(operationId: string) {
  return `${localKeys.outboxPrefix}${operationId}`
}

async function applyOperation(entry: PendingOperation): Promise<unknown> {
  if (!supabase) throw new Error('Supabase 未配置')
  const { data, error } = await supabase.rpc('apply_workbench_operation', {
    p_operation_id: entry.operationId,
    p_restore_epoch: entry.restoreEpoch,
    p_kind: entry.kind,
    p_payload: entry.payload as unknown as Json
  })
  if (error) throw error
  return data
}

const OPERATION_KINDS = new Set<WorkbenchOperationKind>([
  'todo.create', 'habit.create', 'ledger.create', 'goal.create', 'goal.adjust',
  'note.create', 'practice.create', 'workout_session.create', 'workout_exercise.create',
  'pomodoro.complete', 'avatar.register'
])

function isPendingOperation(value: unknown): value is PendingOperation {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return entry.version === 1
    && typeof entry.operationId === 'string'
    && typeof entry.userId === 'string'
    && typeof entry.restoreEpoch === 'number'
    && typeof entry.kind === 'string'
    && OPERATION_KINDS.has(entry.kind as WorkbenchOperationKind)
    && Boolean(entry.payload) && typeof entry.payload === 'object' && !Array.isArray(entry.payload)
    && typeof entry.createdAt === 'string'
    && typeof entry.attempts === 'number'
}

/**
 * @deprecated V1 写入协议已退役：新代码一律使用 commands.ts 的 enqueueCommand（V2）。
 * 本函数保留是为了让旧版本客户端遗留的 pending 操作继续可被 flushOutbox 消化。
 */
export async function enqueueOperation<T = unknown, Kind extends WorkbenchOperationKind = WorkbenchOperationKind>(
  userId: string,
  kind: Kind,
  payload: WorkbenchOperationPayloads[Kind],
  operationId: string = crypto.randomUUID()
): Promise<OperationResult<T>> {
  const pendingCount = await pendingOperationCount(userId)
  if (pendingCount >= MAX_PENDING_OPERATIONS) {
    throw new Error(`待同步操作不能超过 ${MAX_PENDING_OPERATIONS} 条`)
  }
  const sync = await requireSyncState(userId)
  const entry = {
    version: 1,
    operationId,
    userId,
    restoreEpoch: sync.restore_epoch,
    kind,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0
  } as Extract<PendingOperation, { kind: Kind }>
  await setLocalValue(userId, operationKey(operationId), entry)
  window.dispatchEvent(new CustomEvent('workbench:outbox-changed', { detail: userId }))

  if (!navigator.onLine) return { status: 'queued', operationId, data: null }
  try {
    const data = await applyOperation(entry)
    await deleteLocalValue(userId, operationKey(operationId))
    window.dispatchEvent(new CustomEvent('workbench:outbox-changed', { detail: userId }))
    return { status: 'applied', operationId, data: data as T }
  } catch (error) {
    if (!isNetworkError(error)) {
      // 非网络错误保留记录供排查，不再静默删除。
      entry.attempts++
      entry.lastError = error instanceof Error ? error.message : String(error)
      await setLocalValue(userId, operationKey(operationId), entry)
      throw error
    }
    entry.attempts++
    entry.lastError = error instanceof Error ? error.message : String(error)
    await setLocalValue(userId, operationKey(operationId), entry)
    return { status: 'queued', operationId, data: null }
  }
}

async function flushUnlocked(userId: string): Promise<FlushResult> {
  if (!navigator.onLine) {
    const pending = await pendingOperationCount(userId)
    return { applied: 0, stale: 0, pending }
  }
  const sync = await refreshSyncState(userId)
  const records = await listLocalValues<PendingOperation>(userId, localKeys.outboxPrefix)
  const entries = records
    .map((record) => record.value)
    .filter(isPendingOperation)
    .filter((entry) => entry.userId === userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  let applied = 0
  let stale = 0
  for (const entry of entries) {
    const key = operationKey(entry.operationId)
    if (entry.restoreEpoch !== sync.restore_epoch) {
      await deleteLocalValue(userId, key)
      stale++
      continue
    }
    try {
      await applyOperation(entry)
      await deleteLocalValue(userId, key)
      applied++
    } catch (error) {
      if (!isNetworkError(error)) {
        const message = String((error as { message?: unknown })?.message ?? error)
        if (/stale restore epoch/i.test(message)) {
          await deleteLocalValue(userId, key)
          stale++
          continue
        }
        // 非网络错误保留记录供排查（workbench:outbox-error 提示用户），不再静默删除。
        entry.attempts++
        entry.lastError = message
        await setLocalValue(userId, key, entry)
        window.dispatchEvent(new CustomEvent('workbench:outbox-error', { detail: message }))
        continue
      }
      entry.attempts++
      entry.lastError = error instanceof Error ? error.message : String(error)
      await setLocalValue(userId, key, entry)
      break
    }
  }
  const pending = await pendingOperationCount(userId)
  window.dispatchEvent(new CustomEvent('workbench:outbox-changed', { detail: userId }))
  return { applied, stale, pending }
}

export function flushOutbox(userId: string): Promise<FlushResult> {
  const active = localFlushes.get(userId)
  if (active) return active
  const promise = flushUnlocked(userId).finally(() => localFlushes.delete(userId))
  localFlushes.set(userId, promise)
  return promise
}

export async function pendingOperationCount(userId: string) {
  try {
    return (await listLocalValues<PendingOperation>(userId, localKeys.outboxPrefix)).length
  } catch {
    return 0
  }
}

export async function discardPendingOperations(userId: string) {
  const records = await listLocalValues<PendingOperation>(userId, localKeys.outboxPrefix)
  await Promise.all(records.map((record) => deleteLocalValue(userId, record.key)))
  window.dispatchEvent(new CustomEvent('workbench:outbox-changed', { detail: userId }))
}

export { isNetworkError }
