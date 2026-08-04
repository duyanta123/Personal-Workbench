import { cn } from '../../lib/cn'

interface SectionTitleProps {
  zh: string
  en?: string
  className?: string
}

/** 首页分区标题：竖条 + 中文 + 英文小字 + 横线 */
export default function SectionTitle({ zh, en, className }: SectionTitleProps) {
  return (
    <div className={cn('mb-3 mt-8 flex items-center gap-3', className)}>
      <span className="h-4 w-1 shrink-0 rounded-full bg-accent" />
      <span className="text-base font-bold tracking-wide text-ink">{zh}</span>
      {en && (
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-3">
          {en}
        </span>
      )}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
