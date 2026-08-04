import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  children?: ReactNode
}

export default function EmptyState({
  icon,
  title,
  description,
  children
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-nested text-ink-3">
          {icon}
        </div>
      )}
      <div className="mt-4 text-sm font-medium text-ink">{title}</div>
      {description && <div className="mt-1 text-xs text-ink-3">{description}</div>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
