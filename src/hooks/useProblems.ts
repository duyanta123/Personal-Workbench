import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { todayStr } from '../utils/date'
import { resolveSolvedAt } from '../utils/practiceSolved'
import type { PracticeDifficulty, PracticeProblem, PracticeStatus } from '../types'

export const problemsKey = ['problems']

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
  /** 编辑时传 undefined 表示保留原值 */
  note?: string | null
  /** 撤销恢复时传入原 solved_at，保留历史 AC 日期 */
  solved_at?: string | null
}

export function useAddProblem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewProblem) => {
      const solved_at =
        input.solved_at !== undefined
          ? input.solved_at
          : resolveSolvedAt(null, input.status, todayStr())
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
      // 状态变化时按规则维护 solved_at（AC→AC 保留原日期；进入 AC 置今天；离开 AC 置空）
      let solved_at: string | null | undefined
      if (patch.status !== undefined) {
        const prev = qc
          .getQueryData<PracticeProblem[]>(problemsKey)
          ?.find((p) => p.id === id)
        solved_at = resolveSolvedAt(
          prev ? { status: prev.status, solved_at: prev.solved_at } : null,
          patch.status,
          todayStr()
        )
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
