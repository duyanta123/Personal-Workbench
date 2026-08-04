import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0-100 */
  value: number
  color?: string
}

export default function Progress({
  value,
  color = 'bg-m2',
  className,
  ...props
}: ProgressProps) {
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-nested', className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all duration-300',
          color
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
