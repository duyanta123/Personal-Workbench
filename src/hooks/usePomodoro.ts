import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { todayStr } from '../utils/date'
import type { PomodoroSession } from '../types'

export const pomodoroKey = ['pomodoro_sessions']

/** 当日番茄钟累计（count 轮数 / minutes 专注分钟） */
export function usePomodoroStats() {
  return useQuery({
    queryKey: [...pomodoroKey, todayStr()],
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('pomodoro_sessions')
        .select('*')
        .eq('date', todayStr())
        .maybeSingle()
      if (error) throw error
      return (data as PomodoroSession | null) ?? { count: 0, minutes: 0 }
    },
    enabled: !!supabase
  })
}

/** 写入当日番茄钟累计（按 user_id + date upsert） */
export function useSavePomodoro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { count: number; minutes: number }) => {
      const { error } = await supabase!
        .from('pomodoro_sessions')
        .upsert(
          { date: todayStr(), count: input.count, minutes: input.minutes },
          { onConflict: 'user_id,date' }
        )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pomodoroKey })
  })
}
