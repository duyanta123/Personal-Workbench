import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Goal, Habit, Todo } from '../types'
import { useAuth } from './useAuth'
import { rpcArray, rpcRecord } from '../lib/rpcSchemas'

export interface FocusHabit extends Habit {
  done_today: boolean
}

export interface FocusItems {
  todos: Todo[]
  habits: FocusHabit[]
  goals: Goal[]
}

export const focusItemsKey = (userId: string | null, date: string) => ['focus_items', userId, date] as const

export function useFocusItems(date: string) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: focusItemsKey(userId, date),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_focus_items', { p_date: date, p_limit: 20 })
      if (error) throw error
      const value = rpcRecord(data, 'focus items')
      rpcArray(value.todos, 'focus items.todos')
      rpcArray(value.habits, 'focus items.habits')
      rpcArray(value.goals, 'focus items.goals')
      return value as unknown as FocusItems
    },
    enabled: !!supabase && !!userId
  })
}
