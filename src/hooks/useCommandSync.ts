import { useCallback, useEffect, useRef, useState } from 'react'
import { flushCommands, getSyncMetadata, listCommands, resolveCommand, discardCommand } from '../lib/commands'
import type { SyncMetadata, WorkbenchCommandV2 } from '../lib/commands'
import { queryClient } from '../lib/queryClient'
import { replayPendingCommands } from '../lib/domainCommands'
import { useAuth } from './useAuth'

export function useCommandSync() {
  const { userId } = useAuth()
  const [commands, setCommands] = useState<WorkbenchCommandV2[]>([])
  const commandsRef = useRef<WorkbenchCommandV2[]>([])
  const [metadata, setMetadata] = useState<SyncMetadata>({ lastAttemptAt: null, lastSuccessAt: null })
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    if (!userId) return
    const [rows, meta] = await Promise.all([listCommands(userId, true), getSyncMetadata(userId)])
    replayPendingCommands(queryClient, rows)
    commandsRef.current = rows
    setCommands(rows)
    if (meta) setMetadata(meta)
  }, [userId])

  const sync = useCallback(async () => {
    if (!userId) return
    setSyncing(true)
    try { await flushCommands(userId) } finally { setSyncing(false); await refresh() }
  }, [refresh, userId])

  useEffect(() => {
    if (!userId) return
    void refresh()
    void sync()
    const changed = () => void refresh()
    const online = () => void sync()
    const focus = () => void sync()
    window.addEventListener('workbench:commands-changed', changed)
    window.addEventListener('online', online)
    window.addEventListener('focus', focus)
    return () => {
      window.removeEventListener('workbench:commands-changed', changed)
      window.removeEventListener('online', online)
      window.removeEventListener('focus', focus)
    }
  }, [refresh, sync, userId])

  // Queries can finish after the initial sync refresh. Re-apply the local
  // projection whenever React Query receives server data; the projection
  // helpers are reference-stable once the patch is already present.
  // 防重入：subscribe 回调由 setQueryData 同步触发，重放本身又可能写缓存，
  // 嵌套回调必须直接返回，否则形成同步无限递归（栈溢出）。
  useEffect(() => {
    if (!userId) return
    let replaying = false
    return queryClient.getQueryCache().subscribe(() => {
      if (replaying || commandsRef.current.length === 0) return
      replaying = true
      try {
        replayPendingCommands(queryClient, commandsRef.current)
      } finally {
        replaying = false
      }
    })
  }, [userId])

  return {
    commands,
    metadata,
    syncing,
    sync,
    resolve: async (commandId: string, resolution: 'keep_remote' | 'reapply') => {
      if (!userId) return
      await resolveCommand(userId, commandId, resolution)
      await refresh()
    },
    discard: async (commandId: string) => {
      if (!userId) return
      await discardCommand(userId, commandId)
      await refresh()
    }
  }
}
