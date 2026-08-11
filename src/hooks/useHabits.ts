import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { enqueueOperation } from '../lib/outbox'
import { afterCursor, cursorScope, cursorToken, getPageCursor, rememberPageCursor } from '../lib/cursorPagination'
import type { Habit, HabitLog } from '../types'
import { useAuth } from './useAuth'
import { useCurrentDate } from './useCurrentDate'
import { rpcArray, rpcNumber, rpcRecord } from '../lib/rpcSchemas'

export const habitsKey = (userId: string | null) => ['habits', userId] as const
export const habitLogsKey = (userId: string | null) => ['habit_logs', userId] as const
export const HABITS_PAGE_SIZE = 50
const habitsCursorScope = (userId: string | null, query: string) => cursorScope(['habits', userId, query.trim().toLowerCase()])
const habitsOrder = [
  { column: 'pinned', direction: 'desc' as const },
  { column: 'created_at', direction: 'asc' as const },
  { column: 'id', direction: 'asc' as const }
] as const
export const habitsListKey = (userId: string | null, page: number, query = '') => [
  ...habitsKey(userId), 'page', page, query.trim().toLowerCase(),
  cursorToken(getPageCursor(habitsCursorScope(userId, query), page))
] as const

export interface HabitPage {
  items: Habit[]
  total: number
}

function linkedHabitKeys(userId: string | null) {
  return [
    habitsKey(userId),
    habitLogsKey(userId),
    ['dashboard_summary', userId] as const,
    ['workbench_insights', userId] as const,
    ['focus_items', userId] as const
  ]
}

function dateMinus(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() - days)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function useHabits(page = 0, query = '') {
  const { userId } = useAuth()
  const scope = habitsCursorScope(userId, query)
  const cursor = getPageCursor(scope, page)
  return useQuery({
    queryKey: habitsListKey(userId, page, query),
    queryFn: async () => {
      let request = supabase!
        .from('habits')
        .select('*')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      const pattern = query.trim()
        ? `%${query.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/\*/g, '\\*')}%`
        : null
      if (pattern) {
        request = request.ilike('name', pattern)
      }
      if (cursor) request = request.or(afterCursor(cursor, habitsOrder))
      let countRequest = supabase!.from('habits').select('id', { count: 'exact', head: true })
      if (pattern) countRequest = countRequest.ilike('name', pattern)
      const [rowsResult, countResult] = await Promise.all([
        request.limit(HABITS_PAGE_SIZE),
        countRequest
      ])
      const { data, error } = rowsResult
      const { count, error: countError } = countResult
      if (error) throw error
      if (countError) throw countError
      const items = (data ?? []) as Habit[]
      const last = items.at(-1)
      rememberPageCursor(scope, page + 1, last ? {
        pinned: last.pinned,
        created_at: last.created_at,
        id: last.id
      } : null)
      return { items, total: count ?? 0 } as HabitPage
    },
    enabled: !!supabase && !!userId
  })
}

export function useHabitLogs() {
  const { userId } = useAuth()
  const today = useCurrentDate()
  const start = [today.slice(0, 7) + '-01', dateMinus(today, 6)].sort()[0]
  return useQuery({
    queryKey: [...habitLogsKey(userId), start, today],
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('habit_logs')
        .select('*')
        .gte('log_date', start)
        .lte('log_date', today)
        .order('log_date', { ascending: true })
        .order('id', { ascending: true })
      if (error) throw error
      return data as HabitLog[]
    },
    enabled: !!supabase && !!userId
  })
}

export function useAddHabit() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: { name: string; emoji: string; pinned?: boolean }) => {
      if (!userId) throw new Error('未登录')
      return enqueueOperation<Habit>(userId, 'habit.create', input)
    },
    onSuccess: () => linkedHabitKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useDeleteHabit() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('habits').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      linkedHabitKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
    }
  })
}

/** 指定日期打卡/取消打卡（补卡也走这里） */
export function useToggleHabitLogDate() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const pendingRef = useRef(new Set<string>())
  const [pending, setPending] = useState<Set<string>>(() => new Set())
  const mutation = useMutation({
    mutationFn: async ({ habitId, date, done }: { habitId: string; date: string; done?: boolean }) => {
      if (!userId) throw new Error('未登录')
      const pendingKey = `${habitId}:${date}`
      if (pendingRef.current.has(pendingKey)) return
      pendingRef.current.add(pendingKey)
      setPending(new Set(pendingRef.current))
      try {
        const cached = qc
          .getQueriesData<HabitLog[]>({ queryKey: habitLogsKey(userId) })
          .some(([, logs]) => logs?.some((log) => log.habit_id === habitId && log.log_date === date))
        const { error } = await supabase!.rpc('set_habit_log', {
          p_habit_id: habitId,
          p_log_date: date,
          p_done: done ?? !cached
        })
        if (error) throw error
      } finally {
        pendingRef.current.delete(pendingKey)
        setPending(new Set(pendingRef.current))
      }
    },
    onSuccess: () => linkedHabitKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
  return {
    ...mutation,
    pending,
    isPendingFor: (habitId: string, date: string) => pending.has(`${habitId}:${date}`)
  }
}

export function useToggleHabitLog() {
  const today = useCurrentDate()
  const toggle = useToggleHabitLogDate()
  return {
    ...toggle,
    mutate: (habitId: string) => toggle.mutate({ habitId, date: today })
  }
}

/** 切换置顶 */
export function useToggleHabitPin() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase!.from('habits').update({ pinned }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => linkedHabitKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useUpdateHabit() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Habit, 'name' | 'emoji' | 'pinned'>> }) => {
      const { error } = await supabase!.from('habits').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => linkedHabitKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export interface HabitStats {
  month_logged_days: number
  streaks: { habit_id: string; name: string; emoji: string; streak: number }[]
}

export function useHabitStats(date: string) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: [...habitsKey(userId), 'stats', date],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_habit_stats', { p_date: date })
      if (error) throw error
      const value = rpcRecord(data, 'habit stats')
      rpcNumber(value.month_logged_days, 'habit stats.month_logged_days')
      rpcArray(value.streaks, 'habit stats.streaks')
      return value as unknown as HabitStats
    },
    enabled: !!supabase && !!userId
  })
}
