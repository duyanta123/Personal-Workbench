import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Flame, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react'
import {
  useAddHabit,
  useAddHabitLogs,
  useDeleteHabit,
  useHabitLogs,
  useHabits,
  useToggleHabitLogDate,
  useToggleHabitPin
} from '../hooks/useHabits'
import { useDeferredDelete } from '../hooks/useDeferredDelete'
import { useTouch } from '../hooks/useTouch'
import { useToastStore } from '../stores/toast'
import { monthPrefix, todayStr } from '../utils/date'
import { buildMonthGrid, monthCompletion } from '../utils/calendar'
import { computeStreak } from '../utils/streak'
import { resolveIcon } from '../utils/icon'
import { habitRestoreInput } from '../utils/restore'
import type { Habit } from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import IconPicker from '../components/ui/IconPicker'
import Progress from '../components/ui/Progress'
import Ring from '../components/ui/Ring'
import SideCard from '../components/ui/SideCard'
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
  const togglePin = useToggleHabitPin()
  const addHabit = useAddHabit()
  const deleteHabit = useDeleteHabit()
  const addHabitLogs = useAddHabitLogs()
  const push = useToastStore((s) => s.push)
  const touch = useTouch()
  // 删除时快照该习惯的打卡日期，撤销时按新习惯 id 重建（级联删除的日志无法自动恢复）
  const logsSnapshot = useRef(new Map<string, string[]>())

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('flame')
  const [query, setQuery] = useState('')

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

  // 搜索过滤
  const searching = query.trim().length > 0
  const visibleHabits = useMemo(
    () =>
      searching
        ? (habits ?? []).filter((h) => h.name.toLowerCase().includes(query.trim().toLowerCase()))
        : (habits ?? []),
    [habits, searching, query]
  )

  // 连续天数排行（top6）
  const rankings = useMemo(
    () =>
      (habits ?? [])
        .map((h) => ({ habit: h, streak: computeStreak(byHabit.get(h.id) ?? new Set(), today) }))
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 6),
    [habits, byHabit, today]
  )

  const { requestDelete } = useDeferredDelete<Habit>({
    key: ['habits'],
    label: (h) => h.name,
    remove: (id) => {
      logsSnapshot.current.set(id, [...(byHabit.get(id) ?? [])])
      return deleteHabit.mutateAsync(id)
    },
    restore: async (h) => {
      const added = await addHabit.mutateAsync(habitRestoreInput(h))
      const dates = logsSnapshot.current.get(h.id) ?? []
      logsSnapshot.current.delete(h.id)
      if (dates.length > 0) {
        await addHabitLogs.mutateAsync(dates.map((d) => ({ habit_id: added.id, log_date: d })))
      }
    }
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
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

          {/* 搜索 */}
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索习惯…"
              className="pl-9"
            />
          </div>

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
          ) : visibleHabits.length === 0 ? (
            <EmptyState icon={<Search size={22} />} title="没有匹配的习惯" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleHabits.map((h) => {
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
                  <div className="flex gap-0.5">
                    <IconButton
                      size="sm"
                      onClick={() => togglePin.mutate({ id: h.id, pinned: !h.pinned })}
                      aria-label={h.pinned ? '取消置顶' : '置顶'}
                      className={cn(
                        touch || h.pinned ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
                        h.pinned && 'text-m3'
                      )}
                    >
                      {h.pinned ? <Pin size={15} /> : <PinOff size={15} />}
                    </IconButton>
                    <IconButton
                      size="sm"
                      onClick={() => requestDelete(h)}
                      aria-label="删除习惯"
                      className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
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

        {/* 右栏统计 */}
        <aside className="h-fit space-y-3 lg:sticky lg:top-4">
          <SideCard title="今日打卡" icon={<Flame size={14} />}>
            <div className="flex items-center gap-4">
              <Ring
                value={habits?.length ? (doneToday.size / habits.length) * 100 : 0}
                size={88}
                color="var(--m2)"
              >
                <span className="text-lg font-bold tabular-nums text-ink">
                  {doneToday.size}/{habits?.length ?? 0}
                </span>
              </Ring>
              <div className="text-xs text-ink-2">
                <div>
                  已完成 <span className="font-bold text-ink tabular-nums">{doneToday.size}</span> /{' '}
                  {habits?.length ?? 0}
                </div>
                <div className="mt-1 text-ink-3">
                  完成率{' '}
                  {habits?.length ? Math.round((doneToday.size / habits.length) * 100) : 0}%
                </div>
              </div>
            </div>
          </SideCard>
          <SideCard title="连续天数排行" icon={<Flame size={14} />}>
            {rankings.length === 0 ? (
              <p className="py-2 text-center text-xs text-ink-3">还没有打卡记录</p>
            ) : (
              <ul className="space-y-2">
                {rankings.map(({ habit, streak }) => (
                  <li key={habit.id} className="flex items-center gap-2 text-xs">
                    <span className="w-4 shrink-0 text-center">{habit.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{habit.name}</span>
                    <span className="shrink-0 font-bold text-m3 tabular-nums">{streak} 天</span>
                  </li>
                ))}
              </ul>
            )}
          </SideCard>
        </aside>
      </div>
    </div>
  )
}
