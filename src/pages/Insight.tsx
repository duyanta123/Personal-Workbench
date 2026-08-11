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
import type { LucideIcon } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Progress from '../components/ui/Progress'
import Ring from '../components/ui/Ring'
import SectionTitle from '../components/ui/SectionTitle'
import Skeleton from '../components/ui/Skeleton'
import { cn } from '../lib/cn'
import QueryError from '../components/ui/QueryError'
import { useCurrentDate } from '../hooks/useCurrentDate'
import { useWorkbenchInsights } from '../hooks/useWorkbenchSummary'

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
  const today = useCurrentDate()
  const month = today.slice(0, 7)
  const insights = useWorkbenchInsights(today, month)
  const loading = insights.isLoading

  if (insights.isError) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="INSIGHT"
          title="洞察复盘"
          description="各模块进展一览 · 记录 → 执行 → 统计 → 反馈"
        />
        <QueryError onRetry={() => insights.refetch()} />
      </div>
    )
  }

  const data = insights.data

  // 待办
  const todoDone = data?.todos.done ?? 0
  const todoTotal = data?.todos.total ?? 0
  const todoPct = todoTotal ? Math.round((todoDone / todoTotal) * 100) : 0

  // 习惯
  const habitDone = data?.habits.done_today ?? 0
  const habitTotal = data?.habits.total ?? 0
  const habitPct = habitTotal ? Math.round((habitDone / habitTotal) * 100) : 0
  const topStreaks = (data?.habits.top_streaks ?? []).slice(0, 3).map((row) => ({ name: row.name, s: row.streak }))

  // 记账
  const monthIncome = data?.ledger.income ?? 0
  const monthExpense = data?.ledger.expense ?? 0

  // 长期目标
  const goalDone = data?.goals.done ?? 0
  const goalTotal = data?.goals.total ?? 0
  const goalPct = data?.goals.percent ?? 0

  // 刷题
  const acCount = data?.practice.ac_count ?? 0
  const problemTotal = data?.practice.total ?? 0
  const todaySolved = data?.practice.today_solved ?? 0

  // 健身
  const monthSessions = data?.workout.month_sessions ?? 0
  const monthMinutes = data?.workout.month_minutes ?? 0
  const partRows = (data?.workout.month_body_parts ?? []).slice(0, 3)

  // 内容记录
  const noteTotal = data?.notes.total ?? 0
  const noteTags = data?.notes.tag_count ?? 0

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
              <StatRow k="本月训练" v={`${monthSessions} 次`} />
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
              <StatRow k="标签种类" v={`${noteTags} 种`} />
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}
