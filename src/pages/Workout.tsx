import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronLeft, ChevronRight, Dumbbell, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  useAddWorkoutExercise,
  useAddWorkoutSession,
  useBodyMetrics,
  useDeleteBodyMetric,
  useDeleteWorkoutExercise,
  useDeleteWorkoutSession,
  useUpsertBodyMetric,
  useWorkoutExercises,
  useWorkoutSessions,
  useWorkoutStats,
  useUpdateWorkoutExercise,
  useUpdateWorkoutSession,
  exercisesKey,
  metricsKey,
  workoutListKey,
  WORKOUT_PAGE_SIZE
} from '../hooks/useWorkouts'
import type { WorkoutPage } from '../hooks/useWorkouts'
import { useDeferredDelete } from '../hooks/useDeferredDelete'
import { useTouch } from '../hooks/useTouch'
import { useToastStore } from '../stores/toast'
import { weightDelta } from '../utils/workoutStats'
import type { BodyMetric, WorkoutExercise, WorkoutSession } from '../types'
import Button from '../components/ui/Button'
import Input, { Textarea } from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Segmented from '../components/ui/Segmented'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import { cn } from '../lib/cn'
import { useAuth } from '../hooks/useAuth'
import QueryError from '../components/ui/QueryError'
import { useCurrentDate } from '../hooks/useCurrentDate'
import { useClampPage } from '../hooks/useClampPage'

const BODY_PARTS = [
  { value: 'chest', label: '胸' },
  { value: 'back', label: '背' },
  { value: 'leg', label: '腿' },
  { value: 'shoulder', label: '肩' },
  { value: 'arm', label: '手臂' },
  { value: 'core', label: '核心' },
  { value: 'cardio', label: '有氧' },
  { value: 'full', label: '全身' }
] as const

const BODY_PART_LABEL: Record<string, string> = Object.fromEntries(
  BODY_PARTS.map((b) => [b.value, b.label])
)

/** 最近 30 天体重折线（纯 SVG） */
function WeightChart({ metrics }: { metrics: BodyMetric[] }) {
  const points = useMemo(() => {
    const list = metrics
      .filter((m) => m.weight !== null)
      .slice(-30)
      .map((m) => ({ date: m.date, weight: m.weight as number }))
    return list
  }, [metrics])

  if (points.length < 2) return null

  const W = 280
  const H = 80
  const PAD = 6
  const min = Math.min(...points.map((p) => p.weight))
  const max = Math.max(...points.map((p) => p.weight))
  const range = max - min || 1
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1)
  const y = (w: number) => H - PAD - ((w - min) / range) * (H - PAD * 2)

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" role="img" aria-label="体重趋势">
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.weight)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-m1"
        />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.weight)} r="2.5" className="fill-m1" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-ink-3 tabular-nums">
        <span>{points[0].date.slice(5)}</span>
        <span>{points[points.length - 1].date.slice(5)}</span>
      </div>
    </div>
  )
}

const EMPTY_EX = { name: '', sets: '', reps: '', weight: '', note: '' }

export default function Workout() {
  const [page, setPage] = useState(0)
  const today = useCurrentDate()
  const sessionsQuery = useWorkoutSessions(page)
  useClampPage(sessionsQuery.data?.total, WORKOUT_PAGE_SIZE, page, setPage)
  const sessions = sessionsQuery.data?.items ?? []
  const sessionIds = sessions.map((session) => session.id)
  const exercisesQuery = useWorkoutExercises(sessionIds)
  const metricsQuery = useBodyMetrics()
  const statsQuery = useWorkoutStats(today, today.slice(0, 7))
  const isLoading = sessionsQuery.isLoading
  const { data: exercises } = exercisesQuery
  const { data: metrics } = metricsQuery
  const addSession = useAddWorkoutSession()
  const deleteSession = useDeleteWorkoutSession()
  const updateSession = useUpdateWorkoutSession()
  const addExercise = useAddWorkoutExercise()
  const deleteExercise = useDeleteWorkoutExercise()
  const updateExercise = useUpdateWorkoutExercise()
  const upsertMetric = useUpsertBodyMetric()
  const deleteMetric = useDeleteBodyMetric()
  const push = useToastStore((s) => s.push)
  const touch = useTouch()
  const { userId } = useAuth()

  // 新增训练表单
  const [sForm, setSForm] = useState({ date: today, body_part: 'chest' as string, duration: '', note: '' })
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  // 动作表单：按 sessionId 展开
  const [exForms, setExForms] = useState<Record<string, typeof EMPTY_EX>>({})
  const [editingExercise, setEditingExercise] = useState<{ id: string; sessionId: string } | null>(null)
  // 身体数据表单
  const [mForm, setMForm] = useState({ date: today, weight: '', body_fat: '', note: '' })
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null)
  const previousToday = useRef(today)
  const sessionDateDirty = useRef(false)
  const metricDateDirty = useRef(false)

  useEffect(() => {
    const previous = previousToday.current
    if (!sessionDateDirty.current) setSForm((form) => form.date === previous ? { ...form, date: today } : form)
    if (!metricDateDirty.current) setMForm((form) => form.date === previous ? { ...form, date: today } : form)
    previousToday.current = today
  }, [today])

  const bySession = useMemo(() => {
    const map = new Map<string, WorkoutExercise[]>()
    for (const e of exercises ?? []) {
      const list = map.get(e.session_id) ?? []
      list.push(e)
      map.set(e.session_id, list)
    }
    return map
  }, [exercises])

  const weekVolume = statsQuery.data?.week_volume ?? 0
  const weekCount = statsQuery.data?.week_sessions ?? 0
  const partFreq = Object.fromEntries(statsQuery.data?.body_parts ?? [])
  const { latest, delta } = weightDelta(metrics ?? [])

  const { requestDelete: requestDeleteSession, isPending: isSessionDeletePending, remainingSeconds: sessionDeleteSeconds } = useDeferredDelete<WorkoutSession, WorkoutPage>({
    key: workoutListKey(userId, page),
    label: (s) => `${s.date} 训练`,
    remove: (id) => deleteSession.mutateAsync(id),
    cache: {
      getItems: (cache) => cache?.items ?? [],
      remove: (cache, id) => cache && { items: cache.items.filter((item) => item.id !== id), total: Math.max(0, cache.total - 1) },
      restore: (cache) => cache
    }
  })

  const exerciseCacheKey = [...exercisesKey(userId), sessionIds.join(',')] as const
  const { requestDelete: requestDeleteExercise, isPending: isExerciseDeletePending, remainingSeconds: exerciseDeleteSeconds } = useDeferredDelete<WorkoutExercise>({
    key: exerciseCacheKey,
    label: (e) => e.name,
    remove: (id) => deleteExercise.mutateAsync(id)
  })

  const { requestDelete: requestDeleteMetric, isPending: isMetricDeletePending, remainingSeconds: metricDeleteSeconds } = useDeferredDelete<BodyMetric>({
    key: metricsKey(userId),
    label: (m) => `${m.date} 身体数据`,
    remove: (id) => deleteMetric.mutateAsync(id)
  })

  async function handleAddSession(e: FormEvent) {
    e.preventDefault()
    const duration = sForm.duration === '' ? null : Number(sForm.duration)
    if (duration !== null && (!Number.isInteger(duration) || duration < 0)) {
      push({ kind: 'error', message: '训练时长必须是非负整数' })
      return
    }
    const payload = {
      date: sForm.date,
      body_part: sForm.body_part,
      duration_min: duration,
      note: sForm.note.trim() || null
    }
    try {
      if (editingSessionId) {
        await updateSession.mutateAsync({ id: editingSessionId, patch: payload })
        push({ kind: 'success', message: '训练已更新' })
      } else {
        await addSession.mutateAsync(payload)
        push({ kind: 'success', message: '已添加训练' })
      }
      setSForm({ date: today, body_part: sForm.body_part, duration: '', note: '' })
      sessionDateDirty.current = false
      setEditingSessionId(null)
    } catch {
      push({ kind: 'error', message: editingSessionId ? '训练更新失败，请重试' : '训练添加失败，请重试' })
    }
  }

  async function handleAddExercise(e: FormEvent, sessionId: string) {
    e.preventDefault()
    const f = exForms[sessionId]
    const name = f?.name.trim()
    if (!name) return
    const sets = Number(f?.sets || 0)
    const reps = Number(f?.reps || 0)
    const weight = Number(f?.weight || 0)
    if (!Number.isInteger(sets) || !Number.isInteger(reps) || sets < 0 || reps < 0 || !Number.isFinite(weight) || weight < 0) {
      push({ kind: 'error', message: '组数、次数需为非负整数，重量不得为负' })
      return
    }
    const payload = {
      session_id: sessionId,
      name,
      sets,
      reps,
      weight,
      note: f?.note.trim() || null
    }
    try {
      const editingForSession = editingExercise?.sessionId === sessionId ? editingExercise : null
      if (editingForSession) {
        const { session_id: _sessionId, ...patch } = payload
        await updateExercise.mutateAsync({ id: editingForSession.id, patch })
        push({ kind: 'success', message: `已更新动作「${name}」` })
      } else {
        await addExercise.mutateAsync(payload)
        push({ kind: 'success', message: `已添加动作「${name}」` })
      }
      setExForms((prev) => ({ ...prev, [sessionId]: EMPTY_EX }))
      setEditingExercise(null)
    } catch {
      push({ kind: 'error', message: editingExercise?.sessionId === sessionId ? '动作更新失败，请重试' : '动作添加失败，请重试' })
    }
  }

  async function handleSaveMetric(e: FormEvent) {
    e.preventDefault()
    if (!mForm.weight && !mForm.body_fat && !mForm.note.trim()) return
    if ([mForm.weight, mForm.body_fat].some((value) => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
      push({ kind: 'error', message: '体重和体脂不得为负' })
      return
    }
    const payload: { date: string; weight?: number | null; body_fat?: number | null; note?: string | null } = { date: mForm.date }
    if (editingMetricId || mForm.weight) payload.weight = mForm.weight ? Number(mForm.weight) : null
    if (editingMetricId || mForm.body_fat) payload.body_fat = mForm.body_fat ? Number(mForm.body_fat) : null
    if (editingMetricId || mForm.note.trim()) payload.note = mForm.note.trim() || null
    try {
      await upsertMetric.mutateAsync(payload)
      push({ kind: 'success', message: '身体数据已保存' })
      setMForm({ date: today, weight: '', body_fat: '', note: '' })
      metricDateDirty.current = false
      setEditingMetricId(null)
    } catch {
      push({ kind: 'error', message: '身体数据保存失败，请重试' })
    }
  }

  function editSession(session: WorkoutSession) {
    sessionDateDirty.current = true
    setEditingSessionId(session.id)
    setSForm({ date: session.date, body_part: session.body_part, duration: session.duration_min?.toString() ?? '', note: session.note ?? '' })
  }

  function editExercise(exercise: WorkoutExercise) {
    setEditingExercise({ id: exercise.id, sessionId: exercise.session_id })
    setExForms((prev) => ({ ...prev, [exercise.session_id]: {
      name: exercise.name, sets: String(exercise.sets), reps: String(exercise.reps), weight: String(exercise.weight), note: exercise.note ?? ''
    } }))
  }

  function editMetric(metric: BodyMetric) {
    metricDateDirty.current = true
    setEditingMetricId(metric.id)
    setMForm({ date: metric.date, weight: metric.weight?.toString() ?? '', body_fat: metric.body_fat?.toString() ?? '', note: metric.note ?? '' })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="FITNESS"
        title="健身记录"
        description="每一次训练都算数。"
      />
      {(sessionsQuery.isError || exercisesQuery.isError || metricsQuery.isError || statsQuery.isError) && (
        <QueryError onRetry={() => { sessionsQuery.refetch(); exercisesQuery.refetch(); metricsQuery.refetch(); statsQuery.refetch() }} />
      )}

      {/* 本周概览 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-ink-3">本周训练</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums">{weekCount} 次</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-ink-3">本周容量</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums">
            {weekVolume ? `${weekVolume}kg` : '–'}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-ink-3">最新体重</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums">
            {latest ? `${latest}kg` : '–'}
          </div>
          {delta !== null && latest !== null && (
            <div className={cn('mt-0.5 text-xs tabular-nums', delta === 0 ? 'text-ink-3' : delta < 0 ? 'text-m1' : 'text-m3')}>
              {delta > 0 ? `+${delta}` : delta} kg
            </div>
          )}
        </div>
      </div>

      {/* 身体数据 */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">身体数据</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {partFreq && Object.entries(partFreq).length > 0 && (
              <div className="hidden items-center gap-1 sm:flex">
                {Object.entries(partFreq).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-nested px-2 py-0.5 text-[10px] text-ink-2 tabular-nums">
                    {BODY_PART_LABEL[k] ?? k} {v}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <form onSubmit={handleSaveMetric} className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="body-metric-date" className="mb-1 block text-[10px] text-ink-3">日期</label>
            <Input
              id="body-metric-date"
              type="date"
              disabled={Boolean(editingMetricId)}
              value={mForm.date}
              onChange={(e) => { metricDateDirty.current = true; setMForm({ ...mForm, date: e.target.value }) }}
              className="w-36 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="body-metric-weight" className="mb-1 block text-[10px] text-ink-3">体重 (kg)</label>
            <Input
              id="body-metric-weight"
              type="number"
              step="0.1"
              min="0"
              value={mForm.weight}
              onChange={(e) => setMForm({ ...mForm, weight: e.target.value })}
              placeholder="60.0"
              max="1000"
              className="w-28 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="body-metric-fat" className="mb-1 block text-[10px] text-ink-3">体脂 (%)</label>
            <Input
              id="body-metric-fat"
              type="number"
              step="0.1"
              min="0"
              value={mForm.body_fat}
              onChange={(e) => setMForm({ ...mForm, body_fat: e.target.value })}
              placeholder="15.0"
              max="100"
              className="w-28 tabular-nums"
            />
          </div>
          <Input
            value={mForm.note}
            onChange={(e) => setMForm({ ...mForm, note: e.target.value })}
            placeholder="备注"
            maxLength={100000}
            className="min-w-32 flex-1"
          />
          <Button type="submit" disabled={(!mForm.weight && !mForm.body_fat && !mForm.note.trim()) || upsertMetric.isPending}>
            <Plus size={16} />
            {editingMetricId ? '更新' : '保存'}
          </Button>
          {editingMetricId && <IconButton type="button" onClick={() => { metricDateDirty.current = false; setEditingMetricId(null); setMForm({ date: today, weight: '', body_fat: '', note: '' }) }} aria-label="取消编辑"><X size={16} /></IconButton>}
        </form>
        <WeightChart metrics={metrics ?? []} />
        {(metrics?.length ?? 0) > 0 && (
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {[...(metrics ?? [])].slice(-8).reverse().map((metric) => (
              <li key={metric.id} className={cn('flex items-center gap-3 py-2 text-xs', isMetricDeletePending(metric.id) && 'opacity-60')}>
                <span className="w-20 text-ink-3 tabular-nums">{metric.date.slice(5)}</span>
                <span className="text-ink">{metric.weight !== null ? `${metric.weight}kg` : '体重 -'}</span>
                <span className="text-ink-2">{metric.body_fat !== null ? `体脂 ${metric.body_fat}%` : '体脂 -'}</span>
                {metric.note && <span className="min-w-0 flex-1 truncate text-ink-3">{metric.note}</span>}
                {isMetricDeletePending(metric.id) && <span className="text-[10px] text-danger">待删除 {metricDeleteSeconds(metric.id)}s</span>}
                <IconButton size="sm" onClick={() => editMetric(metric)} disabled={isMetricDeletePending(metric.id)} aria-label="编辑身体数据"><Pencil size={14} /></IconButton>
                <IconButton size="sm" onClick={() => requestDeleteMetric(metric)} disabled={isMetricDeletePending(metric.id)} aria-label="删除身体数据"><Trash2 size={14} /></IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 新增训练 */}
      <form onSubmit={handleAddSession} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={sForm.date}
              onChange={(e) => { sessionDateDirty.current = true; setSForm({ ...sForm, date: e.target.value }) }}
              aria-label="训练日期"
              className="w-40 tabular-nums"
            />
            <Input
              type="number"
              min="0"
              value={sForm.duration}
              onChange={(e) => setSForm({ ...sForm, duration: e.target.value })}
              placeholder="时长(分钟)"
              max="1440"
              className="w-32 tabular-nums"
            />
          </div>
          <div className="flex gap-2">
          <Button type="submit" disabled={addSession.isPending || updateSession.isPending}>
            <Plus size={16} />
            {editingSessionId ? '保存训练' : '添加训练'}
          </Button>
          {editingSessionId && <IconButton type="button" onClick={() => { sessionDateDirty.current = false; setEditingSessionId(null); setSForm({ date: today, body_part: sForm.body_part, duration: '', note: '' }) }} aria-label="取消编辑"><X size={16} /></IconButton>}
          </div>
        </div>
        <Segmented
          value={sForm.body_part}
          onChange={(v) => setSForm({ ...sForm, body_part: v })}
          options={[...BODY_PARTS]}
        />
        <Textarea value={sForm.note} onChange={(e) => setSForm({ ...sForm, note: e.target.value })} placeholder="训练备注（可选）" rows={2} maxLength={100000} />
      </form>

      {/* 训练列表 */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !sessions.length ? (
        <EmptyState
          icon={<Dumbbell size={22} />}
          title="还没有训练记录"
          description="从上面添加第一次训练吧。"
        />
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            const list = bySession.get(s.id) ?? []
            const exForm = exForms[s.id] ?? EMPTY_EX
            return (
              <li
                key={s.id}
                className={cn('group rounded-2xl border bg-surface p-4 transition-colors duration-150 hover:bg-hover', isSessionDeletePending(s.id) ? 'border-danger/40 opacity-60' : 'border-border')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink tabular-nums">
                      {s.date.slice(5).replace('-', '/')}
                    </span>
                    <Badge variant="accent">{BODY_PART_LABEL[s.body_part] ?? s.body_part}</Badge>
                    {s.duration_min && <span className="text-xs text-ink-3 tabular-nums">{s.duration_min} 分钟</span>}
                    <span className="text-xs text-ink-3 tabular-nums">{list.length} 个动作</span>
                    {isSessionDeletePending(s.id) && <span className="text-[10px] font-medium text-danger">待删除 {sessionDeleteSeconds(s.id)}s</span>}
                  </div>
                  <div className={cn('flex items-center gap-0.5', touch ? '' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100')}>
                    <IconButton size="sm" onClick={() => editSession(s)} disabled={isSessionDeletePending(s.id)} aria-label="编辑训练">
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton size="sm" onClick={() => requestDeleteSession(s)} disabled={isSessionDeletePending(s.id)} aria-label="删除训练">
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>
                {s.note && <p className="mt-1 text-xs text-ink-3">{s.note}</p>}

                {list.length > 0 && (
                  <ul className="mt-3 divide-y divide-border">
                    {list.map((ex) => (
                      <li key={ex.id} className={cn('flex items-center gap-3 py-1.5 text-sm', isExerciseDeletePending(ex.id) && 'opacity-60')}>
                        <span className="flex-1 text-ink">{ex.name}</span>
                        <span className="text-ink-2 tabular-nums">
                          {ex.sets} 组 × {ex.reps} 次 × {ex.weight}kg
                        </span>
                        {ex.note && <span className="max-w-28 truncate text-xs text-ink-3">{ex.note}</span>}
                        {isExerciseDeletePending(ex.id) && <span className="text-[10px] text-danger">待删除 {exerciseDeleteSeconds(ex.id)}s</span>}
                        <IconButton size="sm" onClick={() => editExercise(ex)} disabled={isExerciseDeletePending(ex.id)} aria-label="编辑动作" className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}>
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton
                          size="sm"
                          onClick={() => requestDeleteExercise(ex)}
                          disabled={isExerciseDeletePending(ex.id)}
                          aria-label="删除动作"
                          className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  onSubmit={(e) => handleAddExercise(e, s.id)}
                  className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2"
                >
                  <Input
                    value={exForm.name}
                    onChange={(e) => setExForms((prev) => ({ ...prev, [s.id]: { ...(prev[s.id] ?? EMPTY_EX), name: e.target.value } }))}
                    placeholder="动作名，如：卧推"
                    maxLength={200}
                    className="min-w-36 flex-1"
                  />
                  <Input
                    type="number"
                    min="0"
                    value={exForm.sets}
                    onChange={(e) => setExForms((prev) => ({ ...prev, [s.id]: { ...(prev[s.id] ?? EMPTY_EX), sets: e.target.value } }))}
                    placeholder="组"
                    max="10000"
                    className="w-16 tabular-nums"
                  />
                  <Input
                    type="number"
                    min="0"
                    value={exForm.reps}
                    onChange={(e) => setExForms((prev) => ({ ...prev, [s.id]: { ...(prev[s.id] ?? EMPTY_EX), reps: e.target.value } }))}
                    placeholder="次"
                    max="10000"
                    className="w-16 tabular-nums"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={exForm.weight}
                    onChange={(e) => setExForms((prev) => ({ ...prev, [s.id]: { ...(prev[s.id] ?? EMPTY_EX), weight: e.target.value } }))}
                    placeholder="kg"
                    max="10000"
                    className="w-20 tabular-nums"
                  />
                  <Input
                    value={exForm.note}
                    onChange={(e) => setExForms((prev) => ({ ...prev, [s.id]: { ...(prev[s.id] ?? EMPTY_EX), note: e.target.value } }))}
                    placeholder="备注"
                    maxLength={100000}
                    className="min-w-24 flex-1"
                  />
                  <Button type="submit" size="sm" variant="secondary" disabled={isSessionDeletePending(s.id) || !exForm.name.trim() || addExercise.isPending || updateExercise.isPending}>
                    <Plus size={14} />
                    {editingExercise?.sessionId === s.id ? '保存' : '添加'}
                  </Button>
                  {editingExercise?.sessionId === s.id && <IconButton type="button" size="sm" onClick={() => { setEditingExercise(null); setExForms((prev) => ({ ...prev, [s.id]: EMPTY_EX })) }} aria-label="取消编辑"><X size={14} /></IconButton>}
                </form>
              </li>
            )
          })}
        </ul>
      )}
      {(sessionsQuery.data?.total ?? 0) > WORKOUT_PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3">
          <IconButton onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || sessionsQuery.isFetching} aria-label="上一页"><ChevronLeft size={17} /></IconButton>
          <span className="text-xs text-ink-3 tabular-nums">第 {page + 1} / {Math.ceil((sessionsQuery.data?.total ?? 0) / WORKOUT_PAGE_SIZE)} 页</span>
          <IconButton onClick={() => setPage((value) => value + 1)} disabled={(page + 1) * WORKOUT_PAGE_SIZE >= (sessionsQuery.data?.total ?? 0) || sessionsQuery.isFetching} aria-label="下一页"><ChevronRight size={17} /></IconButton>
        </div>
      )}
    </div>
  )
}
