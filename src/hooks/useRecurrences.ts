import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createEntity, deleteEntity, updateEntity } from '../lib/domainCommands'
import type { RecurrenceEntityType, RecurrenceRule } from '../types'
import { useAuth } from './useAuth'
import { useCurrentDate } from './useCurrentDate'
import { useOnline } from './useOnline'

export const recurrenceRulesKey = (userId: string | null, entityType?: RecurrenceEntityType) => ['recurrence_rules', userId, entityType ?? 'all'] as const

export interface RecurrenceRuleInput {
  entity_type: RecurrenceEntityType
  frequency: RecurrenceRule['frequency']
  interval_count: number
  weekdays: number[]
  month_day: number | null
  start_date: string
  end_date: string | null
  timezone: string
  local_time: string | null
  enabled: boolean
  generation_mode: RecurrenceRule['generation_mode']
  template: Record<string, unknown>
}

export interface LedgerRecurrenceSuggestion {
  key: string
  frequency: 'weekly' | 'monthly'
  occurrences: number
  start_date: string
  weekdays: number[]
  month_day: number | null
  template: Record<string, unknown>
}

export function useLedgerRecurrenceSuggestions(today: string, enabled = true) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: ['ledger_recurrence_suggestions', userId, today],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('suggest_ledger_recurrences', { p_today: today })
      if (error) throw error
      return (Array.isArray(data) ? data : []) as unknown as LedgerRecurrenceSuggestion[]
    },
    enabled: !!supabase && !!userId && enabled
  })
}

function validateRule(input: RecurrenceRuleInput) {
  if (!['todo', 'ledger'].includes(input.entity_type)) throw new Error('不支持的周期类型')
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(input.frequency)) throw new Error('周期频率无效')
  if (!Number.isInteger(input.interval_count) || input.interval_count < 1 || input.interval_count > 365) throw new Error('周期间隔应为 1 到 365')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) throw new Error('开始日期无效')
  if (input.end_date && input.end_date < input.start_date) throw new Error('结束日期不能早于开始日期')
  if (input.month_day !== null && (!Number.isInteger(input.month_day) || input.month_day < 1 || input.month_day > 31)) throw new Error('月日期应为 1 到 31')
  if (input.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('星期设置无效')
  try { new Intl.DateTimeFormat('zh-CN', { timeZone: input.timezone }).format() } catch { throw new Error('时区无效') }
  if (input.entity_type === 'todo' && !String(input.template.text ?? '').trim()) throw new Error('请填写待办内容')
  if (input.entity_type === 'ledger') {
    if (!String(input.template.category ?? '').trim()) throw new Error('请填写账目分类')
    if (!Number.isSafeInteger(Number(input.template.amount_minor)) || Number(input.template.amount_minor) <= 0) throw new Error('账目金额必须大于 0')
  }
  return { ...input, weekdays: [...new Set(input.weekdays)].sort((a, b) => a - b) }
}

export async function materializeRecurrences(qc: QueryClient, userId: string, today: string) {
  if (!navigator.onLine || !supabase) return null
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  const { data, error } = await supabase.rpc('materialize_recurrences', { p_today: today, p_timezone: timezone })
  if (error) throw error
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['todos', userId] }),
    qc.invalidateQueries({ queryKey: ['ledger_entries', userId] }),
    qc.invalidateQueries({ queryKey: ['today_workspace', userId] }),
    qc.invalidateQueries({ queryKey: ['dashboard_summary', userId] })
  ])
  return data
}

export function useRecurrenceRules(entityType?: RecurrenceEntityType) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: recurrenceRulesKey(userId, entityType),
    queryFn: async () => {
      let request = supabase!.from('recurrence_rules').select('*').order('created_at', { ascending: true })
      if (entityType) request = request.eq('entity_type', entityType)
      const { data, error } = await request
      if (error) throw error
      return data as RecurrenceRule[]
    },
    enabled: !!supabase && !!userId
  })
}

function useRuleInvalidation() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const today = useCurrentDate()
  return async () => {
    await qc.invalidateQueries({ queryKey: ['recurrence_rules', userId] })
    if (userId && navigator.onLine) await materializeRecurrences(qc, userId, today)
  }
}

export function useAddRecurrenceRule() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const invalidate = useRuleInvalidation()
  return useMutation({
    mutationFn: async (input: RecurrenceRuleInput) => {
      if (!userId) throw new Error('未登录')
      return createEntity(qc, userId, 'recurrence', validateRule(input))
    },
    onSuccess: invalidate
  })
}

export function useUpdateRecurrenceRule() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const invalidate = useRuleInvalidation()
  return useMutation({
    mutationFn: async ({ id, patch, current }: { id: string; patch: Partial<RecurrenceRuleInput>; current: RecurrenceRule }) => {
      if (!userId) throw new Error('未登录')
      const validated = validateRule({
        entity_type: current.entity_type, frequency: current.frequency, interval_count: current.interval_count,
        weekdays: current.weekdays, month_day: current.month_day, start_date: current.start_date, end_date: current.end_date,
        timezone: current.timezone, local_time: current.local_time, enabled: current.enabled,
        generation_mode: current.generation_mode, template: current.template, ...patch
      })
      return updateEntity(qc, userId, 'recurrence', id, validated)
    },
    onSuccess: invalidate
  })
}

export function useDeleteRecurrenceRule() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const invalidate = useRuleInvalidation()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('未登录')
      return deleteEntity(qc, userId, 'recurrence', id)
    },
    onSuccess: invalidate
  })
}

export function useRecurrenceMaterialization() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const today = useCurrentDate()
  const online = useOnline()
  const running = useRef<Promise<unknown> | null>(null)
  const run = useCallback(() => {
    if (!userId || !online || running.current) return
    running.current = materializeRecurrences(qc, userId, today).catch(() => null).finally(() => { running.current = null })
  }, [online, qc, today, userId])

  useEffect(() => {
    run()
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    window.addEventListener('focus', run)
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', run)
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [run])
}
