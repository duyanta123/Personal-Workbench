import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Flame,
  ListTodo,
  Sprout,
  Target,
  Wallet
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useGoals } from '../hooks/useGoals'
import { useHabitLogs, useHabits } from '../hooks/useHabits'
import { useAddLedgerEntry, useLedgerEntries } from '../hooks/useLedger'
import { useNotes } from '../hooks/useNotes'
import { useAddTodo, useTodos } from '../hooks/useTodos'
import { usePreferences } from '../hooks/usePreferences'
import { useToastStore } from '../stores/toast'
import { monthPrefix, todayStr } from '../utils/date'
import { computeStreak } from '../utils/streak'
import { calcMoM } from '../utils/ledgerStats'
import { aggregateTimeline, type TimelineEvent } from '../utils/timeline'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Segmented from '../components/ui/Segmented'
import { cn } from '../lib/cn'

const hour = new Date().getHours()
const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

const MODULES: { to: string; icon: LucideIcon; name: string; desc: string; cls: string }[] = [
  { to: '/todos', icon: ListTodo, name: '每日计划', desc: '今日待办清单', cls: 'bg-m1/10 text-m1' },
  { to: '/checkins', icon: Flame, name: '习惯打卡', desc: '坚持每一天', cls: 'bg-m2/10 text-m2' },
  { to: '/ledger', icon: Wallet, name: '记账', desc: '收支心中有数', cls: 'bg-m3/10 text-m3' },
  { to: '/goals', icon: Target, name: '长期目标', desc: '慢慢靠近', cls: 'bg-m4/10 text-m4' },
  { to: '/notes', icon: BookOpen, name: '内容记录', desc: '灵感与收藏', cls: 'bg-m5/10 text-m5' }
]

const EVENT_META: Record<TimelineEvent['type'], { icon: LucideIcon; cls: string }> = {
  todo: { icon: ListTodo, cls: 'bg-m1/10 text-m1' },
  habit: { icon: Flame, cls: 'bg-m2/10 text-m2' },
  ledger: { icon: Wallet, cls: 'bg-m3/10 text-m3' },
  note: { icon: BookOpen, cls: 'bg-m5/10 text-m5' }
}

function dayLabel(ts: string): string {
  const d = ts.slice(0, 10)
  return d === todayStr() ? '今天' : d
}

function prevMonthPrefix(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 首页快捷记录：待办 / 记账 快速录入 */
function QuickAdd() {
  const addTodo = useAddTodo()
  const addEntry = useAddLedgerEntry()
  const push = useToastStore((s) => s.push)
  const [tab, setTab] = useState<'todo' | 'ledger'>('todo')
  const [text, setText] = useState('')
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [cat, setCat] = useState('餐饮')
  const [amount, setAmount] = useState('')

  const QUICK_CATS: Record<'expense' | 'income', string[]> = {
    expense: ['餐饮', '交通', '购物', '娱乐', '其他'],
    income: ['工资', '理财', '其他']
  }

  function submitTodo(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    addTodo.mutate({ text: t, level: 'mid', due_date: null })
    push({ kind: 'success', message: `已添加「${t}」` })
    setText('')
  }

  function submitLedger(e: FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!amt || amt <= 0) return
    addEntry.mutate({ kind, category: cat, amount: amt, note: null, entry_date: todayStr() })
    push({ kind: 'success', message: `已记一笔 ¥${amt.toFixed(2)}` })
    setAmount('')
  }

  return (
    <Card padding="lg">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'todo' as const, label: '快速待办' },
          { value: 'ledger' as const, label: '快速记账' }
        ]}
      />
      {tab === 'todo' ? (
        <form onSubmit={submitTodo} className="mt-3 flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="记下马上要做的事…"
            className="flex-1"
          />
          <Button type="submit" disabled={!text.trim()}>
            添加
          </Button>
        </form>
      ) : (
        <form onSubmit={submitLedger} className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_CATS[kind].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                  cat === c ? 'bg-accent-2 text-accent' : 'bg-nested text-ink-2 hover:bg-hover hover:text-ink'
                )}
              >
                {c}
              </button>
            ))}
            <Segmented
              value={kind}
              onChange={(k) => {
                setKind(k)
                setCat(k === 'expense' ? '餐饮' : '工资')
              }}
              options={[
                { value: 'expense' as const, label: '支出' },
                { value: 'income' as const, label: '收入' }
              ]}
            />
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="金额"
              className="w-32 tabular-nums"
            />
            <Button type="submit" disabled={!amount || Number(amount) <= 0}>
              记一笔
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

export default function Dashboard() {
  const todos = useTodos()
  const habits = useHabits()
  const logs = useHabitLogs()
  const entries = useLedgerEntries()
  const goals = useGoals()
  const notes = useNotes()
  const { data: prefs } = usePreferences()

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

  const prevMonth = prevMonthPrefix()
  const prevExpense = (entries.data ?? [])
    .filter((e) => e.kind === 'expense' && e.entry_date.startsWith(prevMonth))
    .reduce((s, e) => s + e.amount, 0)
  const mom = calcMoM(monthExpense, prevExpense)

  const goalTotal = goals.data?.length ?? 0
  const goalDone = (goals.data ?? []).filter((g) => g.current >= g.target).length

  const budget = prefs?.monthly_budget ?? null

  const stats = [
    {
      label: '今日待办',
      value: totalCount ? `${doneCount}/${totalCount}` : '–',
      sub: `${doneCount} 项已完成`
    },
    {
      label: '习惯打卡',
      value: topStreak ? `${topStreak} 天` : '–',
      sub: '最长连续打卡'
    },
    {
      label: '本月支出',
      value: monthExpense ? `¥${monthExpense.toFixed(0)}` : '–',
      sub:
        mom.pct === null
          ? budget !== null
            ? `预算 ¥${budget.toFixed(0)} · 剩 ¥${(budget - monthExpense).toFixed(0)}`
            : `收入 ¥${monthIncome.toFixed(0)}`
          : `环比 ${mom.up ? '↑' : '↓'}${Math.abs(mom.pct)}%`
    },
    { label: '长期目标', value: goalTotal ? `${goalDone}/${goalTotal}` : '–', sub: '个已完成' }
  ]

  const timeline = aggregateTimeline({
    todos: todos.data ?? [],
    habits: habits.data ?? [],
    logs: logs.data ?? [],
    entries: entries.data ?? [],
    notes: notes.data ?? []
  })

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

      {/* 快捷记录 */}
      <QuickAdd />

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
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${m.cls}`}>
              <m.icon size={20} />
            </div>
            <div className="mt-3 text-sm font-medium text-ink">{m.name}</div>
            <div className="mt-0.5 text-xs text-ink-3">{m.desc}</div>
          </Link>
        ))}
      </section>

      {/* 最近动态 */}
      <Card padding="lg">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">最近动态</h2>
          <Link
            to="/notes"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
          >
            内容记录
            <ArrowRight size={14} />
          </Link>
        </div>
        {loading ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !timeline.length ? (
          <EmptyState
            icon={<Sprout size={22} />}
            title="还没有动态"
            description="完成待办、打卡、记账后，这里会自动汇总。"
          />
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {timeline.map((e) => {
              const meta = EVENT_META[e.type]
              return (
                <li key={e.key} className="flex items-center gap-3 py-2.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${meta.cls}`}>
                    <meta.icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{e.text}</div>
                    <div className="text-[11px] text-ink-3">{e.sub}</div>
                  </div>
                  <span className="shrink-0 text-xs text-ink-3 tabular-nums">{dayLabel(e.ts)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
