import { useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToastStore } from '../stores/toast'

interface CacheAdapter<T extends { id: string }, C> {
  getItems: (cache: C | undefined) => T[]
  remove: (cache: C | undefined, id: string) => C | undefined
  restore: (cache: C | undefined, item: T, index: number) => C | undefined
}

interface Options<T extends { id: string }, C = T[]> {
  key: readonly unknown[]
  label: (item: T) => string
  remove: (id: string) => Promise<unknown>
  cache?: CacheAdapter<T, C>
  duration?: number
}

interface PendingDelete {
  timer: ReturnType<typeof setTimeout>
  deadline: number
  toastId: number
  cancel: () => void
}

const pendingDeletes = new Map<string, PendingDelete>()
const listeners = new Set<() => void>()
let version = 0
let ticker: ReturnType<typeof setInterval> | null = null

function emit() {
  version++
  for (const listener of listeners) listener()
  if (pendingDeletes.size > 0 && ticker === null) {
    ticker = setInterval(() => emit(), 1000)
  } else if (pendingDeletes.size === 0 && ticker !== null) {
    clearInterval(ticker)
    ticker = null
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function cancelAllPendingDeletes() {
  for (const pending of pendingDeletes.values()) {
    clearTimeout(pending.timer)
    useToastStore.getState().dismiss(pending.toastId)
  }
  pendingDeletes.clear()
  emit()
}

/**
 * Deletion with undo. The row deliberately remains in the query cache during
 * the undo window; consumers use isPending/remainingSeconds to mark and lock it.
 */
export function useDeferredDelete<T extends { id: string }, C = T[]>(opts: Options<T, C>) {
  const qc = useQueryClient()
  const push = useToastStore((state) => state.push)
  useSyncExternalStore(subscribe, () => version, () => 0)
  const duration = opts.duration ?? 5000
  const scope = JSON.stringify(opts.key)
  const cache = opts.cache ?? {
    getItems: (value: T[] | undefined) => value ?? [],
    remove: (value: T[] | undefined, id: string) => value?.filter((item) => item.id !== id),
    restore: (value: T[] | undefined) => value
  } as CacheAdapter<T, C>

  function pendingKey(id: string) {
    return `${scope}:${id}`
  }

  function requestDelete(item: T) {
    const key = pendingKey(item.id)
    if (pendingDeletes.has(key)) return
    const deadline = Date.now() + duration
    let toastId = 0
    const cancel = () => {
      const pending = pendingDeletes.get(key)
      if (!pending) return
      clearTimeout(pending.timer)
      pendingDeletes.delete(key)
      emit()
    }
    toastId = push({
      kind: 'info',
      message: `「${opts.label(item)}」将在 ${Math.ceil(duration / 1000)} 秒后删除`,
      actionLabel: '撤销',
      duration,
      onAction: cancel
    })
    const timer = setTimeout(async () => {
      try {
        await opts.remove(item.id)
        qc.setQueryData<C>(opts.key, (old) => cache.remove(old, item.id))
        await qc.invalidateQueries({ queryKey: opts.key })
      } catch {
        useToastStore.getState().dismiss(toastId)
        push({ kind: 'error', message: `删除「${opts.label(item)}」失败，请检查网络后重试` })
      } finally {
        pendingDeletes.delete(key)
        emit()
      }
    }, duration)
    pendingDeletes.set(key, { timer, deadline, toastId, cancel })
    emit()
  }

  const isPending = (id: string) => pendingDeletes.has(pendingKey(id))
  const remainingSeconds = (id: string) => {
    const pending = pendingDeletes.get(pendingKey(id))
    return pending ? Math.max(0, Math.ceil((pending.deadline - Date.now()) / 1000)) : 0
  }

  return { requestDelete, isPending, remainingSeconds }
}
