import { supabase } from './supabase'
import { getLocalValue, localKeys, setLocalValue } from './localData'

/** Protocol-independent synchronization state shared by V1 compatibility and V2 commands. */
export interface SyncState {
  revision: number
  restore_epoch: number
}

export function isNetworkError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : String((error as { message?: unknown })?.message ?? error)
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
