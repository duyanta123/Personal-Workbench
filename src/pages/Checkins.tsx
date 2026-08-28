import { useDeferredValue, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Bell, BellOff, ChevronLeft, ChevronRight, Flame, Search } from 'lucide-react'
import {
  useAddHabit,
  useDeleteHabit,
  useHabitLogs,
  useHabitStats,
  useHabits,
  useToggleHabitLogDate,
  useToggleHabitPin,
  useUpdateHabit,
  useHabitStrengths,
  habitsListKey,
  HABITS_PAGE_SIZE
} from '../hooks/useHabits'
import type { HabitPage } from '../hooks/useHabits'
import { useDeferredDelete } from '../hooks/useDeferredDelete'
import { useTouch } from '../hooks/useTouch'
import { useToastStore } from '../stores/toast'
import { buildMonthGrid, monthCompletion } from '../utils/calendar'
import type { Habit, HabitLogState, HabitTargetMode, HabitTrackingType } from '../types'
import { useAuth } from '../hooks/useAuth'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import QueryError from '../components/ui/QueryError'
import { useCurrentDate } from '../hooks/useCurrentDate'
import { useClampPage } from '../hooks/useClampPage'
import { useHabitReminders } from '../hooks/useHabitReminders'
import EntityTemplatePanel from '../components/ui/EntityTemplatePanel'
import HabitEditor from '../features/habits/HabitEditor'
import HabitSummary from '../features/habits/HabitSummary'
import HabitCard from '../features/habits/HabitCard'
import HabitMonthOverview from '../features/habits/HabitMonthOverview'

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
  const strengthsQuery = useHabitStrengths(today)
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
  const [trackingType, setTrackingType] = useState<HabitTrackingType>('boolean')
  const [periodDays, setPeriodDays] = useState(1)
  const [targetCount, setTargetCount] = useState(1)
  const [targetValue, setTargetValue] = useState('')
  const [targetMode, setTargetMode] = useState<HabitTargetMode>('at_least')
  const [reminderTime, setReminderTime] = useState('')
  const [numericValues, setNumericValues] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)

  const doneToday = new Set((logs ?? []).filter((l) => l.log_date === today && (l.state ?? 'done') === 'done').map((l) => l.habit_id))
  const skippedToday = new Set((logs ?? []).filter((l) => l.log_date === today && l.state === 'skipped').map((l) => l.habit_id))
  const byHabit = new Map<string, Set<string>>()
  for (const l of logs ?? []) {
    const s = byHabit.get(l.habit_id) ?? new Set<string>()
    if ((l.state ?? 'done') === 'done') s.add(l.log_date)
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
  const strengthByHabit = new Map((strengthsQuery.data?.rows ?? []).map((row) => [row.habitId, row]))
  const reminders = useHabitReminders(userId, habits, logs ?? [], today)

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

  async function recordToday(h: Habit, state: HabitLogState = 'done') {
    const wasDone = doneToday.has(h.id)
    const value = (h.tracking_type ?? 'boolean') === 'numeric' && state === 'done' ? Number(numericValues[h.id]) : null
    if (state === 'done' && (h.tracking_type ?? 'boolean') === 'numeric' && !Number.isFinite(value)) {
      push({ kind: 'error', message: '请输入本次数值' })
      return
    }
    try {
      await toggleLog.mutateAsync({ habitId: h.id, date: today, done: state === 'skipped' || !wasDone, state, value })
      push({
        kind: state === 'skipped' || wasDone ? 'info' : 'success',
        message: state === 'skipped' ? `已跳过「${h.name}」` : wasDone ? `取消「${h.name}」的今日打卡` : `「${h.name}」打卡成功`
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
        await updateHabit.mutateAsync({ id: editingId, patch: {
          name: n, emoji: icon || 'flame', tracking_type: trackingType, period_days: periodDays,
          target_count: targetCount, target_value: trackingType === 'numeric' ? Number(targetValue) : null,
          target_mode: targetMode, reminder_time: reminderTime || null
        } })
        push({ kind: 'success', message: `已更新习惯「${n}」` })
      } else {
        await addHabit.mutateAsync({ name: n, emoji: icon || 'flame', tracking_type: trackingType, period_days: periodDays,
          target_count: targetCount, target_value: trackingType === 'numeric' ? Number(targetValue) : null,
          target_mode: targetMode, reminder_time: reminderTime || null })
        push({ kind: 'success', message: `已添加习惯「${n}」` })
      }
      setName('')
      setIcon('flame')
      setTrackingType('boolean'); setPeriodDays(1); setTargetCount(1); setTargetValue(''); setTargetMode('at_least'); setReminderTime('')
      setEditingId(null)
    } catch {
      push({ kind: 'error', message: editingId ? '习惯更新失败，请重试' : '习惯添加失败，请重试' })
    }
  }

  function startEdit(h: Habit) {
    setEditingId(h.id)
    setName(h.name)
    setIcon(h.emoji)
    setTrackingType(h.tracking_type ?? 'boolean')
    setPeriodDays(h.period_days ?? 1)
    setTargetCount(h.target_count ?? 1)
    setTargetValue(h.target_value == null ? '' : String(h.target_value))
    setTargetMode(h.target_mode ?? 'at_least')
    setReminderTime(h.reminder_time?.slice(0, 5) ?? '')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="HABITS"
        title="习惯打卡"
        description="每天坚持一点点。"
        actions={reminders.supported ? (
          <Button size="sm" variant="secondary" onClick={() => {
            if (reminders.enabled) reminders.disable()
            else void reminders.enable().then(() => push({ kind: 'success', message: '习惯提醒已开启' })).catch((cause) => push({ kind: 'error', message: cause instanceof Error ? cause.message : '通知开启失败' }))
          }}>
            {reminders.enabled ? <BellOff size={14} /> : <Bell size={14} />}{reminders.enabled ? '关闭提醒' : '开启提醒'}
          </Button>
        ) : undefined}
      />

      {(habitsQuery.isError || logsQuery.isError || statsQuery.isError || strengthsQuery.isError) && (
        <QueryError onRetry={() => { habitsQuery.refetch(); logsQuery.refetch(); statsQuery.refetch(); strengthsQuery.refetch() }} />
      )}

      <EntityTemplatePanel
        kind="habit"
        canSave={Boolean(name.trim()) && (trackingType !== 'numeric' || Number.isFinite(Number(targetValue)))}
        draft={{
          name: name.trim(), emoji: icon || 'flame', tracking_type: trackingType,
          period_days: periodDays, target_count: targetCount,
          target_value: trackingType === 'numeric' ? Number(targetValue) : null,
          target_mode: targetMode, reminder_time: reminderTime || null
        }}
        instantiate={(payload) => addHabit.mutateAsync({
          name: String(payload.name ?? ''), emoji: String(payload.emoji ?? 'flame'),
          tracking_type: payload.tracking_type === 'numeric' ? 'numeric' : 'boolean',
          period_days: Number(payload.period_days ?? 1), target_count: Number(payload.target_count ?? 1),
          target_value: payload.tracking_type === 'numeric' ? Number(payload.target_value ?? 0) : null,
          target_mode: payload.target_mode === 'at_most' ? 'at_most' : 'at_least',
          reminder_time: typeof payload.reminder_time === 'string' ? payload.reminder_time : null
        })}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {/* 本月概览 */}
          <HabitMonthOverview loggedDays={monthLoggedDays} elapsed={elapsed} rate={monthRate} />

          {/* 添加习惯 */}
          <HabitEditor
            name={name} icon={icon} trackingType={trackingType} periodDays={periodDays}
            targetCount={targetCount} targetValue={targetValue} targetMode={targetMode}
            reminderTime={reminderTime} editing={Boolean(editingId)}
            onNameChange={setName} onIconChange={setIcon} onTrackingTypeChange={setTrackingType}
            onPeriodDaysChange={setPeriodDays} onTargetCountChange={setTargetCount}
            onTargetValueChange={setTargetValue} onTargetModeChange={setTargetMode}
            onReminderTimeChange={setReminderTime} onSubmit={handleAdd}
            onCancel={() => { setEditingId(null); setName(''); setIcon('flame'); setTrackingType('boolean'); setPeriodDays(1); setTargetCount(1); setTargetValue(''); setReminderTime('') }}
          />

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
                const skipped = skippedToday.has(h.id)
                const streak = streakByHabit.get(h.id) ?? 0
                const logged = byHabit.get(h.id) ?? new Set<string>()
                const rate = monthCompletion(logged, year, month, today)
                const strength = strengthByHabit.get(h.id)
                return (
                  <HabitCard
                    key={h.id}
                    habit={h}
                    done={done}
                    skipped={skipped}
                    streak={streak}
                    logged={logged}
                    rate={rate}
                    strength={strength}
                    grid={grid}
                    today={today}
                    touch={touch}
                    numericValue={numericValues[h.id] ?? ''}
                    onNumericValueChange={(value) => setNumericValues((current) => ({ ...current, [h.id]: value }))}
                    deletePending={isDeletePending(h.id)}
                    getDeleteRemainingSeconds={() => remainingSeconds(h.id)}
                    logPending={(date) => toggleLog.isPendingFor(h.id, date)}
                    pinPending={togglePin.isPending}
                    onRecord={() => void recordToday(h)}
                    onSkip={() => void recordToday(h, 'skipped')}
                    onEdit={() => startEdit(h)}
                    onTogglePin={() => void handlePin(h)}
                    onDelete={() => requestDelete(h)}
                    onBackfill={(date) => backfill(h, date)}
                  />
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
        <HabitSummary done={doneToday.size} total={habitTotal} rankings={rankings} />
      </div>
    </div>
  )
}
