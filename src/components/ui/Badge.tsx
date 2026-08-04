import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'success' | 'warning' | 'danger' | 'neutral' | 'accent'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
}

const VARIANTS: Record<Variant, string> = {
  success: 'bg-m1/10 text-m1',
  warning: 'bg-m3/10 text-m3',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-nested text-ink-2',
  accent: 'bg-accent-2 text-accent'
}

export default function Badge({
  variant = 'neutral',
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  )
}
