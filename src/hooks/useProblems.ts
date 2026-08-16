import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createEntity, deleteEntity, updateEntity } from '../lib/domainCommands'
import { todayStr } from '../utils/date'
import { resolveSolvedAt } from '../utils/practiceSolved'
import type { PracticeDifficulty, PracticeProblem, PracticeStatus } from '../types'
import { useAuth } from './useAuth'
import { LIMITS, requireLength, safeExternalUrl, validateTags } from '../utils/validation'
import { rpcArray, rpcNumber, rpcRecord } from '../lib/rpcSchemas'
import { cursorScope, cursorToken, getPageCursor, rememberPageCursor } from '../lib/cursorPagination'

export const problemsKey = (userId: string | null) => ['problems', userId] as const
const linkedProblemKeys = (userId: string | null) => [problemsKey(userId), ['dashboard_summary', userId] as const, ['workbench_insights', userId] as const]
export const PRACTICE_PAGE_SIZE = 50
const practiceCursorScope = (userId: string | null, options: PracticePageOptions) => cursorScope([
  'practice', userId, options.query?.trim().toLowerCase() ?? '',
  options.platform ?? null, options.difficulty ?? null, options.tag ?? null
])
export const practiceListKey = (userId: string | null, options: PracticePageOptions) => [
  ...problemsKey(userId), 'page', options.page ?? 0, options.query?.trim().toLowerCase() ?? '',
  options.platform ?? null, options.difficulty ?? null, options.tag ?? null,
  cursorToken(getPageCursor(practiceCursorScope(userId, options), options.page ?? 0))
] as const

export interface PracticePageOptions {
  page?: number
  query?: string
  platform?: string | null
  difficulty?: PracticeDifficulty | null
  tag?: string | null
}

export interface PracticePage {
  items: PracticeProblem[]
  total: number
}

export function useProblems(options: PracticePageOptions = {}) {
  const { userId } = useAuth()
  const page = Math.max(0, options.page ?? 0)
  const scope = practiceCursorScope(userId, options)
  const cursor = getPageCursor(scope, page)
  return useQuery({
    queryKey: practiceListKey(userId, options),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_practice_page_cursor', {
        p_page_size: PRACTICE_PAGE_SIZE,
        p_query: options.query?.trim() ?? '',
        p_platform: options.platform ?? null,
        p_difficulty: options.difficulty ?? null,
        p_tag: options.tag ?? null,
        p_has_cursor: Boolean(cursor),
        p_after_solved_at: cursor ? String(cursor.solved_at) : null,
        p_after_created_at: cursor ? String(cursor.created_at) : null,
        p_after_id: cursor ? String(cursor.id) : null
      })
      if (error) throw error
      const value = rpcRecord(data, 'practice page')
      const items = rpcArray(value.items, 'practice page.items') as PracticeProblem[]
      const total = rpcNumber(value.total, 'practice page.total')
      const last = items.at(-1)
      rememberPageCursor(scope, page + 1, last ? {
        solved_at: last.solved_at ?? '0001-01-01',
        created_at: last.created_at,
        id: last.id
      } : null)
      return { items, total } as PracticePage
    },
    enabled: !!supabase && !!userId
  })
}

export interface PracticeStats {
  total: number
  ac_count: number
  today_solved: number
  month_solved: number
  streak: number
  difficulty: Record<PracticeDifficulty, number>
  platforms: [string, number][]
  tags: string[]
  heatmap: { date: string; count: number }[]
}

export function usePracticeStats(date: string, month: string) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: [...problemsKey(userId), 'stats', date, month],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_practice_stats', { p_date: date, p_month: month })
      if (error) throw error
      const value = rpcRecord(data, 'practice stats') as unknown as PracticeStats
      rpcNumber(value.total, 'practice stats.total')
      rpcNumber(value.ac_count, 'practice stats.ac_count')
      rpcNumber(value.today_solved, 'practice stats.today_solved')
      rpcNumber(value.month_solved, 'practice stats.month_solved')
      rpcNumber(value.streak, 'practice stats.streak')
      rpcArray(value.heatmap, 'practice stats.heatmap')
      return {
        ...value,
        total: Number(value.total), ac_count: Number(value.ac_count), today_solved: Number(value.today_solved),
        month_solved: Number(value.month_solved), streak: Number(value.streak),
        difficulty: { easy: Number(value.difficulty.easy), medium: Number(value.difficulty.medium), hard: Number(value.difficulty.hard) },
        platforms: (value.platforms ?? []).map(([name, count]) => [name, Number(count)] as [string, number]),
        tags: value.tags ?? [],
        heatmap: (value.heatmap ?? []).map((row) => ({ date: row.date, count: Number(row.count) }))
      }
    },
    enabled: !!supabase && !!userId
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
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: NewProblem) => {
      if (!userId) throw new Error('未登录')
      requireLength(input.title, LIMITS.title, '题目名称', 1)
      requireLength(input.platform, LIMITS.short, '平台', 1)
      validateTags(input.tags)
      safeExternalUrl(input.url)
      if (input.note) requireLength(input.note, LIMITS.body, '解题思路')
      const solved_at =
        input.solved_at !== undefined
          ? input.solved_at
          : resolveSolvedAt(null, input.status, todayStr())
      return createEntity(qc, userId, 'practice', { ...input, solved_at })
    },
    onSuccess: () => linkedProblemKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useUpdateProblem() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const key = problemsKey(userId)
  return useMutation({
    mutationFn: async ({
      id,
      patch
    }: {
      id: string
      patch: Partial<Pick<PracticeProblem, 'title' | 'platform' | 'difficulty' | 'status' | 'tags' | 'url' | 'note'>>
    }) => {
      if (patch.title !== undefined) requireLength(patch.title, LIMITS.title, '题目名称', 1)
      if (patch.platform !== undefined) requireLength(patch.platform, LIMITS.short, '平台', 1)
      if (patch.tags !== undefined) validateTags(patch.tags)
      if (patch.url !== undefined) safeExternalUrl(patch.url)
      if (patch.note) requireLength(patch.note, LIMITS.body, '解题思路')
      // 状态变化时按规则维护 solved_at（AC→AC 保留原日期；进入 AC 置今天；离开 AC 置空）
      let solved_at: string | null | undefined
      if (patch.status !== undefined) {
        let prev = qc.getQueriesData<PracticePage>({ queryKey: key })
          .flatMap(([, page]) => page?.items ?? [])
          .find((problem) => problem.id === id)
        if (!prev) {
          if (navigator.onLine) {
            const { data, error } = await supabase!
              .from('practice_problems')
              .select('*')
              .eq('id', id)
              .maybeSingle()
            if (error) throw error
            prev = data ? data as PracticeProblem : undefined
          }
        }
        if (!prev) throw new Error('题目不存在')
        if (prev.status !== patch.status) {
          solved_at = resolveSolvedAt({ status: prev.status, solved_at: prev.solved_at }, patch.status, todayStr())
        }
      }
      const payload = solved_at === undefined ? patch : { ...patch, solved_at }
      if (!userId) throw new Error('未登录')
      return updateEntity(qc, userId, 'practice', id, payload)
    },
    onSuccess: () => linkedProblemKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useDeleteProblem() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('未登录')
      return deleteEntity(qc, userId, 'practice', id)
    },
    onSuccess: () => linkedProblemKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}
