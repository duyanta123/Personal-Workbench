import { useEffect } from 'react'
import { flushOutbox } from '../lib/outbox'
import { refreshSyncState } from '../lib/syncCore'
import { useToastStore } from '../stores/toast'
import { useAuth } from './useAuth'

export function useOutboxSync() {
  const { userId, canWrite } = useAuth()
  const push = useToastStore((state) => state.push)

  useEffect(() => {
    if (!userId || !canWrite) return
    let active = true
    const sync = async () => {
      try {
        await refreshSyncState(userId)
        const result = await flushOutbox(userId)
        if (!active) return
        if (result.applied > 0) push({ kind: 'success', message: `已同步 ${result.applied} 条离线操作` })
        if (result.stale > 0) push({ kind: 'info', message: `${result.stale} 条恢复前操作已失效` })
      } catch {
        // Connectivity feedback is already represented by the global offline banner.
      }
    }
    void sync()
    const onOnline = () => void sync()
    const onFocus = () => void sync()
    const onError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail
      if (message) push({ kind: 'error', message: `待同步操作失败：${message}` })
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onFocus)
    window.addEventListener('workbench:outbox-error', onError)
    return () => {
      active = false
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('workbench:outbox-error', onError)
    }
  }, [userId, canWrite, push])
}
