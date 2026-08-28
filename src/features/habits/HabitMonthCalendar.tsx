import { cn } from '../../lib/cn'

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

/** 过去 7 天内可补卡 */
function canBackfill(d: string, today: string): boolean {
  return d < today && today <= addDays(d, 7)
}

function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00`)
  t.setDate(t.getDate() + n)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export default function HabitMonthCalendar({
  grid, today, logged, deletePending, logPending, onRecord, onBackfill
}: {
  grid: (string | null)[]
  today: string
  logged: Set<string>
  deletePending: boolean
  logPending: (date: string) => boolean
  onRecord: () => void
  onBackfill: (date: string) => void
}) {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-ink-3">
        {WEEK.map((w) => (
          <span key={w} className="py-0.5">{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.map((d, i) => {
          if (!d) return <span key={i} />
          const isToday = d === today
          const isLogged = logged.has(d)
          const past = d < today
          const fillable = past && canBackfill(d, today) && !isLogged
          const future = d > today
          return (
            <button
              key={i}
              type="button"
              disabled={deletePending || logPending(d) || (!isLogged && !fillable && !isToday)}
              onClick={() => {
                if (isToday) onRecord()
                else if (fillable) onBackfill(d)
              }}
              title={
                isToday ? '今天' : isLogged ? '已打卡' : fillable ? '可补卡' : undefined
              }
              className={cn(
                'flex aspect-square items-center justify-center rounded-md text-[11px] tabular-nums transition-colors',
                isLogged
                  ? 'bg-m1/15 font-medium text-m1'
                  : fillable
                    ? 'bg-nested text-ink-2 hover:bg-m1/20 hover:text-m1'
                    : future
                      ? 'text-ink-3/50'
                      : isToday
                        ? 'bg-accent-2 font-medium text-accent ring-1 ring-accent'
                        : 'text-ink-3/60'
              )}
            >
              {Number(d.slice(8, 10))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
