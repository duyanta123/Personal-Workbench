import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { todayStr } from '../utils/date'
import type { PracticeDifficulty, PracticeProblem, PracticeStatus } from '../types'

export const problemsKey = ['problems']

/** AC 类状态：视为已解决 */
const SOLVED_STATUSES: PracticeStatus[] = ['ac_solo', 'ac_hint']

export function useProblems() {
  return useQuery({
    queryKey: problemsKey,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('practice_problems')
        .select('*')
        .order('solved_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as PracticeProblem[]
    },
    enabled: !!supabase
  })
}

export interface NewProblem {
  title: string
  platform: string
  difficulty: PracticeDifficulty
  status: PracticeStatus
  tags: string[]
  url: string | null
  note: string | null
}

export function useAddProblem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewProblem) => {
      const solved_at = SOLVED_STATUSES.includes(input.status) ? todayStr() : null
      const { data, error } = await supabase!
        .from('practice_problems')
        .insert({ ...input, solved_at })
        .select()
        .single()
      if (error) throw error
      return data as PracticeProblem
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: problemsKey })
  })
}

export function useUpdateProblem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch
    }: {
      id: string
      patch: Partial<Pick<PracticeProblem, 'title' | 'platform' | 'difficulty' | 'status' | 'tags' | 'url' | 'note'>>
    }) => {
      // 状态变化时同步维护 solved_at（进入 AC 置今天，离开 AC 置空）
      let solved_at: string | null | undefined
      if (patch.status !== undefined) {
        solved_at = SOLVED_STATUSES.includes(patch.status) ? todayStr() : null
      }
      const { error } = await supabase!.from('practice_problems').update({ ...patch, solved_at }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: problemsKey })
  })
}

export function useDeleteProblem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('practice_problems').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: problemsKey })
  })
}
