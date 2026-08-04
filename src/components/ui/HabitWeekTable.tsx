import { Check, Flame } from 'lucide-react'
import type { Habit, HabitLog } from '../../types'
import { useToggleHabitLogDate } from '../../hooks/useHabits'
import { weekDates } from '../../utils/weekly'
import { todayStr } from '../../utils/date'
import { cn } from '../../lib/cn'

const WEEK_CN = ['一', '二', '三', '四', '五', '六', '日']
const DOT_BG = ['bg-m1', 'bg-m2', 'bg-m3', 'bg-m4', 'bg-m5']
const TX = ['text-m1', 'text-m2', 'text-m3', 'text-m4', 'text-m5']

interface HabitWeekTableProps {
  habits: Habit[]
  logs: HabitLog[]
}

/** 本周习惯追踪表：周一~周日 + 完成率，点击格子打卡/取消 */
export default function HabitWeekTable({ habits, logs }: HabitWeekTableProps) {
  const toggle = useToggleHabitLogDate()
  const days = weekDates()
  const today = todayStr()
  const tIdx = days.indexOf(today)
  const weekEndLabel = `周${WEEK_CN[(new Date().getDay() + 6) % 7]}`

  const byHabit = new Map<string, Set<string>>()
  for (const l of logs) {
    const s = byHabit.get(l.habit_id) ?? new Set<string>()
    s.add(l.log_date)
    byHabit.set(l.habit_id, s)
  }

  if (habits.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Flame size={14} className="text-ink-3" />
          <h3 className="text-xs font-bold text-ink">本周习惯追踪</h3>
          <span className="ml-auto text-xs text-ink-3">{weekEndLabel}</span>
        </div>
        <p className="mt-6 text-center text-xs text-ink-3">还没有习惯，去「习惯打卡」添加吧</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <Flame size={14} className="text-ink-3" />
        <h3 className="text-xs font-bold text-ink">本周习惯追踪</h3>
        <span className="ml-auto text-xs text-ink-3">本周 · {weekEndLabel}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-center">
          <thead>
            <tr>
              <th className="pb-2 pr-2 text-left text-[10px] font-semibold text-ink-3">习惯</th>
              {days.map((d, i) => (
                <th
                  key={d}
                  className={cn(
                    'pb-2 text-[10px] font-semibold',
                    i === tIdx ? 'text-accent' : 'text-ink-3'
                  )}
                >
                  {WEEK_CN[i]}
                </th>
              ))}
              <th className="pb-2 pl-2 text-right text-[10px] font-semibold text-ink-3">完成率</th>
            </tr>
          </thead>
          <tbody>
            {habits.map((h, ri) => {
              const logged = byHabit.get(h.id) ?? new Set<string>()
              let cnt = 0
              return (
                <tr key={h.id}>
                  <td className="max-w-28 truncate py-1 pr-2 text-left text-xs font-medium text-ink">
                    <span
                      className={cn(
                        'mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle',
                        DOT_BG[ri % DOT_BG.length]
                      )}
                    />
                    {h.name}
                  </td>
                  {days.map((d, i) => {
                    const on = logged.has(d)
                    if (on) cnt++
                    const future = d > today
                    return (
                      <td key={d} className={cn('py-1', i === tIdx && 'rounded-lg bg-accent-2/50')}>
                        <button
                          type="button"
                          disabled={future}
                          onClick={() => toggle.mutate({ habitId: h.id, date: d })}
                          aria-label={`${h.name} 周${WEEK_CN[i]}打卡`}
                          className={cn(
                            'mx-auto flex h-6 w-6 items-center justify-center rounded-lg transition-colors duration-150',
                            on
                              ? 'bg-m2 text-white'
                              : future
                                ? 'cursor-not-allowed bg-nested text-transparent opacity-40'
                                : 'bg-nested text-transparent hover:bg-hover hover:text-ink-3'
                          )}
                        >
                          <Check size={13} strokeWidth={3} />
                        </button>
                      </td>
                    )
                  })}
                  <td
                    className={cn(
                      'py-1 pl-2 text-right text-xs font-bold tabular-nums',
                      TX[ri % TX.length]
                    )}
                  >
                    {Math.round((cnt / 7) * 100)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
