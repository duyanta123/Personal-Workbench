import { describe, expect, it, vi } from 'vitest'
import { useToastStore } from './toast'

describe('useToastStore', () => {
  it('push 添加 toast 并返回 id', () => {
    useToastStore.setState({ toasts: [] })
    const id = useToastStore.getState().push({ kind: 'success', message: '已保存' })
    expect(id).toBeGreaterThan(0)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0].message).toBe('已保存')
  })

  it('dismiss 移除指定 toast', () => {
    useToastStore.setState({ toasts: [] })
    const a = useToastStore.getState().push({ kind: 'info', message: 'a' })
    const b = useToastStore.getState().push({ kind: 'info', message: 'b' })
    useToastStore.getState().dismiss(a)
    const left = useToastStore.getState().toasts
    expect(left.map((t) => t.id)).toEqual([b])
  })

  it('duration 为 0 时不会自动消失', () => {
    vi.useFakeTimers()
    try {
      useToastStore.setState({ toasts: [] })
      useToastStore.getState().push({ kind: 'info', message: '常驻', duration: 0 })
      vi.advanceTimersByTime(10_000)
      expect(useToastStore.getState().toasts).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
