import { useQueryClient } from '@tanstack/react-query'
import { useToastStore } from '../stores/toast'

interface Options<T extends { id: string }> {
  /** 缓存 queryKey，用于乐观移除/回滚 */
  key: readonly unknown[]
  /** 提示文案用：如何称呼被删项 */
  label: (item: T) => string
  /** 实际删除 */
  remove: (id: string) => void
  /** 撤销：重新写回 */
  restore: (item: T) => void
  /** 撤销窗口毫秒数 */
  duration?: number
}

/**
 * 删除 + 撤销：点击删除立即乐观移除并调删除接口，
 * 弹 toast 提供 5 秒撤销窗口，撤销时重新插入数据（Gmail 式）。
 */
export function useDeferredDelete<T extends { id: string }>(opts: Options<T>) {
  const qc = useQueryClient()
  const push = useToastStore((s) => s.push)
  const duration = opts.duration ?? 5000

  function requestDelete(item: T) {
    const id = item.id
    qc.setQueryData<T[]>(opts.key, (old) => old?.filter((x) => x.id !== id))
    opts.remove(id)
    push({
      kind: 'info',
      message: `已删除「${opts.label(item)}」`,
      actionLabel: '撤销',
      duration,
      onAction: () => {
        qc.setQueryData<T[]>(opts.key, (old) => (old ? [item, ...old] : [item]))
        opts.restore(item)
      }
    })
  }

  return { requestDelete }
}
