import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import {
  BACKUP_TABLES,
  base64ToBlob,
  MAX_AVATAR_BYTES,
  type BackupV7
} from '../utils/backup'
import { compressImage } from '../utils/avatar'
import { cancelAllPendingDeletes } from './useDeferredDelete'
import { clearPomodoroRuntime } from '../utils/pomodoroRuntime'
import {
  discardPendingOperations,
  flushOutbox,
  pendingOperationCount
} from '../lib/outbox'
import { refreshSyncState } from '../lib/syncCore'
import { clearUserLocalData } from '../lib/localData'
import { discardCommand, flushCommands, listCommands } from '../lib/commands'
import type { Json } from '../lib/database.types'
import { rpcArray, rpcRecord } from '../lib/rpcSchemas'
import { stageBackupV8, type BackupV8RestoreInput } from '../utils/backupV8'
import { captureException } from '../lib/monitoring'

interface RestoreResult {
  counts: Record<string, number>
  deleted_counts?: Record<string, number>
  old_avatar_paths: string[]
  restore_epoch?: number
}

const MAX_CHUNK_ROWS = 500
// Leave room for jsonb's normalized text representation before the server's 1 MiB hard limit.
const TARGET_CHUNK_BYTES = 900 * 1024

export type BackupRestoreInput = BackupV7 | BackupV8RestoreInput

function isV8Restore(input: BackupRestoreInput): input is BackupV8RestoreInput {
  return 'kind' in input && input.kind === 'v8'
}

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
    mutationFn: async (payload: BackupRestoreInput) => {
      if (!userId) throw new Error('未登录')
      if (!navigator.onLine) throw new Error('恢复数据需要联网')
      cancelAllPendingDeletes()

      let pending = (await pendingOperationCount(userId))
        + (await listCommands(userId)).filter((command) => command.status !== 'resolved').length
      if (pending > 0) {
        try {
          const [legacyResult] = await Promise.all([flushOutbox(userId), flushCommands(userId)])
          pending = legacyResult.pending
            + (await listCommands(userId)).filter((command) => command.status !== 'resolved').length
        } catch {
          pending = (await pendingOperationCount(userId))
            + (await listCommands(userId)).filter((command) => command.status !== 'resolved').length
        }
      }
      if (pending > 0) {
        const discard = window.confirm(
          `仍有 ${pending} 条本机操作无法同步。继续恢复会永久丢弃这些操作，确定丢弃并继续吗？`
        )
        if (!discard) throw new Error('已取消恢复：请先同步本机操作')
        await discardPendingOperations(userId)
        const remaining = await listCommands(userId)
        await Promise.all(remaining
          .filter((command) => command.status !== 'resolved')
          .map((command) => discardCommand(userId, command.commandId)))
      }

      const sync = await refreshSyncState(userId)
      const manifest = Object.fromEntries(BACKUP_TABLES.map((table) => [
        table,
        isV8Restore(payload) ? payload.manifest.tables[table].rows : payload.tables[table].length
      ]))
      // V8 is a streaming container around the current V7 relational model,
      // but it has its own server-side capacity class.  The database maps the
      // marker back to V7 only when invoking the relational restore parser.
      const sourceVersion = isV8Restore(payload) ? 8 : (payload.metadata.source_version ?? 7)
      const begin = await supabase!.rpc('begin_restore', {
        p_expected_revision: sync.revision,
        p_source_version: sourceVersion,
        p_manifest: manifest
      })
      if (begin.error) {
        captureException(begin.error, { rpc: 'begin_restore', error_category: 'rpc', recovery_stage: 'begin_restore' })
        throw begin.error
      }
      const restoreId = String(begin.data ?? '')
      if (!restoreId) throw new Error('服务端未返回恢复任务 ID')

      const stagedPaths: string[] = []
      let committed = false
      try {
        const avatarRows: { path: string; is_active: boolean; created_at: string }[] = []
        if (isV8Restore(payload)) {
          await stageBackupV8(payload, restoreId, userId, { stagedPaths, avatarRows })
        } else {
          for (const table of BACKUP_TABLES) {
            const chunks = restoreChunks(payload.tables[table])
            for (let index = 0; index < chunks.length; index++) {
              const staged = await supabase!.rpc('stage_restore_chunk', {
                p_restore_id: restoreId,
                p_table: table,
                p_chunk_index: index,
                p_rows: chunks[index] as unknown as Json
              })
              if (staged.error) {
                captureException(staged.error, { rpc: 'stage_restore_chunk', error_category: 'rpc', recovery_stage: 'stage_restore_chunk', table, chunk_index: index })
                throw staged.error
              }
            }
          }

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
        }

        const finalized = await supabase!.rpc('finalize_restore', {
          p_restore_id: restoreId,
          p_avatar_paths: avatarRows
        })
        if (finalized.error) {
          captureException(finalized.error, { rpc: 'finalize_restore', error_category: 'rpc', recovery_stage: 'finalize_restore', restore_epoch: sync.restore_epoch })
          throw finalized.error
        }
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
