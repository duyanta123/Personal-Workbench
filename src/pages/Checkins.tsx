import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Flame, Plus, Trash2 } from 'lucide-react'
import { useAddHabit, useDeleteHabit, useHabitLogs, useHabits, useToggleHabitLogDate } from '../hooks/useHabits'
import { useDeferredDelete } from '../hooks/useDeferredDelete'
import { useTouch } from '../hooks/useTouch'
import { useToastStore } from '../stores/toast'
import { monthPrefix, todayStr } from '../utils/date'
import { buildMonthGrid, monthCompletion } from '../utils/calendar'
import { computeStreak } from '../utils/streak'
import { resolveIcon } from '../utils/icon'
import type { Habit } from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import IconPicker from '../components/ui/IconPicker'
import Progress from '../components/ui/Progress'
import { cn } from '../lib/cn'

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

/** 过去 7 天内可补卡 */
function canBackfill(d: string, today: string): boolean {
  return d < today && today <= addDays(d, 7)
}

function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00`)
  t.setDate(t.getDate() + n)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export default function Checkins() {
  const { data: habits, isLoading } = useHabits()
  const { data: logs } = useHabitLogs()
  const toggleLog = useToggleHabitLogDate()
  const addHabit = useAddHabit()
  const deleteHabit = useDeleteHabit()
  const push = useToastStore((s) => s.push)
  const touch = useTouch()

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('flame')

  const today = todayStr()
  const doneToday = new Set((logs ?? []).filter((l) => l.log_date === today).map((l) => l.habit_id))
  const byHabit = new Map<string, Set<string>>()
  for (const l of logs ?? []) {
    const s = byHabit.get(l.habit_id) ?? new Set<string>()
    s.add(l.log_date)
    byHabit.set(l.habit_id, s)
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const grid = buildMonthGrid(year, month)

  // 本月整体打卡天数（去重日期）
  const monthLoggedDays = new Set<string>()
  for (const l of logs ?? []) {
    if (l.log_date.startsWith(monthPrefix())) monthLoggedDays.add(l.log_date)
  }
  const elapsed = Math.min(Number(today.slice(8, 10)), new Date(year, month, 0).getDate())
  const monthRate = elapsed ? Math.round((monthLoggedDays.size / elapsed) * 100) : 0

  const { requestDelete } = useDeferredDelete<Habit>({
    key: ['habits'],
    label: (h) => h.name,
    remove: (id) => deleteHabit.mutate(id),
    restore: (h) => addHabit.mutate({ name: h.name, emoji: h.emoji })
  })

  function toggleToday(h: Habit) {
    const wasDone = doneToday.has(h.id)
    toggleLog.mutate({ habitId: h.id, date: today })
    push({
      kind: wasDone ? 'info' : 'success',
      message: wasDone ? `取消「${h.name}」的今日打卡` : `「${h.name}」打卡成功`
    })
  }

  function backfill(h: Habit, d: string) {
    const ok = window.confirm(`给「${h.name}」补卡 ${d.slice(5).replace('-', '/')}？`)
    if (!ok) return
    toggleLog.mutate({ habitId: h.id, date: d })
    push({ kind: 'success', message: `已补卡 ${d.slice(5).replace('-', '/')}` })
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    addHabit.mutate({ name: n, emoji: icon || 'flame' })
    push({ kind: 'success', message: `已添加习惯「${n}」` })
    setName('')
    setIcon('flame')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="HABITS"
        title="习惯打卡"
        description="每天坚持一点点。"
      />

      {/* 本月概览 */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink">本月累计打卡</span>
          <span className="text-ink-2 tabular-nums">
            {monthLoggedDays.size} / {elapsed} 天
          </span>
        </div>
        <Progress value={monthRate} color="bg-m2" className="mt-2" />
        <p className="mt-1 text-right text-xs text-ink-3 tabular-nums">完成率 {monthRate}%</p>
      </div>

      {/* 添加习惯 */}
      <form onSubmit={handleAdd} className="flex gap-2 rounded-2xl border border-border bg-surface p-4">
        <IconPicker value={icon} onChange={setIcon} aria-label="选择图标" />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="习惯名称，如：喝水 8 杯"
          className="flex-1"
        />
        <Button type="submit" disabled={!name.trim()}>
          <Plus size={16} />
          添加
        </Button>
      </form>

      {/* 习惯列表 */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : !habits?.length ? (
        <EmptyState
          icon={<Flame size={22} />}
          title="还没有习惯"
          description="添加一个开始打卡吧。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {habits.map((h) => {
            const done = doneToday.has(h.id)
            const streak = computeStreak(byHabit.get(h.id) ?? new Set(), today)
            const logged = byHabit.get(h.id) ?? new Set<string>()
            const rate = monthCompletion(logged, year, month, today)
            const Icon = resolveIcon(h.emoji)
            return (
              <div
                key={h.id}
                className={cn(
                  'group rounded-2xl border bg-surface p-5 transition-all duration-150',
                  done ? 'border-m1/40 ring-2 ring-m1/30' : 'border-border hover:shadow-raised'
                )}
              >
                <div className="flex items-start justify-between">
                  <button
                    onClick={() => toggleToday(h)}
                    aria-label="打卡"
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-2xl transition-colors duration-150',
                      done ? 'bg-m1/15' : 'bg-nested hover:bg-hover'
                    )}
                  >
                    <Icon size={20} className={done ? 'text-m1' : 'text-ink-2'} />
                  </button>
                  <IconButton
                    size="sm"
                    onClick={() => requestDelete(h)}
                    aria-label="删除习惯"
                    className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
                <div className="mt-3 text-sm font-medium text-ink">{h.name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
                  {done ? (
                    <span className="inline-flex items-center gap-0.5 font-medium text-m1">
                      今天已打卡 <Check size={12} />
                    </span>
                  ) : (
                    '今天还没打卡'
                  )}
                  <span className="mx-0.5">·</span>
                  <span className="tabular-nums">连续 {streak} 天</span>
                  <span className="mx-0.5">·</span>
                  <span className="tabular-nums">本月 {rate}%</span>
                </div>

                {/* 月度日历 */}
                <div className="mt-4">
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-ink-3">
                    {WEEK.map((w) => (
                      <span key={w} className="py-0.5">{w}</span>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {grid.map((d, i) => {
                      if (!d) return <span key={i} />
                      const isToday = d === today
                      const isLogged = logged.has(d)
                      const past = d < today
                      const fillable = past && canBackfill(d, today) && !isLogged
                      const future = d > today
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={!isLogged && !fillable && !isToday}
                          onClick={() => {
                            if (isToday) toggleToday(h)
                            else if (fillable) backfill(h, d)
                          }}
                          title={
                            isToday ? '今天' : isLogged ? '已打卡' : fillable ? '可补卡' : undefined
                          }
                          className={cn(
                            'flex aspect-square items-center justify-center rounded-md text-[11px] tabular-nums transition-colors',
                            isLogged
                              ? 'bg-m1/15 font-medium text-m1'
                              : fillable
                                ? 'bg-nested text-ink-2 hover:bg-m1/20 hover:text-m1'
                                : future
                                  ? 'text-ink-3/50'
                                  : isToday
                                    ? 'bg-accent-2 font-medium text-accent ring-1 ring-accent'
                                    : 'text-ink-3/60'
                          )}
                        >
                          {Number(d.slice(8, 10))}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
