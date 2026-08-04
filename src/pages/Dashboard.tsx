import { Link } from 'react-router-dom'
import { useGoals } from '../hooks/useGoals'
import { useHabitLogs, useHabits } from '../hooks/useHabits'
import { useLedgerEntries } from '../hooks/useLedger'
import { useNotes } from '../hooks/useNotes'
import { useTodos } from '../hooks/useTodos'
import { monthPrefix, todayStr } from '../utils/date'
import { computeStreak } from '../utils/streak'

const hour = new Date().getHours()
const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

const MODULES = [
  { to: '/todos', icon: '📋', name: '每日计划', desc: '今日待办清单', cls: 'bg-m1/15 text-m1' },
  { to: '/checkins', icon: '🔥', name: '习惯打卡', desc: '坚持每一天', cls: 'bg-m2/15 text-m2' },
  { to: '/ledger', icon: '💰', name: '记账', desc: '收支心中有数', cls: 'bg-m3/15 text-m3' },
  { to: '/goals', icon: '🎯', name: '长期目标', desc: '慢慢靠近', cls: 'bg-m4/15 text-m4' },
  { to: '/notes', icon: '📝', name: '内容记录', desc: '灵感与收藏', cls: 'bg-m5/15 text-m5' }
]

export default function Dashboard() {
  const { data: todos } = useTodos()
  const { data: habits } = useHabits()
  const { data: logs } = useHabitLogs()
  const { data: entries } = useLedgerEntries()
  const { data: goals } = useGoals()
  const { data: notes } = useNotes()

  const today = todayStr()
  const month = monthPrefix()

  const doneCount = todos?.filter((t) => t.done).length ?? 0
  const totalCount = todos?.length ?? 0

  const byHabit = new Map<string, Set<string>>()
  for (const l of logs ?? []) {
    const s = byHabit.get(l.habit_id) ?? new Set<string>()
    s.add(l.log_date)
    byHabit.set(l.habit_id, s)
  }
  const topStreak = Math.max(0, ...(habits ?? []).map((h) => computeStreak(byHabit.get(h.id) ?? new Set(), today)))

  const monthExpense = (entries ?? [])
    .filter((e) => e.kind === 'expense' && e.entry_date.startsWith(month))
    .reduce((s, e) => s + e.amount, 0)
  const monthIncome = (entries ?? [])
    .filter((e) => e.kind === 'income' && e.entry_date.startsWith(month))
    .reduce((s, e) => s + e.amount, 0)

  const goalTotal = goals?.length ?? 0
  const goalDone = (goals ?? []).filter((g) => g.current >= g.target).length

  const stats = [
    { label: '今日待办', value: totalCount ? `${doneCount}/${totalCount}` : '–', sub: `${doneCount} 项已完成` },
    { label: '习惯打卡', value: topStreak ? `${topStreak} 天` : '–', sub: '最长连续打卡' },
    { label: '本月支出', value: monthExpense ? `¥${monthExpense.toFixed(0)}` : '–', sub: `收入 ¥${monthIncome.toFixed(0)}` },
    { label: '长期目标', value: goalTotal ? `${goalDone}/${goalTotal}` : '–', sub: '个已完成' }
  ]

  return (
    <div className="space-y-6">
      {/* 问候卡 */}
      <section className="flex flex-col gap-6 rounded-2xl bg-card p-6 shadow-card md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs text-ink-3">{today}</p>
          <h1 className="mt-1 text-2xl font-semibold">{greet}</h1>
          <p className="mt-1 text-sm text-ink-2">今天也按自己的节奏来。</p>
        </div>
        <div className="text-5xl">🌱</div>
      </section>

      {/* 统计 */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-card p-4 shadow-card">
            <div className="text-xs text-ink-3">{s.label}</div>
            <div className="mt-1 text-xl font-semibold">{s.value}</div>
            <div className="mt-0.5 text-xs text-ink-3">{s.sub}</div>
          </div>
        ))}
      </section>

      {/* 模块入口 */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {MODULES.map((m) => (
          <Link
            key={m.to}
            to={m.to}
            className="rounded-2xl bg-card p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-overlay"
          >
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-xl ${m.cls}`}>
              {m.icon}
            </div>
            <div className="mt-3 text-sm font-medium">{m.name}</div>
            <div className="mt-0.5 text-xs text-ink-3">{m.desc}</div>
          </Link>
        ))}
      </section>

      {/* 最近笔记 */}
      <section className="rounded-2xl bg-card p-6 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">最近记录</h2>
          <Link to="/notes" className="text-xs text-ink-3 hover:text-accent">
            全部 →
          </Link>
        </div>
        {!notes?.length ? (
          <p className="mt-4 text-sm text-ink-3">还没有内容记录，去「内容记录」写点什么吧。</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink/5">
            {notes.slice(0, 4).map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{n.title || '无标题'}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-ink-2">{n.body}</div>
                </div>
                <span className="shrink-0 text-xs text-ink-3">{n.updated_at.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
