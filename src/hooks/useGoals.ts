import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Goal } from '../types'

export const goalsKey = ['goals']

export function useGoals() {
  return useQuery({
    queryKey: goalsKey,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('goals')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Goal[]
    },
    enabled: !!supabase
  })
}

export function useAddGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      emoji: string
      current: number
      target: number
      unit: string | null
      pinned?: boolean
    }) => {
      const { data, error } = await supabase!.from('goals').insert(input).select().single()
      if (error) throw error
      return data as Goal
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: goalsKey })
  })
}

export function useIncrementGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.rpc('increment_goal', { goal_id: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: goalsKey })
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('goals').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: goalsKey })
  })
}

/** 切换置顶 */
export function useToggleGoalPin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase!.from('goals').update({ pinned }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: goalsKey })
  })
}
