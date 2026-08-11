import { useNavigate } from 'react-router-dom'
import { Dumbbell, Flame, ListTodo, Target, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DashboardOverview } from '../../hooks/useWorkbenchSummary'

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

/** 每周训练目标次数（固定 3 次，与「健身进度」保持一致） */
const WEEK_WORKOUT_TARGET = 3

interface OverviewTileProps {
  date: string
  overview: DashboardOverview
}

interface StatItem {
  to: string
  icon: LucideIcon
  cls: string
  value: string
  label: string
  sub: string
}

/** 今日速览：4 个数字入口 + 右侧深色结余卡，点击直达对应模块 */
export default function OverviewTile({
  date,
  overview
}: OverviewTileProps) {
  const navigate = useNavigate()
  const now = new Date(`${date}T12:00:00`)
  const dateLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 周${WEEK_CN[now.getDay()]}`

  // 速览数字
  const doneCount = overview.todo_done
  const todoPct = overview.todo_total ? Math.round((doneCount / overview.todo_total) * 100) : 0
  const habitPct = overview.habit_total ? Math.round((overview.habit_done / overview.habit_total) * 100) : 0
  const goalPct = Math.round(overview.goal_percent)
  const weekWorkouts = overview.week_workouts
  const workoutPct = Math.min(100, Math.round((weekWorkouts / WEEK_WORKOUT_TARGET) * 100))

  const stats: StatItem[] = [
    {
      to: '/todos',
      icon: ListTodo,
      cls: 'bg-m1/10 text-m1',
      value: `${doneCount}/${overview.todo_total}`,
      label: '今日待办',
      sub: overview.todo_total ? `完成 ${todoPct}%` : '暂无待办'
    },
    {
      to: '/checkins',
      icon: Flame,
      cls: 'bg-m2/10 text-m2',
      value: `${overview.habit_done}/${overview.habit_total}`,
      label: '今日打卡',
      sub: overview.habit_total ? `完成 ${habitPct}%` : '暂无习惯'
    },
    {
      to: '/goals',
      icon: Target,
      cls: 'bg-m4/10 text-m4',
      value: `${goalPct}%`,
      label: '目标进度',
      sub: `${overview.goal_total} 项目标`
    },
    {
      to: '/workout',
      icon: Dumbbell,
      cls: 'bg-m3/10 text-m3',
      value: `${weekWorkouts}/${WEEK_WORKOUT_TARGET}`,
      label: '本周健身',
      sub: workoutPct >= 100 ? '已达标' : `完成 ${workoutPct}%`
    }
  ]

  // 深色侧栏统计
  const totalRecords = overview.total_records
  const pinnedCount = overview.pinned_total
  const monthIncome = overview.month_income
  const monthExpense = overview.month_expense
  const balance = Math.round(monthIncome - monthExpense)
  const balanceColor = balance >= 0 ? 'var(--m1)' : 'var(--danger)'

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5">
      {/* 卡头 */}
      <div className="mb-3 flex items-center gap-2">
        <Target size={15} className="text-ink-3" />
        <h2 className="text-sm font-extrabold text-ink">今日速览</h2>
        <span className="ml-auto text-xs text-ink-2">{dateLabel}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* 数字入口区 */}
        <div className="grid grid-cols-2 content-start gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <button
              key={s.label}
              onClick={() => navigate(s.to)}
              className="flex flex-col items-start gap-1.5 rounded-2xl p-3 text-left transition-colors duration-150 hover:bg-nested"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.cls}`}>
                <s.icon size={18} />
              </span>
              <span className="mt-1 text-2xl font-extrabold leading-none tracking-tight text-ink tabular-nums">
                {s.value}
              </span>
              <span className="text-xs font-bold text-ink">{s.label}</span>
              <span className="text-[11px] text-ink-2 tabular-nums">{s.sub}</span>
            </button>
          ))}
        </div>

        {/* 深色结余卡 */}
        <button
          onClick={() => navigate('/ledger')}
          className="relative overflow-hidden rounded-2xl p-4 text-left shadow-card transition-colors duration-150 hover:brightness-110"
          style={{ background: 'var(--grad-dark-warm)', color: 'var(--ink-on-dark)' }}
        >
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full"
            style={{ background: 'radial-gradient(circle,rgba(212,149,58,.3),transparent 70%)' }}
          />
          <div
            className="pointer-events-none absolute -bottom-10 -left-8 h-24 w-24 rounded-full"
            style={{ background: 'radial-gradient(circle,rgba(44,95,74,.25),transparent 70%)' }}
          />
          <div className="relative">
            <div className="flex items-center gap-1.5 text-[11px]" style={{ opacity: 0.6 }}>
              <Wallet size={13} />
              本月结余
            </div>
            <div
              className="mt-1.5 text-3xl font-extrabold leading-none tracking-tight tabular-nums"
              style={{ color: balanceColor }}
            >
              ¥{balance}
            </div>
            <div className="mt-2 text-[11px] tabular-nums" style={{ opacity: 0.6 }}>
              收 ¥{monthIncome.toFixed(0)} · 支 ¥{monthExpense.toFixed(0)}
            </div>
            <div
              className="mt-2 flex items-center gap-3 border-t pt-2 text-[11px] tabular-nums"
              style={{ borderColor: 'rgba(245,240,232,.14)', opacity: 0.55 }}
            >
              <span>累计 {totalRecords} 条</span>
              <span>置顶 {pinnedCount} 项</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
