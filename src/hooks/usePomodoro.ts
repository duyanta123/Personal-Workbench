import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { enqueueCommand } from '../lib/commands'
import { useAuth } from './useAuth'
import { useCurrentDate } from './useCurrentDate'

export const pomodoroKey = (userId: string | null) => ['pomodoro_sessions', userId] as const

/** 当日番茄钟累计（count 轮数 / minutes 专注分钟） */
export interface PomodoroStats {
  count: number
  minutes: number
}

export function usePomodoroStats(date?: string) {
  const { userId } = useAuth()
  const currentDate = useCurrentDate()
  const today = date ?? currentDate
  return useQuery({
    queryKey: [...pomodoroKey(userId), today],
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('pomodoro_sessions')
        .select('*')
        .eq('date', today)
        .maybeSingle()
      if (error) throw error
      return (data as PomodoroStats | null) ?? { count: 0, minutes: 0 }
    },
    enabled: !!supabase && !!userId
  })
}

/** 原子累计完成的一轮专注，避免读改写竞争。 */
export function useCompletePomodoro() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: { date: string; minutes: number; operationId: string }) => {
      if (!userId) throw new Error('未登录')
      return enqueueCommand(userId, {
        kind: 'pomodoro.create',
        commandId: input.operationId,
        payload: { date: input.date, count: 1, minutes: input.minutes }
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pomodoroKey(userId) })
  })
}
