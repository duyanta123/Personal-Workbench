import { useNavigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
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
import { useToggleTodo } from '../hooks/useTodos'
import { donutStops } from '../utils/ledgerStats'
import type { Todo } from '../types'
import QueryError from '../components/ui/QueryError'
import { useToastStore } from '../stores/toast'
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
import { useCurrentDate, useCurrentHour } from '../hooks/useCurrentDate'
import { useDashboardSummary } from '../hooks/useWorkbenchSummary'
import { useUiStore } from '../stores/ui'
import { useAuth } from '../hooks/useAuth'
import Input from '../components/ui/Input'
import InboxCard from '../components/ui/InboxCard'
import { useInboxItems, useTodayWorkspace } from '../hooks/useTodayWorkspace'
import type { TodayWorkspace } from '../hooks/useTodayWorkspace'
import { useUpdateLedgerEntry } from '../hooks/useLedger'
import Button from '../components/ui/Button'
import { formatMinor } from '../utils/money'

/** 首页快捷记录：4 个按钮直达对应模块（页面新建表单常驻） */
const QUICK_ADD: { to: string; icon: LucideIcon; name: string; cls: string }[] = [
  { to: '/checkins', icon: Flame, name: '记打卡', cls: 'bg-m2/10 text-m2' },
  { to: '/ledger', icon: Wallet, name: '记一笔', cls: 'bg-m3/10 text-m3' },
  { to: '/notes', icon: PenLine, name: '记想法', cls: 'bg-m5/10 text-m5' },
  { to: '/workout', icon: Dumbbell, name: '记健身', cls: 'bg-m1/10 text-m1' }
]

function QuickAdd() {
  const navigate = useNavigate()
  const [source, setSource] = useState('')
  const openQuickCapture = useUiStore((state) => state.openQuickCapture)
  const { canWrite } = useAuth()
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Plus size={15} className="text-ink-3" />
        <div className="text-sm font-extrabold text-ink">快速记录</div>
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!source.trim() || !canWrite) return; openQuickCapture(source.trim()); setSource('') }}>
        <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder={canWrite ? '一句话记录，如：午饭 45' : '登录后可记录'} aria-label="智能快速记录" disabled={!canWrite} maxLength={100000} className="min-w-0 flex-1" />
        <button type="submit" disabled={!canWrite || !source.trim()} className="rounded-xl bg-accent px-3 text-xs font-semibold text-white disabled:opacity-45">解析</button>
      </form>
      <p className="mt-1.5 text-[10px] text-ink-3">本地解析 · Ctrl/Cmd + K 随时打开</p>
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
function TodoTile({ todos, total, done }: { todos: Todo[]; total: number; done: number }) {
  const navigate = useNavigate()
  const toggleTodo = useToggleTodo()
  const push = useToastStore((s) => s.push)
  const pct = total ? Math.round((done / total) * 100) : 0
  const active = todos.filter((t) => !t.done).slice(0, 5)

  async function completeTodo(id: string) {
    try {
      await toggleTodo.mutateAsync({ id, done: true })
    } catch {
      push({ kind: 'error', message: '待办更新失败，请重试' })
    }
  }

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
          {done}
          <span className="text-sm font-normal text-ink-3">/{total}</span>
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
                onClick={() => void completeTodo(t.id)}
                disabled={toggleTodo.isPending}
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

function TodayActions({ workspace, today }: { workspace: TodayWorkspace; today: string }) {
  const navigate = useNavigate(); const updateLedger = useUpdateLedgerEntry(); const push = useToastStore((state) => state.push)
  const doneHabitIds = new Set(workspace.habit_logs.filter((log) => log.state === 'done').map((log) => log.habit_id))
  const overdue = workspace.todos.filter((todo) => todo.due_date && todo.due_date < today).length
  async function confirmLedger(id: string) {
    try { await updateLedger.mutateAsync({ id, patch: { status: 'posted' } }); push({ kind: 'success', message: '周期账目已确认入账' }) }
    catch { push({ kind: 'error', message: '确认入账失败' }) }
  }
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <button onClick={() => navigate('/todos')} className="rounded-xl bg-nested p-3 text-left"><div className="text-xs text-ink-3">今日与逾期待办</div><div className="mt-1 text-lg font-bold text-ink">{workspace.todos.length} 项</div>{overdue > 0 && <span className="text-xs text-danger">{overdue} 项逾期</span>}</button>
        <button onClick={() => navigate('/checkins')} className="rounded-xl bg-nested p-3 text-left"><div className="text-xs text-ink-3">今日习惯</div><div className="mt-1 text-lg font-bold text-ink">{doneHabitIds.size}/{workspace.habits.length}</div><span className="text-xs text-ink-3">已完成</span></button>
        <div className="rounded-xl bg-nested p-3"><div className="text-xs text-ink-3">待确认周期账目</div><div className="mt-1 text-lg font-bold text-ink">{workspace.planned_ledger.length} 笔</div><button onClick={() => navigate('/ledger')} className="text-xs text-accent">查看 Upcoming</button></div>
      </div>
      {workspace.planned_ledger.length > 0 && <ul className="mt-3 divide-y divide-border">{workspace.planned_ledger.slice(0, 5).map((entry) => <li key={entry.id} className="flex items-center gap-2 py-2 text-xs"><span className="text-ink-3">{entry.entry_date}</span><span className="min-w-0 flex-1 truncate text-ink">{entry.category}</span><span className="font-semibold tabular-nums text-ink">{formatMinor(entry.amount_minor ?? Math.round(entry.amount * 100), entry.currency_code)}</span><Button size="sm" onClick={() => void confirmLedger(entry.id)} disabled={updateLedger.isPending}>确认</Button></li>)}</ul>}
    </section>
  )
}

/** 首页月度开销磁贴：本月支出 + 分类水平条 */
function MoneyTile({ expense, categories }: { expense: number; categories: [string, number][] }) {
  const navigate = useNavigate()
  const segs = donutStops(categories).slice(0, 5)
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
  const [searchParams, setSearchParams] = useSearchParams()
  // focus=inbox 展开全部；focus=<id>（搜索定位）同样启用全量列表并定位到具体项。
  const focusValue = searchParams.get('focus')
  const inboxFocus = focusValue !== null
  const inboxFocusId = focusValue && focusValue !== 'inbox' ? focusValue : null
  const today = useCurrentDate()
  const hour = useCurrentHour()
  const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'
  const month = today.slice(0, 7)
  const summary = useDashboardSummary(today, month)
  const workspace = useTodayWorkspace(today)
  const fullInbox = useInboxItems(inboxFocus)
  const data = summary.data
  const series = (data?.weekly_habits ?? []).map((point) => ({
    date: point.date,
    label: `${Number(point.date.slice(5, 7))}/${Number(point.date.slice(8, 10))}`,
    value: point.value
  }))
  const todayTodos = data?.today_todos ?? []

  if (summary.isError) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="TODAY"
          title={`今日工作台 · ${greet}`}
          description={`${today} · 今天也按自己的节奏来。`}
        />
        <QueryError onRetry={() => summary.refetch()} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 问候 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <PageHeader
          eyebrow="TODAY"
          title="今日工作台"
          description={`${today} · 今天也按自己的节奏来。`}
        />
        <div className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-surface text-m1 shadow-card md:flex">
          <Sprout size={28} />
        </div>
      </div>

      <QuickAdd />
      <InboxCard
        items={inboxFocus ? (fullInbox.data ?? workspace.data?.inbox ?? []) : (workspace.data?.inbox ?? [])}
        focusId={inboxFocusId}
      />
      {inboxFocus && (
        <button
          type="button"
          className="text-left text-xs font-medium text-accent hover:text-accent-hover"
          onClick={() => {
            const next = new URLSearchParams(searchParams)
            next.delete('focus')
            setSearchParams(next, { replace: true })
          }}
        >
          返回 Today
        </button>
      )}
      {workspace.data && <TodayActions workspace={workspace.data} today={today} />}

      {/* Section 1 · 今日节奏 */}
      <div>
        <SectionTitle zh="今日节奏" en="Today · Rhythm" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <ClockCard />
          </div>
          <div className="lg:col-span-6">
            <FocusList />
          </div>
          <div className="lg:col-span-12">
            {data?.overview && <OverviewTile date={today} overview={data.overview} />}
          </div>
        </div>
      </div>

      {/* Section 2 · 习惯与待办 */}
      <div>
        <SectionTitle zh="习惯与待办" en="Habits & Tasks" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <HabitWeekTable habits={data?.habits ?? []} logs={data?.habit_logs ?? []} />
          </div>
          <div className="lg:col-span-5">
      <TodoTile
        todos={workspace.data?.todos ?? todayTodos}
        total={data?.overview.todo_total ?? 0}
        done={data?.overview.todo_done ?? 0}
      />
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
            <WeeklyTrend series={series} unit="次" title="近 7 天打卡趋势" />
          </div>
        </div>
      </div>

      {/* Section 4 · 收支与成长 */}
      <div>
        <SectionTitle zh="收支与成长" en="Money & Growth" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MoneyTile expense={data?.overview.month_expense ?? 0} categories={data?.expense_categories ?? []} />
          {data?.fitness && <FitnessTile summary={data.fitness} />}
        </div>
      </div>
    </div>
  )
}
