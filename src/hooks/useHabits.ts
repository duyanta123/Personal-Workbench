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
    mutationFn: async (input: { name: string; emoji: string; pinned?: boolean }) => {
      const { data, error } = await supabase!.from('habits').insert(input).select().single()
      if (error) throw error
      return data as Habit
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: habitsKey })
  })
}

/** 批量写入打卡记录（撤销删除习惯时重建历史用） */
export function useAddHabitLogs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: { habit_id: string; log_date: string }[]) => {
      if (rows.length === 0) return
      const { error } = await supabase!.from('habit_logs').insert(rows)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: habitLogsKey })
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

/** 指定日期打卡/取消打卡（补卡也走这里） */
export function useToggleHabitLogDate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ habitId, date }: { habitId: string; date: string }) => {
      const { data: existing } = await supabase!
        .from('habit_logs')
        .select('id')
        .eq('habit_id', habitId)
        .eq('log_date', date)
        .maybeSingle()
      if (existing) {
        const { error } = await supabase!.from('habit_logs').delete().eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase!
          .from('habit_logs')
          .insert({ habit_id: habitId, log_date: date })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: habitLogsKey })
  })
}

export function useToggleHabitLog() {
  const today = todayStr()
  const toggle = useToggleHabitLogDate()
  return {
    ...toggle,
    mutate: (habitId: string) => toggle.mutate({ habitId, date: today })
  }
}

/** 切换置顶 */
export function useToggleHabitPin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase!.from('habits').update({ pinned }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: habitsKey })
  })
}
