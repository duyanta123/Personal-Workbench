import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BodyMetric, WorkoutExercise, WorkoutSession } from '../types'

export const workoutsKey = ['workouts']
export const exercisesKey = ['workout-exercises']
export const metricsKey = ['body-metrics']

// ---------- 训练会话 ----------

export function useWorkoutSessions() {
  return useQuery({
    queryKey: workoutsKey,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('workout_sessions')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as WorkoutSession[]
    },
    enabled: !!supabase
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
  return useMutation({
    mutationFn: async (input: NewWorkoutSession) => {
      const { data, error } = await supabase!
        .from('workout_sessions')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as WorkoutSession
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workoutsKey })
  })
}

export function useDeleteWorkoutSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('workout_sessions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workoutsKey })
      qc.invalidateQueries({ queryKey: exercisesKey })
    }
  })
}

// ---------- 动作明细 ----------

export function useWorkoutExercises() {
  return useQuery({
    queryKey: exercisesKey,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('workout_exercises')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as WorkoutExercise[]
    },
    enabled: !!supabase
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
  return useMutation({
    mutationFn: async (input: NewWorkoutExercise) => {
      const { data, error } = await supabase!
        .from('workout_exercises')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as WorkoutExercise
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: exercisesKey })
  })
}

export function useDeleteWorkoutExercise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('workout_exercises').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: exercisesKey })
  })
}

// ---------- 身体数据 ----------

export function useBodyMetrics() {
  return useQuery({
    queryKey: metricsKey,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('body_metrics')
        .select('*')
        .order('date', { ascending: true })
      if (error) throw error
      return data as BodyMetric[]
    },
    enabled: !!supabase
  })
}

export function useUpsertBodyMetric() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { date: string; weight: number | null; body_fat: number | null }) => {
      const uid = (await supabase!.auth.getUser()).data.user?.id
      if (!uid) throw new Error('未登录')
      const { data, error } = await supabase!
        .from('body_metrics')
        .upsert({ user_id: uid, ...input }, { onConflict: 'user_id,date' })
        .select()
        .single()
      if (error) throw error
      return data as BodyMetric
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: metricsKey })
  })
}
