import { AlertCircle, CheckCircle2, Info, Undo2, X } from 'lucide-react'
import { useToastStore } from '../../stores/toast'
import type { ToastKind } from '../../stores/toast'

const KIND_ICON: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info
}

const KIND_COLOR: Record<ToastKind, string> = {
  success: 'text-m1',
  error: 'text-danger',
  info: 'text-m2'
}

/** 全局操作反馈容器：挂在 Layout 根部，移动端浮于底栏之上 */
export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => {
        const Icon = KIND_ICON[t.kind]
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            aria-live={t.kind === 'error' ? 'assertive' : 'polite'}
            className="pointer-events-auto flex w-full max-w-sm animate-[toast-in_0.2s_ease-out] items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 shadow-overlay"
          >
            <Icon size={18} className={`shrink-0 ${KIND_COLOR[t.kind]}`} />
            <p className="min-w-0 flex-1 text-sm text-ink">{t.message}</p>
            {t.actionLabel && t.onAction && (
              <button
                onClick={() => {
                  t.onAction?.()
                  dismiss(t.id)
                }}
                className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent transition-colors hover:text-accent-hover"
              >
                <Undo2 size={14} />
                {t.actionLabel}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              aria-label="关闭提示"
              className="shrink-0 rounded-md p-0.5 text-ink-3 transition-colors hover:text-ink"
            >
              <X size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
