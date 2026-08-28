import { cn } from '../../lib/cn'

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

/** 热力图配色：0 / 1 / 2 / 3+ 四档 */
function heatCls(count: number, future: boolean): string {
  if (future) return 'bg-nested text-ink-3/50'
  if (count === 0) return 'bg-nested text-ink-3/60'
  if (count === 1) return 'bg-m5/25 font-medium text-m5'
  if (count === 2) return 'bg-m5/45 font-medium text-m5'
  return 'bg-m5 font-semibold text-white'
}

export default function PracticeHeatmap({ year, month, monthSolved, today, grid, heatmap }: {
  year: number
  month: number
  monthSolved: number
  today: string
  grid: (string | null)[]
  heatmap: Map<string, number>
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink">{year} 年 {month} 月</span>
        <span className="text-ink-2 tabular-nums">本月 {monthSolved} 题</span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-ink-3">
        {WEEK.map((w) => (
          <span key={w} className="py-0.5">{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.map((d, i) => {
          if (!d) return <span key={i} />
          const count = heatmap.get(d) ?? 0
          const future = d > today
          return (
            <div
              key={i}
              title={`${d} · ${count} 题`}
              className={cn(
                'flex aspect-square items-center justify-center rounded-md text-[11px] tabular-nums',
                heatCls(count, future)
              )}
            >
              {Number(d.slice(8, 10))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
