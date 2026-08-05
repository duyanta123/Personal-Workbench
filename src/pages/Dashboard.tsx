import { useNavigate } from 'react-router-dom'
import {
  Check,
  Dumbbell,
  Flame,
  ListTodo,
  PenLine,
  Plus,
  Sprout,
  Wallet
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useGoals } from '../hooks/useGoals'
import { useHabitLogs, useHabits } from '../hooks/useHabits'
import { useLedgerEntries } from '../hooks/useLedger'
import { useNotes } from '../hooks/useNotes'
import { useTodos, useToggleTodo } from '../hooks/useTodos'
import { useProblems } from '../hooks/useProblems'
import { useWorkoutExercises, useWorkoutSessions } from '../hooks/useWorkouts'
import { todayStr } from '../utils/date'
import { donutStops } from '../utils/ledgerStats'
import { habitSeries } from '../utils/weekly'
import type { LedgerEntry, Todo } from '../types'
import PageHeader from '../components/ui/PageHeader'
import Progress from '../components/ui/Progress'
import SectionTitle from '../components/ui/SectionTitle'
import ClockCard from '../components/ui/ClockCard'
import FocusList from '../components/ui/FocusList'
import HabitWeekTable from '../components/ui/HabitWeekTable'
import PomodoroCard from '../components/ui/PomodoroCard'
import WeeklyTrend from '../components/ui/WeeklyTrend'
import OverviewTile from '../components/ui/OverviewTile'
import FitnessTile from '../components/ui/FitnessTile'

const hour = new Date().getHours()
const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

/** 首页快捷记录：4 个按钮直达对应模块（页面新建表单常驻） */
const QUICK_ADD: { to: string; icon: LucideIcon; name: string; cls: string }[] = [
  { to: '/checkins', icon: Flame, name: '记打卡', cls: 'bg-m2/10 text-m2' },
  { to: '/ledger', icon: Wallet, name: '记一笔', cls: 'bg-m3/10 text-m3' },
  { to: '/notes', icon: PenLine, name: '记想法', cls: 'bg-m5/10 text-m5' },
  { to: '/workout', icon: Dumbbell, name: '记健身', cls: 'bg-m1/10 text-m1' }
]

function QuickAdd() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Plus size={15} className="text-ink-3" />
        <div className="text-sm font-extrabold text-ink">快速记录</div>
      </div>
      <div className="mt-3 grid flex-1 grid-cols-2 content-start gap-2.5">
        {QUICK_ADD.map((q) => (
          <button
            key={q.to}
            onClick={() => navigate(q.to)}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left shadow-card transition-all duration-150 hover:-translate-y-px hover:shadow-raised"
          >
            <span className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${q.cls}`}>
              <q.icon size={17} />
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white ring-2 ring-surface">
                <Plus size={9} strokeWidth={3.5} />
              </span>
            </span>
            <span className="min-w-0 truncate text-[13px] font-bold text-ink">{q.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** 首页待办磁贴：完成数 + 进度 + 前 5 条快捷勾选 */
function TodoTile({ todos }: { todos: Todo[] }) {
  const navigate = useNavigate()
  const toggleTodo = useToggleTodo()
  const doneCount = todos.filter((t) => t.done).length
  const pct = todos.length ? Math.round((doneCount / todos.length) * 100) : 0
  const active = todos.filter((t) => !t.done).slice(0, 5)

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <ListTodo size={15} className="text-ink-3" />
        <div className="text-sm font-extrabold text-ink">待办清单</div>
        <button
          onClick={() => navigate('/todos')}
          className="ml-auto text-xs font-medium text-accent transition-colors hover:text-accent-hover"
        >
          查看全部
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xl font-bold tabular-nums text-ink">
          {doneCount}
          <span className="text-sm font-normal text-ink-3">/{todos.length}</span>
        </span>
        <span className="text-[10px] text-ink-3">完成 {pct}%</span>
        <Progress value={pct} color="bg-m1" className="flex-1" />
      </div>
      {active.length === 0 ? (
        <p className="mt-4 text-center text-xs text-ink-3">今日待办已全部完成</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {active.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-2">
              <button
                onClick={() => toggleTodo.mutate({ id: t.id, done: true })}
                aria-label="完成"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink-3 text-transparent transition-colors hover:border-accent"
              >
                <Check size={13} strokeWidth={3} />
              </button>
              <button
                onClick={() => navigate('/todos')}
                className="min-w-0 flex-1 truncate text-left text-sm text-ink"
              >
                {t.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 首页月度开销磁贴：本月支出 + 分类水平条 */
function MoneyTile({ entries }: { entries: LedgerEntry[] }) {
  const navigate = useNavigate()
  const month = todayStr().slice(0, 7)
  const monthEntries = entries.filter((e) => e.entry_date.startsWith(month))
  const expense = monthEntries.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0)
  const catTotals = new Map<string, number>()
  for (const e of monthEntries) {
    if (e.kind === 'expense') catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + e.amount)
  }
  const segs = donutStops([...catTotals.entries()].sort((a, b) => b[1] - a[1])).slice(0, 5)
  const max = Math.max(1, ...segs.map((s) => s.value))

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Wallet size={15} className="text-ink-3" />
        <div className="text-sm font-extrabold text-ink">月度开销</div>
        <button
          onClick={() => navigate('/ledger')}
          className="ml-auto text-xs font-medium text-accent transition-colors hover:text-accent-hover"
        >
          明细
        </button>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-ink">¥{expense.toFixed(0)}</span>
        <span className="text-[11px] text-ink-3">本月支出</span>
      </div>
      {segs.length === 0 ? (
        <p className="mt-4 text-center text-xs text-ink-3">本月还没有支出记录</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {segs.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-xs">
              <span className="w-8 shrink-0 truncate text-ink-2">{s.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nested">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(s.value / max) * 100}%`, background: s.color }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-ink-3 tabular-nums">
                ¥{s.value.toFixed(0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Dashboard() {
  const todos = useTodos()
  const habits = useHabits()
  const logs = useHabitLogs()
  const entries = useLedgerEntries()
  const goals = useGoals()
  const notes = useNotes()
  const problems = useProblems()
  const workouts = useWorkoutSessions()
  const exercises = useWorkoutExercises()

  const series = habitSeries(logs.data ?? [])

  return (
    <div className="space-y-6">
      {/* 问候 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <PageHeader
          eyebrow="OVERVIEW"
          title={greet}
          description={`${todayStr()} · 今天也按自己的节奏来。`}
        />
        <div className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-surface text-m1 shadow-card md:flex">
          <Sprout size={28} />
        </div>
      </div>

      {/* Section 1 · 今日节奏 */}
      <div>
        <SectionTitle zh="今日节奏" en="Today · Rhythm" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <ClockCard />
          </div>
          <div className="lg:col-span-4">
            <FocusList
              todos={todos.data ?? []}
              habits={habits.data ?? []}
              logs={logs.data ?? []}
              goals={goals.data ?? []}
            />
          </div>
          <div className="lg:col-span-4">
            <QuickAdd />
          </div>
          <div className="lg:col-span-12">
            <OverviewTile
              todos={todos.data ?? []}
              habits={habits.data ?? []}
              logs={logs.data ?? []}
              goals={goals.data ?? []}
              entries={entries.data ?? []}
              notes={notes.data ?? []}
              problems={problems.data ?? []}
              workouts={workouts.data ?? []}
            />
          </div>
        </div>
      </div>

      {/* Section 2 · 习惯与待办 */}
      <div>
        <SectionTitle zh="习惯与待办" en="Habits & Tasks" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <HabitWeekTable habits={habits.data ?? []} logs={logs.data ?? []} />
          </div>
          <div className="lg:col-span-5">
            <TodoTile todos={todos.data ?? []} />
          </div>
        </div>
      </div>

      {/* Section 3 · 专注与状态 */}
      <div>
        <SectionTitle zh="专注与状态" en="Focus & Mood" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <PomodoroCard />
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5 lg:col-span-8">
            <WeeklyTrend series={series} unit="次" title="本周打卡趋势" />
          </div>
        </div>
      </div>

      {/* Section 4 · 收支与成长 */}
      <div>
        <SectionTitle zh="收支与成长" en="Money & Growth" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MoneyTile entries={entries.data ?? []} />
          <FitnessTile sessions={workouts.data ?? []} exercises={exercises.data ?? []} />
        </div>
      </div>
    </div>
  )
}
