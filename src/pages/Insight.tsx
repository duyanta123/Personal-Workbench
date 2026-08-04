import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Code2,
  Dumbbell,
  Flame,
  ListTodo,
  Target,
  Wallet
} from 'lucide-react'
import { useGoals } from '../hooks/useGoals'
import { useHabitLogs, useHabits } from '../hooks/useHabits'
import { useLedgerEntries } from '../hooks/useLedger'
import { useNotes } from '../hooks/useNotes'
import { useTodos } from '../hooks/useTodos'
import { useProblems } from '../hooks/useProblems'
import { useWorkoutSessions } from '../hooks/useWorkouts'
import { monthPrefix, todayStr } from '../utils/date'
import { computeStreak } from '../utils/streak'
import type { LucideIcon } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Progress from '../components/ui/Progress'
import Ring from '../components/ui/Ring'
import SectionTitle from '../components/ui/SectionTitle'
import Skeleton from '../components/ui/Skeleton'
import { cn } from '../lib/cn'

const BODY_PART_LABEL: Record<string, string> = {
  chest: '胸',
  back: '背',
  leg: '腿',
  shoulder: '肩',
  arm: '手臂',
  core: '核心',
  cardio: '有氧',
  full: '全身'
}

interface CardHeadProps {
  to: string
  icon: LucideIcon
  cls: string
  title: string
}

function CardHead({ to, icon: Icon, cls, title }: CardHeadProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', cls)}>
        <Icon size={15} />
      </span>
      <span className="text-sm font-semibold text-ink">{title}</span>
      <Link
        to={to}
        className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
      >
        详情 <ArrowRight size={12} />
      </Link>
    </div>
  )
}

interface StatRowProps {
  k: string
  v: string
}

function StatRow({ k, v }: StatRowProps) {
  return (
    <li className="flex items-center justify-between text-xs">
      <span className="text-ink-2">{k}</span>
      <span className="font-bold text-ink tabular-nums">{v}</span>
    </li>
  )
}

export default function Insight() {
  const todos = useTodos()
  const habits = useHabits()
  const logs = useHabitLogs()
  const entries = useLedgerEntries()
  const goals = useGoals()
  const notes = useNotes()
  const problems = useProblems()
  const sessions = useWorkoutSessions()

  const loading = [todos, habits, logs, entries, goals, notes, problems, sessions].some(
    (q) => q.isLoading
  )

  const today = todayStr()
  const month = monthPrefix()

  // 待办
  const todoDone = todos.data?.filter((t) => t.done).length ?? 0
  const todoTotal = todos.data?.length ?? 0
  const todoPct = todoTotal ? Math.round((todoDone / todoTotal) * 100) : 0

  // 习惯
  const doneToday = new Set((logs.data ?? []).filter((l) => l.log_date === today).map((l) => l.habit_id))
  const byHabit = new Map<string, Set<string>>()
  for (const l of logs.data ?? []) {
    const s = byHabit.get(l.habit_id) ?? new Set<string>()
    s.add(l.log_date)
    byHabit.set(l.habit_id, s)
  }
  const habitDone = doneToday.size
  const habitTotal = habits.data?.length ?? 0
  const habitPct = habitTotal ? Math.round((habitDone / habitTotal) * 100) : 0
  const topStreaks = (habits.data ?? [])
    .map((h) => ({ name: h.name, s: computeStreak(byHabit.get(h.id) ?? new Set(), today) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)

  // 记账
  const monthIncome = (entries.data ?? [])
    .filter((e) => e.kind === 'income' && e.entry_date.startsWith(month))
    .reduce((s, e) => s + e.amount, 0)
  const monthExpense = (entries.data ?? [])
    .filter((e) => e.kind === 'expense' && e.entry_date.startsWith(month))
    .reduce((s, e) => s + e.amount, 0)

  // 长期目标
  const goalDone = (goals.data ?? []).filter((g) => g.current >= g.target).length
  const goalTotal = goals.data?.length ?? 0
  const goalPct = goalTotal
    ? Math.round(
        goals.data!.reduce((s, g) => s + Math.min(100, (g.current / g.target) * 100), 0) / goalTotal
      )
    : 0

  // 刷题
  const acCount = (problems.data ?? []).filter(
    (p) => p.status === 'ac_solo' || p.status === 'ac_hint'
  ).length
  const problemTotal = problems.data?.length ?? 0
  const todaySolved = (problems.data ?? []).filter((p) => p.solved_at === today).length

  // 健身
  const monthSessions = (sessions.data ?? []).filter((s) => s.date.startsWith(month))
  const monthMinutes = monthSessions.reduce((s, x) => s + (x.duration_min ?? 0), 0)
  const partCount = new Map<string, number>()
  for (const s of monthSessions) partCount.set(s.body_part, (partCount.get(s.body_part) ?? 0) + 1)
  const partRows = [...partCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

  // 内容记录
  const noteTotal = notes.data?.length ?? 0
  const noteTags = new Set<string>()
  for (const n of notes.data ?? []) for (const t of n.tags) noteTags.add(t)

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="INSIGHT"
        title="洞察复盘"
        description="各模块进展一览 · 记录 — 执行 — 统计 — 反馈"
      />

      <SectionTitle zh="模块概况" en="Overview" />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Card key={i} padding="md">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-16" />
              <Skeleton className="mt-3 h-2 w-full" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* 待办 */}
          <Card padding="md">
            <CardHead to="/todos" icon={ListTodo} cls="bg-m1/10 text-m1" title="每日计划" />
            <div className="mt-3 flex items-center gap-3">
              <Ring value={todoPct} size={72} color="var(--m1)">
                <span className="text-sm font-bold tabular-nums text-ink">{todoPct}%</span>
              </Ring>
              <div className="min-w-0 text-xs text-ink-2">
                <div>
                  已完成 <span className="font-bold text-ink tabular-nums">{todoDone}</span> / {todoTotal}
                </div>
                <div className="mt-1 text-ink-3">剩余 {Math.max(0, todoTotal - todoDone)} 项</div>
              </div>
            </div>
            <Progress value={todoPct} color="bg-m1" className="mt-3" />
          </Card>

          {/* 习惯 */}
          <Card padding="md">
            <CardHead to="/checkins" icon={Flame} cls="bg-m2/10 text-m2" title="习惯打卡" />
            <div className="mt-3 flex items-center gap-3">
              <Ring value={habitPct} size={72} color="var(--m2)">
                <span className="text-sm font-bold tabular-nums text-ink">
                  {habitDone}/{habitTotal}
                </span>
              </Ring>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-ink">连续天数 Top</div>
                <ul className="mt-1 space-y-0.5">
                  {topStreaks.length === 0 ? (
                    <li className="text-xs text-ink-3">暂无打卡记录</li>
                  ) : (
                    topStreaks.map((t) => (
                      <li key={t.name} className="flex items-center justify-between text-xs">
                        <span className="truncate text-ink-2">{t.name}</span>
                        <span className="shrink-0 font-bold text-m3 tabular-nums">{t.s} 天</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </Card>

          {/* 记账 */}
          <Card padding="md">
            <CardHead to="/ledger" icon={Wallet} cls="bg-m3/10 text-m3" title="记账" />
            <ul className="mt-3 space-y-2">
              <StatRow k="本月收入" v={`¥${monthIncome.toFixed(0)}`} />
              <StatRow k="本月支出" v={`¥${monthExpense.toFixed(0)}`} />
              <StatRow
                k="净结余"
                v={`¥${(monthIncome - monthExpense).toFixed(0)}`}
              />
            </ul>
          </Card>

          {/* 长期目标 */}
          <Card padding="md">
            <CardHead to="/goals" icon={Target} cls="bg-m4/10 text-m4" title="长期目标" />
            <ul className="mt-3 space-y-2">
              <StatRow k="达成" v={`${goalDone} / ${goalTotal}`} />
              <StatRow k="平均进度" v={`${goalPct}%`} />
            </ul>
            <Progress value={goalPct} color="bg-m4" className="mt-3" />
          </Card>

          {/* 刷题 */}
          <Card padding="md">
            <CardHead to="/practice" icon={Code2} cls="bg-m5/10 text-m5" title="刷题记录" />
            <ul className="mt-3 space-y-2">
              <StatRow k="总题数" v={`${problemTotal} 题`} />
              <StatRow k="已 AC" v={`${acCount} 题`} />
              <StatRow k="今日 AC" v={`${todaySolved} 题`} />
            </ul>
          </Card>

          {/* 健身 */}
          <Card padding="md">
            <CardHead to="/workout" icon={Dumbbell} cls="bg-m1/10 text-m1" title="健身记录" />
            <ul className="mt-3 space-y-2">
              <StatRow k="本月训练" v={`${monthSessions.length} 次`} />
              <StatRow k="本月时长" v={`${monthMinutes} 分钟`} />
              {partRows.length > 0 && (
                <li className="flex items-center justify-between text-xs">
                  <span className="text-ink-2">主要部位</span>
                  <span className="font-bold text-ink">
                    {partRows.map(([k, v]) => `${BODY_PART_LABEL[k] ?? k} ${v}`).join(' · ')}
                  </span>
                </li>
              )}
            </ul>
          </Card>

          {/* 内容记录 */}
          <Card padding="md">
            <CardHead to="/notes" icon={BookOpen} cls="bg-m5/10 text-m5" title="内容记录" />
            <ul className="mt-3 space-y-2">
              <StatRow k="累计记录" v={`${noteTotal} 条`} />
              <StatRow k="标签种类" v={`${noteTags.size} 种`} />
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}
