import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Flame, ListTodo, Sprout, Target, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useGoals } from '../hooks/useGoals'
import { useHabitLogs, useHabits } from '../hooks/useHabits'
import { useLedgerEntries } from '../hooks/useLedger'
import { useNotes } from '../hooks/useNotes'
import { useTodos } from '../hooks/useTodos'
import { monthPrefix, todayStr } from '../utils/date'
import { computeStreak } from '../utils/streak'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'

const hour = new Date().getHours()
const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

const MODULES: { to: string; icon: LucideIcon; name: string; desc: string; cls: string }[] = [
  { to: '/todos', icon: ListTodo, name: '每日计划', desc: '今日待办清单', cls: 'bg-m1/10 text-m1' },
  { to: '/checkins', icon: Flame, name: '习惯打卡', desc: '坚持每一天', cls: 'bg-m2/10 text-m2' },
  { to: '/ledger', icon: Wallet, name: '记账', desc: '收支心中有数', cls: 'bg-m3/10 text-m3' },
  { to: '/goals', icon: Target, name: '长期目标', desc: '慢慢靠近', cls: 'bg-m4/10 text-m4' },
  { to: '/notes', icon: BookOpen, name: '内容记录', desc: '灵感与收藏', cls: 'bg-m5/10 text-m5' }
]

export default function Dashboard() {
  const todos = useTodos()
  const habits = useHabits()
  const logs = useHabitLogs()
  const entries = useLedgerEntries()
  const goals = useGoals()
  const notes = useNotes()

  const loading = [todos, habits, logs, entries, goals, notes].some((q) => q.isLoading)

  const today = todayStr()
  const month = monthPrefix()

  const doneCount = todos.data?.filter((t) => t.done).length ?? 0
  const totalCount = todos.data?.length ?? 0

  const byHabit = new Map<string, Set<string>>()
  for (const l of logs.data ?? []) {
    const s = byHabit.get(l.habit_id) ?? new Set<string>()
    s.add(l.log_date)
    byHabit.set(l.habit_id, s)
  }
  const topStreak = Math.max(
    0,
    ...(habits.data ?? []).map((h) => computeStreak(byHabit.get(h.id) ?? new Set(), today))
  )

  const monthExpense = (entries.data ?? [])
    .filter((e) => e.kind === 'expense' && e.entry_date.startsWith(month))
    .reduce((s, e) => s + e.amount, 0)
  const monthIncome = (entries.data ?? [])
    .filter((e) => e.kind === 'income' && e.entry_date.startsWith(month))
    .reduce((s, e) => s + e.amount, 0)

  const goalTotal = goals.data?.length ?? 0
  const goalDone = (goals.data ?? []).filter((g) => g.current >= g.target).length

  const stats = [
    { label: '今日待办', value: totalCount ? `${doneCount}/${totalCount}` : '–', sub: `${doneCount} 项已完成` },
    { label: '习惯打卡', value: topStreak ? `${topStreak} 天` : '–', sub: '最长连续打卡' },
    { label: '本月支出', value: monthExpense ? `¥${monthExpense.toFixed(0)}` : '–', sub: `收入 ¥${monthIncome.toFixed(0)}` },
    { label: '长期目标', value: goalTotal ? `${goalDone}/${goalTotal}` : '–', sub: '个已完成' }
  ]

  return (
    <div className="space-y-6">
      {/* 问候 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <PageHeader
          eyebrow="OVERVIEW"
          title={greet}
          description={`${today} · 今天也按自己的节奏来。`}
        />
        <div className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-surface text-m1 shadow-card md:flex">
          <Sprout size={28} />
        </div>
      </div>

      {/* 统计 */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} padding="md">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-6 w-20" />
              <Skeleton className="mt-1 h-3 w-24" />
            </Card>
          ))}
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} variant="raised" padding="md">
              <div className="text-xs text-ink-3">{s.label}</div>
              <div className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums">
                {s.value}
              </div>
              <div className="mt-0.5 text-xs text-ink-3">{s.sub}</div>
            </Card>
          ))}
        </section>
      )}

      {/* 模块入口 */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {MODULES.map((m) => (
          <Link
            key={m.to}
            to={m.to}
            className="group rounded-2xl border border-border bg-surface p-4 transition-all duration-150 hover:shadow-raised"
          >
            <div
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${m.cls}`}
            >
              <m.icon size={20} />
            </div>
            <div className="mt-3 text-sm font-medium text-ink">{m.name}</div>
            <div className="mt-0.5 text-xs text-ink-3">{m.desc}</div>
          </Link>
        ))}
      </section>

      {/* 最近记录 */}
      <Card padding="lg">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">最近记录</h2>
          <Link
            to="/notes"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
          >
            全部
            <ArrowRight size={14} />
          </Link>
        </div>
        {loading ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !notes.data?.length ? (
          <EmptyState
            icon={<BookOpen size={22} />}
            title="还没有内容记录"
            description="去「内容记录」写点什么吧。"
          />
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {notes.data.slice(0, 4).map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">
                    {n.title || '无标题'}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-ink-2">{n.body}</div>
                </div>
                <span className="shrink-0 text-xs text-ink-3 tabular-nums">
                  {n.updated_at.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
