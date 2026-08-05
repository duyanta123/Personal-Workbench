import { useQueryClient } from '@tanstack/react-query'
import { useToastStore } from '../stores/toast'

interface Options<T extends { id: string }> {
  /** 缓存 queryKey，用于乐观移除/回滚 */
  key: readonly unknown[]
  /** 提示文案用：如何称呼被删项 */
  label: (item: T) => string
  /** 实际删除；返回 Promise 时在失败后自动回滚缓存并提示（页面请用 mutateAsync） */
  remove: (id: string) => void | Promise<unknown>
  /** 撤销：重新写回 */
  restore: (item: T) => void
  /** 撤销窗口毫秒数 */
  duration?: number
}

/**
 * 删除 + 撤销：点击删除立即乐观移除并调删除接口，
 * 弹 toast 提供 5 秒撤销窗口，撤销时重新插入数据（Gmail 式）。
 * 删除失败时：撤销窗口作废、恢复缓存中的该项（保留原位置）、弹出错误提示，
 * 避免「界面已删、库里还在」的数据不一致。
 */
export function useDeferredDelete<T extends { id: string }>(opts: Options<T>) {
  const qc = useQueryClient()
  const push = useToastStore((s) => s.push)
  const duration = opts.duration ?? 5000

  function requestDelete(item: T) {
    const id = item.id
    const prev = qc.getQueryData<T[]>(opts.key)
    qc.setQueryData<T[]>(opts.key, (old) => old?.filter((x) => x.id !== id))
    const toastId = push({
      kind: 'info',
      message: `已删除「${opts.label(item)}」`,
      actionLabel: '撤销',
      duration,
      onAction: () => {
        qc.setQueryData<T[]>(opts.key, (old) => (old ? [item, ...old] : [item]))
        opts.restore(item)
      }
    })
    Promise.resolve(opts.remove(id)).catch(() => {
      // 删除失败：撤销无意义（数据仍在），作废旧窗口并回滚该项到原位置
      useToastStore.getState().dismiss(toastId)
      qc.setQueryData<T[]>(opts.key, (old) => {
        const list = old ?? []
        if (list.some((x) => x.id === id)) return list
        const insertAt = Math.min(prev?.findIndex((x) => x.id === id) ?? list.length, list.length)
        return [...list.slice(0, insertAt), item, ...list.slice(insertAt)]
      })
      push({ kind: 'error', message: `删除「${opts.label(item)}」失败，请检查网络后重试` })
    })
  }

  return { requestDelete }
}
