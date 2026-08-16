import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createEntity, deleteEntity, updateEntity } from '../lib/domainCommands'
import { afterCursor, cursorScope, cursorToken, getPageCursor, rememberPageCursor } from '../lib/cursorPagination'
import type { Goal } from '../types'
import { useAuth } from './useAuth'

export const goalsKey = (userId: string | null) => ['goals', userId] as const
export const GOALS_PAGE_SIZE = 50
const goalsCursorScope = (userId: string | null) => cursorScope(['goals', userId])
const goalsOrder = [
  { column: 'pinned', direction: 'desc' as const },
  { column: 'created_at', direction: 'asc' as const },
  { column: 'id', direction: 'asc' as const }
] as const
export const goalsListKey = (userId: string | null, page: number) => [
  ...goalsKey(userId), 'page', page, cursorToken(getPageCursor(goalsCursorScope(userId), page))
] as const

export interface GoalPage {
  items: Goal[]
  total: number
}

function linkedGoalKeys(userId: string | null) {
  return [
    goalsKey(userId),
    ['focus_items', userId] as const,
    ['dashboard_summary', userId] as const,
    ['workbench_insights', userId] as const
  ]
}

export function useGoals(page = 0) {
  const { userId } = useAuth()
  const scope = goalsCursorScope(userId)
  const cursor = getPageCursor(scope, page)
  return useQuery({
    queryKey: goalsListKey(userId, page),
    queryFn: async () => {
      let request = supabase!
        .from('goals')
        .select('*')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      if (cursor) request = request.or(afterCursor(cursor, goalsOrder))
      const [rowsResult, countResult] = await Promise.all([
        request.limit(GOALS_PAGE_SIZE),
        supabase!.from('goals').select('id', { count: 'exact', head: true })
      ])
      const { data, error } = rowsResult
      const { count, error: countError } = countResult
      if (error) throw error
      if (countError) throw countError
      const items = (data ?? []) as Goal[]
      const last = items.at(-1)
      rememberPageCursor(scope, page + 1, last ? {
        pinned: last.pinned,
        created_at: last.created_at,
        id: last.id
      } : null)
      return { items, total: count ?? 0 } as GoalPage
    },
    enabled: !!supabase && !!userId
  })
}

export function useAddGoal() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      name: string
      emoji: string
      current: number
      target: number
      unit: string | null
      note?: string | null
      pinned?: boolean
    }) => {
      if (!userId) throw new Error('未登录')
      return createEntity(qc, userId, 'goal', input)
    },
    onSuccess: () => linkedGoalKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useIncrementGoal() {
  const adjust = useAdjustGoal()
  return {
    ...adjust,
    mutate: (id: string) => adjust.mutate({ id, delta: 1 }),
    mutateAsync: (id: string) => adjust.mutateAsync({ id, delta: 1 })
  }
}

export function useAdjustGoal() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: number }) => {
      if (!userId) throw new Error('未登录')
      const current = qc.getQueriesData<GoalPage>({ queryKey: goalsKey(userId) }).flatMap(([,page]) => page?.items ?? []).find((goal) => goal.id === id)
      if (!current) throw new Error('目标尚未缓存，无法离线调整')
      return updateEntity(qc, userId, 'goal', id, { current: Math.min(current.target, Math.max(0, current.current + delta)) })
    },
    onSuccess: () => linkedGoalKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useUpdateGoal() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Goal, 'name' | 'emoji' | 'current' | 'target' | 'unit' | 'note' | 'pinned'>> }) => {
      if (!userId) throw new Error('未登录')
      return updateEntity(qc, userId, 'goal', id, patch)
    },
    onSuccess: () => linkedGoalKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('未登录')
      return deleteEntity(qc, userId, 'goal', id)
    },
    onSuccess: () => linkedGoalKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

/** 切换置顶 */
export function useToggleGoalPin() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      if (!userId) throw new Error('未登录')
      return updateEntity(qc, userId, 'goal', id, { pinned })
    },
    onSuccess: () => linkedGoalKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}
