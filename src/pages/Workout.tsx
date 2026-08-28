import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Dumbbell } from 'lucide-react'
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
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import { useAuth } from '../hooks/useAuth'
import QueryError from '../components/ui/QueryError'
import { useCurrentDate } from '../hooks/useCurrentDate'
import { useClampPage } from '../hooks/useClampPage'
import EntityTemplatePanel from '../components/ui/EntityTemplatePanel'
import WorkoutSummary from '../features/workout/WorkoutSummary'
import SessionEditor from '../features/workout/SessionEditor'
import MetricEditor from '../features/workout/MetricEditor'
import WeightChart from '../features/workout/WeightChart'
import SessionCard from '../features/workout/SessionCard'
import WorkoutPagination from '../features/workout/WorkoutPagination'

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

      <EntityTemplatePanel
        kind="workout"
        canSave={Boolean(sForm.body_part)}
        draft={{ body_part: sForm.body_part, duration_min: sForm.duration === '' ? null : Number(sForm.duration), note: sForm.note.trim() || null }}
        instantiate={(payload) => addSession.mutateAsync({
          date: today, body_part: String(payload.body_part ?? 'full'),
          duration_min: payload.duration_min == null ? null : Number(payload.duration_min),
          note: typeof payload.note === 'string' ? payload.note : null
        })}
      />

      {/* 本周概览 */}
      <WorkoutSummary weekCount={weekCount} weekVolume={weekVolume} latest={latest} delta={delta} />

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
        <MetricEditor
          form={mForm}
          editing={Boolean(editingMetricId)}
          busy={upsertMetric.isPending}
          metrics={metrics ?? []}
          pending={isMetricDeletePending}
          remainingSeconds={metricDeleteSeconds}
          onChange={(form) => { if (form.date !== mForm.date) metricDateDirty.current = true; setMForm(form) }}
          onSubmit={handleSaveMetric}
          onCancel={() => { metricDateDirty.current = false; setEditingMetricId(null); setMForm({ date: today, weight: '', body_fat: '', note: '' }) }}
          onEdit={editMetric}
          onDelete={requestDeleteMetric}
        />
        <WeightChart metrics={metrics ?? []} />
      </div>

      {/* 新增训练 */}
      <SessionEditor
        form={sForm}
        bodyParts={[...BODY_PARTS]}
        editing={Boolean(editingSessionId)}
        busy={addSession.isPending || updateSession.isPending}
        onChange={(form) => { if (form.date !== sForm.date) sessionDateDirty.current = true; setSForm(form) }}
        onSubmit={handleAddSession}
        onCancel={() => { sessionDateDirty.current = false; setEditingSessionId(null); setSForm({ date: today, body_part: sForm.body_part, duration: '', note: '' }) }}
      />

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
              <SessionCard
                key={s.id}
                session={s}
                bodyPartLabel={BODY_PART_LABEL[s.body_part] ?? s.body_part}
                exercises={list}
                exForm={exForm}
                editingExercise={editingExercise?.sessionId === s.id}
                touch={touch}
                sessionDeletePending={isSessionDeletePending(s.id)}
                sessionDeleteSeconds={sessionDeleteSeconds(s.id)}
                exerciseDeletePending={isExerciseDeletePending}
                exerciseDeleteSeconds={exerciseDeleteSeconds}
                busy={addExercise.isPending || updateExercise.isPending}
                onEditSession={() => editSession(s)}
                onDeleteSession={() => requestDeleteSession(s)}
                onEditExercise={editExercise}
                onDeleteExercise={requestDeleteExercise}
                onExFormChange={(form) => setExForms((prev) => ({ ...prev, [s.id]: form }))}
                onSubmitExercise={(e) => handleAddExercise(e, s.id)}
                onCancelEditExercise={() => { setEditingExercise(null); setExForms((prev) => ({ ...prev, [s.id]: EMPTY_EX })) }}
              />
            )
          })}
        </ul>
      )}
      {(sessionsQuery.data?.total ?? 0) > WORKOUT_PAGE_SIZE && (
        <WorkoutPagination page={page} total={sessionsQuery.data?.total ?? 0} fetching={sessionsQuery.isFetching} onPageChange={setPage} />
      )}
    </div>
  )
}
