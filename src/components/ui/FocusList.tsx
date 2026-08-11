import { useNavigate } from 'react-router-dom'
import { Check, Star } from 'lucide-react'
import { useToggleTodo } from '../../hooks/useTodos'
import { useToggleHabitLog } from '../../hooks/useHabits'
import { useIncrementGoal } from '../../hooks/useGoals'
import { cn } from '../../lib/cn'
import { useToastStore } from '../../stores/toast'
import { useFocusItems } from '../../hooks/useFocusItems'
import { useCurrentDate } from '../../hooks/useCurrentDate'

/** 今日聚焦：聚合各模块置顶项，支持行内快速操作 */
export default function FocusList() {
  const navigate = useNavigate()
  const today = useCurrentDate()
  const { data } = useFocusItems(today)
  const toggleTodo = useToggleTodo()
  const toggleHabit = useToggleHabitLog()
  const incGoal = useIncrementGoal()
  const push = useToastStore((s) => s.push)

  async function toggleTodoSafe(id: string, done: boolean) {
    try {
      await toggleTodo.mutateAsync({ id, done })
    } catch {
      push({ kind: 'error', message: '待办更新失败，请重试' })
    }
  }

  async function toggleHabitSafe(id: string, done: boolean) {
    try {
      await toggleHabit.mutateAsync({ habitId: id, date: today, done })
    } catch {
      push({ kind: 'error', message: '习惯打卡失败，请重试' })
    }
  }

  async function incrementGoalSafe(id: string) {
    try {
      await incGoal.mutateAsync(id)
    } catch {
      push({ kind: 'error', message: '目标进度更新失败，请重试' })
    }
  }

  const pinnedTodos = data?.todos ?? []
  const pinnedHabits = data?.habits ?? []
  const pinnedGoals = data?.goals ?? []
  const total = pinnedTodos.length + pinnedHabits.length + pinnedGoals.length

  if (total === 0) {
    return (
      <div className="flex min-h-44 flex-col rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Star size={14} className="text-ink-3" />
          <h3 className="text-xs font-bold text-ink">今日聚焦</h3>
        </div>
        <p className="mt-auto text-xs leading-relaxed text-ink-3">
          在任意模块点击星标，即可把要事置顶到这里，快速跟进。
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-44 flex-col rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Star size={14} className="text-ink-3" />
        <h3 className="text-xs font-bold text-ink">今日聚焦</h3>
        <span className="ml-auto text-xs text-ink-3 tabular-nums">{total} 项</span>
      </div>
      <ul className="mt-3 space-y-2.5">
        {pinnedTodos.map((t) => (
          <li key={`t-${t.id}`} className="flex items-center gap-2.5">
            <button
              onClick={() => void toggleTodoSafe(t.id, !t.done)}
              disabled={toggleTodo.isPending}
              aria-label={t.done ? '恢复未完成' : '切换完成'}
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150',
                t.done
                  ? 'border-m1 bg-m1 text-white'
                  : 'border-ink-3 text-transparent hover:border-accent'
              )}
            >
              <Check size={13} strokeWidth={3} />
            </button>
            <button
              onClick={() => navigate('/todos')}
              className={cn(
                'min-w-0 flex-1 truncate text-left text-sm',
                t.done ? 'text-ink-3 line-through' : 'text-ink'
              )}
            >
              {t.text}
            </button>
          </li>
        ))}
        {pinnedHabits.map((h) => {
          const on = h.done_today
          return (
            <li key={`h-${h.id}`} className="flex items-center gap-2.5">
              <button
                onClick={() => void toggleHabitSafe(h.id, !on)}
                disabled={toggleHabit.isPendingFor(h.id, today)}
                aria-label={on ? '取消今日打卡' : '今日打卡'}
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150',
                  on
                    ? 'border-m2 bg-m2 text-white'
                    : 'border-ink-3 text-transparent hover:border-accent'
                )}
              >
                <Check size={13} strokeWidth={3} />
              </button>
              <button
                onClick={() => navigate('/checkins')}
                className="min-w-0 flex-1 truncate text-left text-sm text-ink"
              >
                {h.name}
              </button>
              <span className={cn('shrink-0 text-[10px]', on ? 'text-m2' : 'text-ink-3')}>
                {on ? '已打卡' : '待打卡'}
              </span>
            </li>
          )
        })}
        {pinnedGoals.map((g) => {
          return (
            <li key={`g-${g.id}`} className="flex items-center gap-2.5">
              <span className="w-5 shrink-0 text-center text-sm">{g.emoji}</span>
              <button
                onClick={() => navigate('/goals')}
                className="min-w-0 flex-1 truncate text-left text-sm text-ink"
              >
                {g.name}
              </button>
              <span className="shrink-0 text-[10px] text-ink-3 tabular-nums">
                {g.current}/{g.target}
              </span>
              <button
                onClick={() => void incrementGoalSafe(g.id)}
                disabled={g.current >= g.target || incGoal.isPending}
                aria-label="进度 +1"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-sm text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
