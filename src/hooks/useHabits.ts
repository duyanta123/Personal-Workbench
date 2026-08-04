import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { todayStr } from '../utils/date'
import type { Habit, HabitLog } from '../types'

export const habitsKey = ['habits']
export const habitLogsKey = ['habit_logs']

export function useHabits() {
  return useQuery({
    queryKey: habitsKey,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('habits')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Habit[]
    },
    enabled: !!supabase
  })
}

export function useHabitLogs() {
  return useQuery({
    queryKey: habitLogsKey,
    queryFn: async () => {
      const { data, error } = await supabase!.from('habit_logs').select('*')
      if (error) throw error
      return data as HabitLog[]
    },
    enabled: !!supabase
  })
}

export function useAddHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; emoji: string }) => {
      const { data, error } = await supabase!.from('habits').insert(input).select().single()
      if (error) throw error
      return data as Habit
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: habitsKey })
  })
}

export function useDeleteHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('habits').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: habitsKey })
      qc.invalidateQueries({ queryKey: habitLogsKey })
    }
  })
}

export function useToggleHabitLog() {
  const qc = useQueryClient()
  const today = todayStr()
  return useMutation({
    mutationFn: async (habitId: string) => {
      const { data: existing } = await supabase!
        .from('habit_logs')
        .select('id')
        .eq('habit_id', habitId)
        .eq('log_date', today)
        .maybeSingle()
      if (existing) {
        const { error } = await supabase!.from('habit_logs').delete().eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase!
          .from('habit_logs')
          .insert({ habit_id: habitId, log_date: today })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: habitLogsKey })
  })
}
