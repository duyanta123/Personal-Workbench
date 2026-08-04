import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'flat' | 'raised' | 'interactive'
type Padding = 'none' | 'sm' | 'md' | 'lg'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
  padding?: Padding
}

const VARIANTS: Record<Variant, string> = {
  flat: 'border-border bg-surface',
  raised: 'border-border bg-surface shadow-card',
  interactive:
    'border-border bg-surface cursor-pointer transition-all duration-150 hover:shadow-raised'
}

const PADDINGS: Record<Padding, string> = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6'
}

export default function Card({
  variant = 'flat',
  padding = 'md',
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border',
        VARIANTS[variant],
        PADDINGS[padding],
        className
      )}
      {...props}
    />
  )
}
