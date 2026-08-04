import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  actionLabel?: string
  onAction?: () => void
  /** 自动消失毫秒数，0 表示常驻 */
  duration: number
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => number
  dismiss: (id: number) => void
}

let seq = 0

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq
    const duration = t.duration ?? 3500
    set((s) => ({ toasts: [...s.toasts, { ...t, id, duration }] }))
    if (duration > 0) setTimeout(() => get().dismiss(id), duration)
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
}))
