import type { Json } from './database.types'
import { supabase } from './supabase'
import { deleteLocalValue, getLocalValue, listLocalValues, localKeys, setLocalValue } from './localData'
import { getCachedSyncState, isNetworkError, refreshSyncState } from './syncCore'
import { rpcCommandResultSchema, workbenchCommandV2Schema } from './runtimeSchemas'
import { captureException } from './monitoring'

export type CommandStatus = 'pending' | 'syncing' | 'conflict' | 'failed' | 'stale' | 'resolved'
export type CommandResultStatus = 'applied' | 'duplicate' | 'conflict' | 'not_found' | 'stale_restore' | 'failed'

export interface WorkbenchCommandV2 {
  version: 2
  commandId: string
  entityId: string
  userId: string
  kind: string
  payload: Record<string, unknown>
  expected: Record<string, unknown>
  baseVersion: number | null
  restoreEpoch: number
  createdAt: string
  dependsOnCommandIds: string[]
  status: CommandStatus
  attempts: number
  lastError?: string
  result?: CommandResult
  resolvedAt?: string
}

export interface CommandResult {
  status: CommandResultStatus
  commandId: string
  entityId: string
  data: Record<string, unknown> | null
  current: Record<string, unknown> | null
  conflictingFields: string[]
  message: string | null
}

export interface SyncMetadata {
  lastSuccessAt: string | null
  lastAttemptAt: string | null
}

export interface FlushCommandsResult {
  applied: number
  conflicts: number
  failed: number
  stale: number
  pending: number
}

export const MAX_PENDING_COMMANDS = 1000
const MAX_HISTORY = 100
const HISTORY_MAX_AGE = 30 * 24 * 60 * 60 * 1000
const localFlushes = new Map<string, Promise<FlushCommandsResult>>()

function commandKey(commandId: string) {
  return `${localKeys.commandPrefix}${commandId}`
}

function historyKey(commandId: string) {
  return `${localKeys.syncHistoryPrefix}${commandId}`
}

function isCommand(value: unknown): value is WorkbenchCommandV2 {
  return workbenchCommandV2Schema.safeParse(value).success
}

function parseResult(value: unknown, command: WorkbenchCommandV2): CommandResult {
  const parsed = rpcCommandResultSchema.safeParse(value)
  if (!parsed.success) return {
    status: 'failed', commandId: command.commandId, entityId: command.entityId,
    data: null, current: null, conflictingFields: [], message: 'RPC 返回格式无效'
  }
  const row = parsed.data
  return {
    status: row.status,
    commandId: row.command_id,
    entityId: row.entity_id,
    data: row.data,
    current: row.current,
    conflictingFields: row.conflicting_fields,
    message: row.message
  }
}

async function syncState(userId: string) {
  if (navigator.onLine) {
    try { return await refreshSyncState(userId) } catch (error) { if (!isNetworkError(error)) throw error }
  }
  const cached = await getCachedSyncState(userId)
  if (!cached) throw new Error('首次同步前无法离线保存操作')
  return cached
}

async function applyCommand(command: WorkbenchCommandV2): Promise<CommandResult> {
  if (!supabase) throw new Error('Supabase 未配置')
  if (command.kind === 'todo.move') {
    const { data, error } = await supabase.rpc('move_todo_v2', {
      p_command_id: command.commandId,
      p_restore_epoch: command.restoreEpoch,
      p_todo_id: command.entityId,
      p_base_version: command.baseVersion ?? 0,
      p_anchor_id: String(command.payload.anchor_id),
      p_position: String(command.payload.position)
    })
    if (error) throw error
    return parseResult(data, command)
  }
  if (command.kind === 'preference.update') {
    const { data, error } = await supabase.rpc('apply_workbench_preference_v2', {
      p_command_id: command.commandId,
      p_entity_id: command.entityId,
      p_restore_epoch: command.restoreEpoch,
      p_payload: command.payload as Json,
      p_expected: command.expected as Json,
      p_base_version: command.baseVersion ?? 0
    })
    if (error) throw error
    return parseResult(data, command)
  }
  const { data, error } = await supabase.rpc('apply_workbench_command_v2', {
    p_command_id: command.commandId,
    p_entity_id: command.entityId,
    p_restore_epoch: command.restoreEpoch,
    p_kind: command.kind,
    p_payload: command.payload as Json,
    p_expected: command.expected as Json,
    p_base_version: command.baseVersion,
    p_depends_on: command.dependsOnCommandIds
  })
  if (error) throw error
  return parseResult(data, command)
}

async function pendingCommands(userId: string) {
  const rows = await listLocalValues<WorkbenchCommandV2>(userId, localKeys.commandPrefix)
  return rows.map((row) => row.value).filter(isCommand).filter((row) => row.userId === userId)
}

function commandParts(kind: string) {
  const [entity, action] = kind.split('.')
  return { entity, action }
}

function commandRpc(kind: string) {
  if (kind === 'todo.move') return 'move_todo_v2'
  if (kind === 'preference.update') return 'apply_workbench_preference_v2'
  return 'apply_workbench_command_v2'
}

function reportCommandError(error: unknown, command: WorkbenchCommandV2, queueCount: number, stage: string) {
  captureException(error, {
    rpc: commandRpc(command.kind),
    error_category: isNetworkError(error) ? 'network' : 'rpc',
    queue_count: queueCount,
    recovery_stage: stage,
    restore_epoch: command.restoreEpoch,
    command_kind: command.kind
  })
}

async function compactCommand(
  userId: string,
  entries: WorkbenchCommandV2[],
  input: { kind: string; entityId: string; payload: Record<string, unknown>; expected: Record<string, unknown> }
) {
  const next = commandParts(input.kind)
  const related = entries
    .filter((row) => row.entityId === input.entityId && ['pending', 'failed'].includes(row.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const create = related.find((row) => commandParts(row.kind).entity === next.entity && commandParts(row.kind).action === 'create')

  if (create && next.action === 'update') {
    create.payload = { ...create.payload, ...input.payload }
    create.status = 'pending'
    create.lastError = undefined
    await setLocalValue(userId, commandKey(create.commandId), create)
    return { kind: 'merged' as const, command: create }
  }

  if (create && next.action === 'delete') {
    const cancelled = new Set(related.map((row) => row.commandId))
    let changed = true
    while (changed) {
      changed = false
      for (const row of entries) {
        if (!cancelled.has(row.commandId) && row.dependsOnCommandIds.some((id) => cancelled.has(id))) {
          cancelled.add(row.commandId)
          changed = true
        }
      }
    }
    await Promise.all([...cancelled].map((id) => deleteLocalValue(userId, commandKey(id))))
    return { kind: 'cancelled' as const, command: create }
  }

  if (next.action === 'update') {
    const previous = [...related].reverse().find((row) => commandParts(row.kind).entity === next.entity && commandParts(row.kind).action === 'update')
    if (previous) {
      previous.payload = { ...previous.payload, ...input.payload }
      previous.expected = { ...input.expected, ...previous.expected }
      previous.status = 'pending'
      previous.lastError = undefined
      await setLocalValue(userId, commandKey(previous.commandId), previous)
      return { kind: 'merged' as const, command: previous }
    }
  }
  if (next.action === 'move') {
    const previous = [...related].reverse().find((row) => row.kind === input.kind)
    if (previous) {
      previous.payload = input.payload
      previous.status = 'pending'
      previous.lastError = undefined
      await setLocalValue(userId, commandKey(previous.commandId), previous)
      return { kind: 'merged' as const, command: previous }
    }
  }
  return null
}

async function pruneHistory(userId: string) {
  const rows = await listLocalValues<WorkbenchCommandV2>(userId, localKeys.syncHistoryPrefix)
  const cutoff = Date.now() - HISTORY_MAX_AGE
  const sorted = rows.filter((row) => isCommand(row.value)).sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt))
  await Promise.all(sorted.filter((row, index) => index >= MAX_HISTORY || Date.parse(row.value.resolvedAt ?? row.value.createdAt) < cutoff)
    .map((row) => deleteLocalValue(userId, row.key)))
}

async function archiveCommand(command: WorkbenchCommandV2) {
  const archived = { ...command, status: 'resolved' as const, resolvedAt: new Date().toISOString() }
  await setLocalValue(command.userId, historyKey(command.commandId), archived)
  await deleteLocalValue(command.userId, commandKey(command.commandId))
  void pruneHistory(command.userId)
}

function emit(userId: string) {
  window.dispatchEvent(new CustomEvent('workbench:commands-changed', { detail: userId }))
}

export async function enqueueCommand(
  userId: string,
  input: {
    kind: string
    entityId?: string
    payload?: Record<string, unknown>
    expected?: Record<string, unknown>
    baseVersion?: number | null
    dependsOnCommandIds?: string[]
    commandId?: string
  }
): Promise<{ status: 'applied' | 'queued' | 'conflict'; commandId: string; entityId: string; data: Record<string, unknown> | null }> {
  const existing = await pendingCommands(userId)
  if (existing.length >= MAX_PENDING_COMMANDS) throw new Error(`待同步操作不能超过 ${MAX_PENDING_COMMANDS} 条`)
  const state = await syncState(userId)
  const commandId = input.commandId ?? crypto.randomUUID()
  const entityId = input.entityId ?? crypto.randomUUID()
  const compacted = await compactCommand(userId, existing, {
    kind: input.kind,
    entityId,
    payload: input.payload ?? {},
    expected: input.expected ?? {}
  })
  if (compacted) {
    emit(userId)
    return compacted.kind === 'cancelled'
      ? { status: 'applied', commandId: compacted.command.commandId, entityId, data: null }
      : { status: 'queued', commandId: compacted.command.commandId, entityId, data: null }
  }
  const command: WorkbenchCommandV2 = {
    version: 2,
    commandId,
    entityId,
    userId,
    kind: input.kind,
    payload: input.payload ?? {},
    expected: input.expected ?? {},
    baseVersion: input.baseVersion ?? null,
    restoreEpoch: state.restore_epoch,
    createdAt: new Date().toISOString(),
    dependsOnCommandIds: input.dependsOnCommandIds ?? [],
    status: 'pending',
    attempts: 0
  }
  await setLocalValue(userId, commandKey(commandId), command)
  emit(userId)
  if (!navigator.onLine) return { status: 'queued', commandId, entityId, data: null }
  try {
    const result = await applyCommand(command)
    command.result = result
    if (result.status === 'applied' || result.status === 'duplicate') {
      await archiveCommand(command)
      emit(userId)
      return { status: 'applied', commandId, entityId, data: result.data }
    }
    command.status = result.status === 'conflict' ? 'conflict' : result.status === 'stale_restore' ? 'stale' : 'failed'
    await setLocalValue(userId, commandKey(commandId), command)
    emit(userId)
    return { status: result.status === 'conflict' ? 'conflict' : 'queued', commandId, entityId, data: result.current }
  } catch (error) {
    reportCommandError(error, command, existing.length + 1, 'enqueue_apply')
    if (!isNetworkError(error)) {
      command.status = 'failed'
      command.lastError = error instanceof Error ? error.message : String(error)
    } else {
      command.attempts++
      command.lastError = error instanceof Error ? error.message : String(error)
    }
    await setLocalValue(userId, commandKey(commandId), command)
    emit(userId)
    if (!isNetworkError(error)) throw error
    return { status: 'queued', commandId, entityId, data: null }
  }
}

async function flushUnlocked(userId: string): Promise<FlushCommandsResult> {
  const counters = { applied: 0, conflicts: 0, failed: 0, stale: 0, pending: 0 }
  if (!navigator.onLine) {
    counters.pending = (await pendingCommands(userId)).filter((row) => row.status === 'pending' || row.status === 'syncing').length
    return counters
  }
  const state = await refreshSyncState(userId)
  const entries = (await pendingCommands(userId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const complete = new Set<string>()
  for (const command of entries) {
    if (command.status === 'conflict') { counters.conflicts++; continue }
    if (command.status === 'failed') { counters.failed++; continue }
    if (command.status === 'stale' || command.restoreEpoch !== state.restore_epoch) {
      command.status = 'stale'
      command.result = { status: 'stale_restore', commandId: command.commandId, entityId: command.entityId, data: null, current: null, conflictingFields: [], message: '恢复数据后操作已过期' }
      await setLocalValue(userId, commandKey(command.commandId), command)
      counters.stale++
      continue
    }
    const unresolvedDependencies = command.dependsOnCommandIds
      .map((id) => entries.find((row) => row.commandId === id))
      .filter((row): row is WorkbenchCommandV2 => Boolean(row) && !complete.has(row!.commandId))
    if (unresolvedDependencies.some((row) => ['conflict', 'failed', 'stale'].includes(row.status))) {
      command.status = 'failed'
      command.lastError = '父操作未成功，关联操作已阻止'
      await setLocalValue(userId, commandKey(command.commandId), command)
      counters.failed++
      continue
    }
    if (unresolvedDependencies.length > 0) {
      counters.pending++
      continue
    }
    command.status = 'syncing'
    await setLocalValue(userId, commandKey(command.commandId), command)
    try {
      const result = await applyCommand(command)
      command.result = result
      if (result.status === 'applied' || result.status === 'duplicate') {
        complete.add(command.commandId)
        await archiveCommand(command)
        counters.applied++
      } else {
        command.status = result.status === 'conflict' ? 'conflict' : result.status === 'stale_restore' ? 'stale' : 'failed'
        await setLocalValue(userId, commandKey(command.commandId), command)
        if (command.status === 'conflict') counters.conflicts++
        else if (command.status === 'stale') counters.stale++
        else counters.failed++
      }
    } catch (error) {
      reportCommandError(error, command, entries.length, 'flush_apply')
      command.status = isNetworkError(error) ? 'pending' : 'failed'
      command.attempts++
      command.lastError = error instanceof Error ? error.message : String(error)
      await setLocalValue(userId, commandKey(command.commandId), command)
      if (isNetworkError(error)) { counters.pending++; break }
      counters.failed++
    }
  }
  const meta: SyncMetadata = { lastAttemptAt: new Date().toISOString(), lastSuccessAt: counters.applied > 0 || entries.length === 0 ? new Date().toISOString() : null }
  const previous = await getLocalValue<SyncMetadata>(userId, localKeys.syncMetadata)
  if (!meta.lastSuccessAt) meta.lastSuccessAt = previous?.lastSuccessAt ?? null
  await setLocalValue(userId, localKeys.syncMetadata, meta)
  emit(userId)
  return counters
}

export function flushCommands(userId: string) {
  const active = localFlushes.get(userId)
  if (active) return active
  const promise = flushUnlocked(userId).finally(() => localFlushes.delete(userId))
  localFlushes.set(userId, promise)
  return promise
}

export async function listCommands(userId: string, includeHistory = false) {
  const active = await pendingCommands(userId)
  if (!includeHistory) return active.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const history = (await listLocalValues<WorkbenchCommandV2>(userId, localKeys.syncHistoryPrefix)).map((row) => row.value).filter(isCommand)
  return [...active, ...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getSyncMetadata(userId: string) {
  return getLocalValue<SyncMetadata>(userId, localKeys.syncMetadata)
}

export async function resolveCommand(userId: string, commandId: string, resolution: 'keep_remote' | 'reapply') {
  const command = await getLocalValue<WorkbenchCommandV2>(userId, commandKey(commandId))
  if (!command || !isCommand(command)) throw new Error('同步操作不存在')
  if (resolution === 'keep_remote') {
    await archiveCommand(command)
    emit(userId)
    return
  }
  const current = command.result?.current
  if (!current) throw new Error('缺少远端当前版本，无法重新应用')
  await archiveCommand(command)
  await enqueueCommand(userId, {
    kind: command.kind,
    entityId: command.entityId,
    payload: command.payload,
    expected: Object.fromEntries(Object.keys(command.payload).map((key) => [key, current[key]])),
    baseVersion: Number(current.row_version ?? 0),
    dependsOnCommandIds: []
  })
  emit(userId)
}

export async function discardCommand(userId: string, commandId: string) {
  const command = await getLocalValue<WorkbenchCommandV2>(userId, commandKey(commandId))
  if (command && isCommand(command)) await archiveCommand(command)
  emit(userId)
}
