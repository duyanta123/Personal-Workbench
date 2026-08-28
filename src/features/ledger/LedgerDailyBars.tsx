import { useMemo } from 'react'
import type { CurrencyCode } from '../../types'
import { cn } from '../../lib/cn'
import { formatMinor } from '../../utils/money'

export default function LedgerDailyBars({
  daily, month, currentDate, currency
}: {
  daily: { date: string; totalMinor: number }[] | undefined
  month: string
  currentDate: string
  currency: CurrencyCode
}) {
  const [year, monthNum] = month.split('-').map(Number)
  const bars = useMemo(() => {
    const totals = new Map((daily ?? []).map((row) => [row.date, row.totalMinor]))
    const days = new Date(year, monthNum, 0).getDate()
    return Array.from({ length: days }, (_, index) => {
      const day = index + 1
      const date = `${month}-${String(day).padStart(2, '0')}`
      return { day, date, total: totals.get(date) ?? 0 }
    })
  }, [daily, year, monthNum, month])
  const maxBar = Math.max(1, ...bars.map((b) => b.total))

  if (!bars.some((b) => b.total > 0)) return null

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">本月每日支出</h2>
      <div className="mt-4 flex h-28 items-end gap-[3px]">
        {bars.map((b) => {
          const isToday = b.date === currentDate
          const h = b.total ? Math.max(8, (b.total / maxBar) * 100) : 2
          return (
            <div key={b.day} className="group relative flex h-full flex-1 items-end justify-center">
              <div
                className={cn(
                  'w-full rounded-t-sm transition-all duration-200',
                  isToday ? 'bg-accent' : b.total ? 'bg-m3/70 hover:bg-m3' : 'bg-nested'
                )}
                style={{ height: `${h}%` }}
                title={`${b.day} 日 ${formatMinor(b.total, currency)}`}
              />
              {b.day % 5 === 1 && (
                <span className="absolute -bottom-4 text-[9px] text-ink-3 tabular-nums">{b.day}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
