import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { rpcRecord } from '../lib/rpcSchemas'
import type { Json } from '../lib/database.types'
import type { Habit, HabitLog, InboxItem, LedgerEntry, Todo } from '../types'
import { createEntity } from '../lib/domainCommands'

export interface TodayWorkspace {
  inbox: InboxItem[]
  todos: Todo[]
  habits: Habit[]
  habit_logs: HabitLog[]
  planned_ledger: LedgerEntry[]
}

export function useTodayWorkspace(date: string) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: ['today_workspace', userId, date],
    queryFn: async (): Promise<TodayWorkspace> => {
      const { data, error } = await supabase!.rpc('get_today_workspace', { p_date: date, p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai' })
      if (error) throw error
      const value = rpcRecord(data, 'today workspace')
      return {
        inbox: (Array.isArray(value.inbox) ? value.inbox : []) as InboxItem[],
        todos: (Array.isArray(value.todos) ? value.todos : []) as Todo[],
        habits: (Array.isArray(value.habits) ? value.habits : []) as Habit[],
        habit_logs: (Array.isArray(value.habit_logs) ? value.habit_logs : []) as HabitLog[],
        planned_ledger: (Array.isArray(value.planned_ledger) ? value.planned_ledger : []) as LedgerEntry[]
      }
    },
    enabled: !!supabase && !!userId,
    staleTime: 15_000
  })
}

/**
 * Full Inbox query used by the Dashboard's "view all" state. The Today RPC
 * intentionally caps its payload so the home page stays small; opening the
 * Inbox focus loads the complete pending list on demand.
 */
export function useInboxItems(enabled = true) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: ['inbox_items', userId, 'pending'] as const,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('inbox_items')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as InboxItem[]
    },
    enabled: !!supabase && !!userId && enabled,
    staleTime: 15_000
  })
}

export function useAddInboxItem() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: { raw_text: string; source?: 'quick_capture' | 'share_target' | 'manual'; parsed_candidates?: unknown[]; suggested_kind?: string | null; commandId?: string; entityId?: string }) => {
      if (!userId) throw new Error('未登录')
      return createEntity(qc, userId, 'inbox', {
        raw_text: input.raw_text,
        source: input.source ?? 'manual',
        parsed_candidates: input.parsed_candidates ?? [],
        suggested_kind: input.suggested_kind ?? null,
        status: 'pending'
      }, { commandId: input.commandId, entityId: input.entityId })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['today_workspace', userId] })
      void qc.invalidateQueries({ queryKey: ['inbox_items', userId] })
    }
  })
}

export type InboxRouteKind = 'todo' | 'ledger' | 'note' | 'habit' | 'goal' | 'practice' | 'workout'

export function useRouteInboxItem() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      itemId: string
      kind: InboxRouteKind
      payload: Record<string, unknown>
      commandId: string
      targetId: string
    }) => {
      if (!userId) throw new Error('未登录')
      if (!navigator.onLine) throw new Error('分流需要联网完成原子事务')
      const { data, error } = await supabase!.rpc('route_inbox_item', {
        p_command_id: input.commandId,
        p_item_id: input.itemId,
        p_kind: input.kind,
        p_payload: input.payload as Json,
        p_target_id: input.targetId
      })
      if (error) throw error
      const result = rpcRecord(data, 'inbox route result')
      if (!['applied', 'duplicate'].includes(String(result.status))) {
        throw new Error(typeof result.message === 'string' ? result.message : '分流失败')
      }
      return result
    },
    onSuccess: async (_result, input) => {
      const key = input.kind === 'practice' ? 'practice_problems' : input.kind === 'workout' ? 'workout_sessions' : `${input.kind}s`
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['today_workspace', userId] }),
        qc.invalidateQueries({ queryKey: ['inbox_items', userId] }),
        qc.invalidateQueries({ queryKey: [key, userId] }),
        qc.invalidateQueries({ queryKey: ['dashboard_summary', userId] })
      ])
    }
  })
}
