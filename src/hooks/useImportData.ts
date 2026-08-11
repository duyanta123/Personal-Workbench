import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import {
  BACKUP_TABLES,
  base64ToBlob,
  MAX_AVATAR_BYTES,
  type BackupV3
} from '../utils/backup'
import { compressImage } from '../utils/avatar'
import { cancelAllPendingDeletes } from './useDeferredDelete'
import { clearPomodoroRuntime } from '../utils/pomodoroRuntime'
import {
  discardPendingOperations,
  flushOutbox,
  pendingOperationCount,
  refreshSyncState
} from '../lib/outbox'
import { clearUserLocalData } from '../lib/localData'
import type { Json } from '../lib/database.types'
import { rpcArray, rpcRecord } from '../lib/rpcSchemas'

interface RestoreResult {
  counts: Record<string, number>
  deleted_counts?: Record<string, number>
  old_avatar_paths: string[]
  restore_epoch?: number
}

const MAX_CHUNK_ROWS = 500
// Leave room for jsonb's normalized text representation before the server's 1 MiB hard limit.
const TARGET_CHUNK_BYTES = 900 * 1024

function restoreChunks(rows: Record<string, unknown>[]) {
  const encoder = new TextEncoder()
  const chunks: Record<string, unknown>[][] = []
  let chunk: Record<string, unknown>[] = []
  let bytes = 2
  for (const row of rows) {
    const rowBytes = encoder.encode(JSON.stringify(row)).byteLength + (chunk.length ? 1 : 0)
    if (rowBytes + 2 > TARGET_CHUNK_BYTES) throw new Error('备份中存在超过分块限制的单行数据')
    if (chunk.length >= MAX_CHUNK_ROWS || bytes + rowBytes > TARGET_CHUNK_BYTES) {
      chunks.push(chunk)
      chunk = []
      bytes = 2
    }
    chunk.push(row)
    bytes += rowBytes
  }
  if (chunk.length) chunks.push(chunk)
  return chunks
}

export function useImportData() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (payload: BackupV3) => {
      if (!userId) throw new Error('未登录')
      if (!navigator.onLine) throw new Error('恢复数据需要联网')
      cancelAllPendingDeletes()

      let pending = await pendingOperationCount(userId)
      if (pending > 0) {
        try {
          pending = (await flushOutbox(userId)).pending
        } catch {
          pending = await pendingOperationCount(userId)
        }
      }
      if (pending > 0) {
        const discard = window.confirm(
          `仍有 ${pending} 条本机操作无法同步。继续恢复会永久丢弃这些操作，确定丢弃并继续吗？`
        )
        if (!discard) throw new Error('已取消恢复：请先同步本机操作')
        await discardPendingOperations(userId)
      }

      const sync = await refreshSyncState(userId)
      const manifest = Object.fromEntries(BACKUP_TABLES.map((table) => [table, payload.tables[table].length]))
      const sourceVersion = payload.metadata.source_version ?? 3
      const begin = await supabase!.rpc('begin_restore', {
        p_expected_revision: sync.revision,
        p_source_version: sourceVersion,
        p_manifest: manifest
      })
      if (begin.error) throw begin.error
      const restoreId = String(begin.data ?? '')
      if (!restoreId) throw new Error('服务端未返回恢复任务 ID')

      const stagedPaths: string[] = []
      let committed = false
      try {
        for (const table of BACKUP_TABLES) {
          const chunks = restoreChunks(payload.tables[table])
          for (let index = 0; index < chunks.length; index++) {
            const staged = await supabase!.rpc('stage_restore_chunk', {
              p_restore_id: restoreId,
              p_table: table,
              p_chunk_index: index,
              p_rows: chunks[index] as unknown as Json
            })
            if (staged.error) throw staged.error
          }
        }

        const avatarRows: { path: string; is_active: boolean; created_at: string }[] = []
        for (const avatar of payload.avatars) {
          const decoded = base64ToBlob(avatar.data_base64, avatar.mime_type)
          if (decoded.size > MAX_AVATAR_BYTES) throw new Error('备份中的头像超过 5 MiB')
          const webp = await compressImage(new File([decoded], 'avatar', { type: avatar.mime_type }))
          if (webp.size > MAX_AVATAR_BYTES) throw new Error('压缩后的头像超过 5 MiB')
          const path = `${userId}/restore-${restoreId}-${crypto.randomUUID()}.webp`
          const { error } = await supabase!.storage.from('avatars').upload(path, webp, {
            contentType: 'image/webp',
            upsert: false
          })
          if (error) throw error
          stagedPaths.push(path)
          avatarRows.push({ path, is_active: avatar.is_active, created_at: avatar.created_at })
        }

        const finalized = await supabase!.rpc('finalize_restore', {
          p_restore_id: restoreId,
          p_avatar_paths: avatarRows
        })
        if (finalized.error) throw finalized.error
        committed = true
        const value = rpcRecord(finalized.data, 'restore result')
        rpcRecord(value.counts, 'restore result.counts')
        rpcArray(value.old_avatar_paths, 'restore result.old_avatar_paths')
        const result = value as unknown as RestoreResult
        const oldPaths = (result.old_avatar_paths ?? []).filter((path) => !stagedPaths.includes(path))
        if (oldPaths.length) await supabase!.storage.from('avatars').remove(oldPaths).catch(() => undefined)
        return result.counts ?? {}
      } catch (error) {
        if (!committed) {
          try {
            await supabase!.rpc('abort_restore', { p_restore_id: restoreId })
          } catch {
            // The original restore error is more useful than a best-effort abort failure.
          }
          if (stagedPaths.length) await supabase!.storage.from('avatars').remove(stagedPaths).catch(() => undefined)
        }
        throw error
      }
    },
    onSuccess: async () => {
      if (userId) {
        clearPomodoroRuntime(localStorage, userId)
        window.dispatchEvent(new CustomEvent('workbench:pomodoro-reset', { detail: userId }))
        await clearUserLocalData(userId)
      }
      qc.clear()
      window.setTimeout(() => window.location.reload(), 50)
    }
  })
}
