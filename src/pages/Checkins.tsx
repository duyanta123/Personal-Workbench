import { useDeferredValue, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, ChevronLeft, ChevronRight, Flame, Pencil, Pin, PinOff, Plus, Search, Trash2, X } from 'lucide-react'
import {
  useAddHabit,
  useDeleteHabit,
  useHabitLogs,
  useHabitStats,
  useHabits,
  useToggleHabitLogDate,
  useToggleHabitPin,
  useUpdateHabit,
  habitsListKey,
  HABITS_PAGE_SIZE
} from '../hooks/useHabits'
import type { HabitPage } from '../hooks/useHabits'
import { useDeferredDelete } from '../hooks/useDeferredDelete'
import { useTouch } from '../hooks/useTouch'
import { useToastStore } from '../stores/toast'
import { buildMonthGrid, monthCompletion } from '../utils/calendar'
import { resolveIcon } from '../utils/icon'
import type { Habit } from '../types'
import { useAuth } from '../hooks/useAuth'
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
import QueryError from '../components/ui/QueryError'
import { useCurrentDate } from '../hooks/useCurrentDate'
import { useClampPage } from '../hooks/useClampPage'

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
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const habitsQuery = useHabits(page, deferredQuery)
  useClampPage(habitsQuery.data?.total, HABITS_PAGE_SIZE, page, setPage)
  const logsQuery = useHabitLogs()
  const habits = habitsQuery.data?.items ?? []
  const isLoading = habitsQuery.isLoading
  const { data: logs } = logsQuery
  const today = useCurrentDate()
  const statsQuery = useHabitStats(today)
  const toggleLog = useToggleHabitLogDate()
  const togglePin = useToggleHabitPin()
  const addHabit = useAddHabit()
  const updateHabit = useUpdateHabit()
  const deleteHabit = useDeleteHabit()
  const push = useToastStore((s) => s.push)
  const touch = useTouch()
  const { userId } = useAuth()

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('flame')
  const [editingId, setEditingId] = useState<string | null>(null)

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
  const monthLoggedDays = statsQuery.data?.month_logged_days ?? 0
  const elapsed = Math.min(Number(today.slice(8, 10)), new Date(year, month, 0).getDate())
  const monthRate = elapsed ? Math.round((monthLoggedDays / elapsed) * 100) : 0

  // 搜索过滤
  const visibleHabits = habits
  useEffect(() => setPage(0), [query])

  // 连续天数排行（top6）
  const streakByHabit = new Map((statsQuery.data?.streaks ?? []).map((row) => [row.habit_id, row.streak]))
  const rankings = (statsQuery.data?.streaks ?? []).slice(0, 6)
  const habitTotal = statsQuery.data?.streaks.length ?? habitsQuery.data?.total ?? 0

  const { requestDelete, isPending: isDeletePending, remainingSeconds } = useDeferredDelete<Habit, HabitPage>({
    key: habitsListKey(userId, page, deferredQuery),
    label: (h) => h.name,
    remove: (id) => deleteHabit.mutateAsync(id),
    cache: {
      getItems: (cache) => cache?.items ?? [],
      remove: (cache, id) => cache && { items: cache.items.filter((item) => item.id !== id), total: Math.max(0, cache.total - 1) },
      restore: (cache) => cache
    }
  })

  async function toggleToday(h: Habit) {
    const wasDone = doneToday.has(h.id)
    try {
      await toggleLog.mutateAsync({ habitId: h.id, date: today, done: !wasDone })
      push({
        kind: wasDone ? 'info' : 'success',
        message: wasDone ? `取消「${h.name}」的今日打卡` : `「${h.name}」打卡成功`
      })
    } catch {
      push({ kind: 'error', message: '打卡保存失败，请重试' })
    }
  }

  async function handlePin(h: Habit) {
    try {
      await togglePin.mutateAsync({ id: h.id, pinned: !h.pinned })
      push({ kind: 'info', message: h.pinned ? '已取消置顶' : '已置顶' })
    } catch {
      push({ kind: 'error', message: '习惯置顶保存失败，请重试' })
    }
  }

  async function backfill(h: Habit, d: string) {
    const ok = window.confirm(`给「${h.name}」补卡 ${d.slice(5).replace('-', '/')}？`)
    if (!ok) return
    try {
      await toggleLog.mutateAsync({ habitId: h.id, date: d, done: true })
      push({ kind: 'success', message: `已补卡 ${d.slice(5).replace('-', '/')}` })
    } catch {
      push({ kind: 'error', message: '补卡失败，请重试' })
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    try {
      if (editingId) {
        await updateHabit.mutateAsync({ id: editingId, patch: { name: n, emoji: icon || 'flame' } })
        push({ kind: 'success', message: `已更新习惯「${n}」` })
      } else {
        await addHabit.mutateAsync({ name: n, emoji: icon || 'flame' })
        push({ kind: 'success', message: `已添加习惯「${n}」` })
      }
      setName('')
      setIcon('flame')
      setEditingId(null)
    } catch {
      push({ kind: 'error', message: editingId ? '习惯更新失败，请重试' : '习惯添加失败，请重试' })
    }
  }

  function startEdit(h: Habit) {
    setEditingId(h.id)
    setName(h.name)
    setIcon(h.emoji)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="HABITS"
        title="习惯打卡"
        description="每天坚持一点点。"
      />

      {(habitsQuery.isError || logsQuery.isError || statsQuery.isError) && (
        <QueryError onRetry={() => { habitsQuery.refetch(); logsQuery.refetch(); statsQuery.refetch() }} />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {/* 本月概览 */}
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink">本月累计打卡</span>
              <span className="text-ink-2 tabular-nums">
                {monthLoggedDays} / {elapsed} 天
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
              maxLength={200}
              className="flex-1"
            />
            <Button type="submit" disabled={!name.trim()}>
              <Plus size={16} />
              {editingId ? '保存' : '添加'}
            </Button>
            {editingId && (
              <IconButton type="button" onClick={() => { setEditingId(null); setName(''); setIcon('flame') }} aria-label="取消编辑">
                <X size={16} />
              </IconButton>
            )}
          </form>

          {/* 搜索 */}
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索习惯…"
              maxLength={200}
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
            const streak = streakByHabit.get(h.id) ?? 0
            const logged = byHabit.get(h.id) ?? new Set<string>()
            const rate = monthCompletion(logged, year, month, today)
            const Icon = resolveIcon(h.emoji)
            return (
              <div
                key={h.id}
                className={cn(
                  'group rounded-2xl border bg-surface p-5 transition-all duration-150',
                  isDeletePending(h.id) ? 'border-danger/40 opacity-60' : done ? 'border-m1/40 ring-2 ring-m1/30' : 'border-border hover:shadow-raised'
                )}
              >
                <div className="flex items-start justify-between">
                  <button
                    onClick={() => toggleToday(h)}
                    disabled={isDeletePending(h.id) || toggleLog.isPendingFor(h.id, today)}
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
                      onClick={() => startEdit(h)}
                      disabled={isDeletePending(h.id)}
                      aria-label="编辑习惯"
                      className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
                    >
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      onClick={() => void handlePin(h)}
                      disabled={togglePin.isPending || isDeletePending(h.id)}
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
                      disabled={isDeletePending(h.id)}
                      aria-label="删除习惯"
                      className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </div>
                <div className="mt-3 text-sm font-medium text-ink">{h.name}</div>
                {isDeletePending(h.id) && <div className="mt-1 text-[10px] font-medium text-danger">待删除 {remainingSeconds(h.id)}s</div>}
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
                          disabled={isDeletePending(h.id) || toggleLog.isPendingFor(h.id, d) || (!isLogged && !fillable && !isToday)}
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
          {(habitsQuery.data?.total ?? 0) > HABITS_PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3">
              <IconButton onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || habitsQuery.isFetching} aria-label="上一页"><ChevronLeft size={17} /></IconButton>
              <span className="text-xs text-ink-3 tabular-nums">第 {page + 1} / {Math.ceil((habitsQuery.data?.total ?? 0) / HABITS_PAGE_SIZE)} 页</span>
              <IconButton onClick={() => setPage((value) => value + 1)} disabled={(page + 1) * HABITS_PAGE_SIZE >= (habitsQuery.data?.total ?? 0) || habitsQuery.isFetching} aria-label="下一页"><ChevronRight size={17} /></IconButton>
            </div>
          )}
        </div>

        {/* 右栏统计 */}
        <aside className="h-fit space-y-3 lg:sticky lg:top-4">
          <SideCard title="今日打卡" icon={<Flame size={14} />}>
            <div className="flex items-center gap-4">
              <Ring
                value={habitTotal ? (doneToday.size / habitTotal) * 100 : 0}
                size={88}
                color="var(--m2)"
              >
                <span className="text-lg font-bold tabular-nums text-ink">
                  {doneToday.size}/{habitTotal}
                </span>
              </Ring>
              <div className="text-xs text-ink-2">
                <div>
                  已完成 <span className="font-bold text-ink tabular-nums">{doneToday.size}</span> /{' '}
                  {habitTotal}
                </div>
                <div className="mt-1 text-ink-3">
                  完成率{' '}
                  {habitTotal ? Math.round((doneToday.size / habitTotal) * 100) : 0}%
                </div>
              </div>
            </div>
          </SideCard>
          <SideCard title="连续天数排行" icon={<Flame size={14} />}>
            {rankings.length === 0 ? (
              <p className="py-2 text-center text-xs text-ink-3">还没有打卡记录</p>
            ) : (
              <ul className="space-y-2">
                {rankings.map((row) => (
                  <li key={row.habit_id} className="flex items-center gap-2 text-xs">
                    <span className="w-4 shrink-0 text-center">{row.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{row.name}</span>
                    <span className="shrink-0 font-bold text-m3 tabular-nums">{row.streak} 天</span>
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
