import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface SideCardProps {
  title: string
  icon?: ReactNode
  children: ReactNode
  className?: string
}

/** 模块页右侧统计卡壳 */
export default function SideCard({ title, icon, children, className }: SideCardProps) {
  return (
    <div className={cn('rounded-2xl border border-border bg-surface p-4', className)}>
      <div className="mb-3 flex items-center gap-2">
        {icon && <span className="text-ink-3">{icon}</span>}
        <h3 className="text-xs font-bold text-ink">{title}</h3>
      </div>
      {children}
    </div>
  )
}
