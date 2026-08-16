import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createEntity, deleteEntity, updateEntity } from '../lib/domainCommands'
import type { BodyMetric, WorkoutExercise, WorkoutSession } from '../types'
import { useAuth } from './useAuth'
import { buildBodyMetricUpsert } from '../utils/dataConsistency'
import type { BodyMetricPatch } from '../utils/dataConsistency'
import { rpcArray, rpcNumber, rpcRecord } from '../lib/rpcSchemas'
import { afterCursor, cursorScope, cursorToken, getPageCursor, rememberPageCursor } from '../lib/cursorPagination'
import { listCommands } from '../lib/commands'

export const workoutsKey = (userId: string | null) => ['workouts', userId] as const
export const exercisesKey = (userId: string | null) => ['workout-exercises', userId] as const
export const metricsKey = (userId: string | null) => ['body-metrics', userId] as const
export const WORKOUT_PAGE_SIZE = 20
const workoutCursorScope = (userId: string | null) => cursorScope(['workouts', userId])
const workoutOrder = [
  { column: 'date', direction: 'desc' as const },
  { column: 'created_at', direction: 'desc' as const },
  { column: 'id', direction: 'desc' as const }
] as const
export const workoutListKey = (userId: string | null, page: number) => [
  ...workoutsKey(userId), 'page', page, cursorToken(getPageCursor(workoutCursorScope(userId), page))
] as const

export interface WorkoutPage {
  items: WorkoutSession[]
  total: number
}

function invalidateWorkout(qc: QueryClient, userId: string | null) {
  for (const queryKey of [
    workoutsKey(userId), exercisesKey(userId), metricsKey(userId),
    ['dashboard_summary', userId] as const, ['workbench_insights', userId] as const
  ]) qc.invalidateQueries({ queryKey })
}

// ---------- 训练会话 ----------

export function useWorkoutSessions(page = 0) {
  const { userId } = useAuth()
  const scope = workoutCursorScope(userId)
  const cursor = getPageCursor(scope, page)
  return useQuery({
    queryKey: workoutListKey(userId, page),
    queryFn: async () => {
      let request = supabase!
        .from('workout_sessions')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
      if (cursor) request = request.or(afterCursor(cursor, workoutOrder))
      const [rowsResult, countResult] = await Promise.all([
        request.limit(WORKOUT_PAGE_SIZE),
        supabase!.from('workout_sessions').select('id', { count: 'exact', head: true })
      ])
      const { data, error } = rowsResult
      const { count, error: countError } = countResult
      if (error) throw error
      if (countError) throw countError
      const items = (data ?? []) as WorkoutSession[]
      const last = items.at(-1)
      rememberPageCursor(scope, page + 1, last ? {
        date: last.date,
        created_at: last.created_at,
        id: last.id
      } : null)
      return { items, total: count ?? 0 } as WorkoutPage
    },
    enabled: !!supabase && !!userId
  })
}

export interface NewWorkoutSession {
  date: string
  body_part: string
  duration_min: number | null
  note: string | null
}

export function useAddWorkoutSession() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: NewWorkoutSession) => {
      if (!userId) throw new Error('未登录')
      return createEntity(qc, userId, 'workout_session', { ...input })
    },
    onSuccess: () => invalidateWorkout(qc, userId)
  })
}

export function useDeleteWorkoutSession() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('未登录')
      return deleteEntity(qc, userId, 'workout_session', id)
    },
    onSuccess: () => invalidateWorkout(qc, userId)
  })
}

// ---------- 动作明细 ----------

export function useWorkoutExercises(sessionIds: string[]) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: [...exercisesKey(userId), sessionIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('workout_exercises')
        .select('*')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as WorkoutExercise[]
    },
    enabled: !!supabase && !!userId && sessionIds.length > 0
  })
}

export interface NewWorkoutExercise {
  session_id: string
  name: string
  sets: number
  reps: number
  weight: number
  note: string | null
}

export function useAddWorkoutExercise() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: NewWorkoutExercise) => {
      if (!userId) throw new Error('未登录')
      const parent = (await listCommands(userId)).find((command) =>
        command.entityId === input.session_id && command.kind === 'workout_session.create'
          && ['pending', 'syncing', 'failed'].includes(command.status))
      return createEntity(qc, userId, 'workout_exercise', { ...input }, {
        dependsOnCommandIds: parent ? [parent.commandId] : []
      })
    },
    onSuccess: () => invalidateWorkout(qc, userId)
  })
}

export function useDeleteWorkoutExercise() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('未登录')
      return deleteEntity(qc, userId, 'workout_exercise', id)
    },
    onSuccess: () => invalidateWorkout(qc, userId)
  })
}

// ---------- 身体数据 ----------

export function useBodyMetrics() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: metricsKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('body_metrics')
        .select('*')
        .order('date', { ascending: false })
        .limit(90)
      if (error) throw error
      return ((data ?? []) as BodyMetric[]).reverse()
    },
    enabled: !!supabase && !!userId
  })
}

export interface WorkoutStats {
  total: number
  month_sessions: number
  month_minutes: number
  week_sessions: number
  week_volume: number
  body_parts: [string, number][]
  month_body_parts: [string, number][]
}

export function useWorkoutStats(date: string, month: string) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: [...workoutsKey(userId), 'stats', date, month],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_workout_stats', { p_date: date, p_month: month })
      if (error) throw error
      const value = rpcRecord(data, 'workout stats') as unknown as WorkoutStats
      rpcNumber(value.total, 'workout stats.total')
      rpcNumber(value.month_sessions, 'workout stats.month_sessions')
      rpcNumber(value.month_minutes, 'workout stats.month_minutes')
      rpcNumber(value.week_sessions, 'workout stats.week_sessions')
      rpcNumber(value.week_volume, 'workout stats.week_volume')
      rpcArray(value.body_parts, 'workout stats.body_parts')
      rpcArray(value.month_body_parts, 'workout stats.month_body_parts')
      return {
        ...value,
        total: Number(value.total), month_sessions: Number(value.month_sessions), month_minutes: Number(value.month_minutes),
        week_sessions: Number(value.week_sessions), week_volume: Number(value.week_volume),
        body_parts: (value.body_parts ?? []).map(([name, count]) => [name, Number(count)] as [string, number]),
        month_body_parts: (value.month_body_parts ?? []).map(([name, count]) => [name, Number(count)] as [string, number])
      }
    },
    enabled: !!supabase && !!userId
  })
}

export function useUpsertBodyMetric() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: BodyMetricPatch) => {
      if (!userId) throw new Error('未登录')
      const payload = buildBodyMetricUpsert(input)
      const existing = qc.getQueryData<BodyMetric[]>(metricsKey(userId))?.find((row) => row.date === input.date)
      return existing
        ? updateEntity(qc, userId, 'body_metric', existing.id, payload)
        : createEntity(qc, userId, 'body_metric', payload)
    },
    onSuccess: () => invalidateWorkout(qc, userId)
  })
}

export function useUpdateWorkoutSession() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewWorkoutSession> }) => {
      if (!userId) throw new Error('未登录')
      return updateEntity(qc, userId, 'workout_session', id, patch)
    },
    onSuccess: () => invalidateWorkout(qc, userId)
  })
}

export function useUpdateWorkoutExercise() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Omit<NewWorkoutExercise, 'session_id'>> }) => {
      if (!userId) throw new Error('未登录')
      return updateEntity(qc, userId, 'workout_exercise', id, patch)
    },
    onSuccess: () => invalidateWorkout(qc, userId)
  })
}

export function useDeleteBodyMetric() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('未登录')
      return deleteEntity(qc, userId, 'body_metric', id)
    },
    onSuccess: () => invalidateWorkout(qc, userId)
  })
}
