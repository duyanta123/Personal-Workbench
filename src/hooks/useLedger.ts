import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { enqueueOperation } from '../lib/outbox'
import { afterCursor, cursorScope, cursorToken, getPageCursor, rememberPageCursor } from '../lib/cursorPagination'
import type { LedgerEntry } from '../types'
import { useAuth } from './useAuth'

export const LEDGER_PAGE_SIZE = 50
export const ledgerKey = (userId: string | null) => ['ledger_entries', userId] as const
const linkedLedgerKeys = (userId: string | null) => [ledgerKey(userId), ['dashboard_summary', userId] as const, ['workbench_insights', userId] as const]
const ledgerCursorScope = (userId: string | null, query: string) => cursorScope(['ledger', userId, query.trim().toLowerCase()])
const ledgerOrder = [
  { column: 'entry_date', direction: 'desc' as const },
  { column: 'created_at', direction: 'desc' as const },
  { column: 'id', direction: 'desc' as const }
] as const
export const ledgerListKey = (userId: string | null, page: number, query = '') => [
  ...ledgerKey(userId),
  'page',
  page,
  query.trim().toLowerCase(),
  cursorToken(getPageCursor(ledgerCursorScope(userId, query), page))
] as const

export interface LedgerPage {
  items: LedgerEntry[]
  total: number
}

function ilikePattern(query: string) {
  // PostgREST OR expressions use a quoted value; escape syntax characters first.
  const escaped = query.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/\*/g, '\\*')
  return `"%${escaped}%"`
}

export function useLedgerEntries(options: { page?: number; query?: string } = {}) {
  const { userId } = useAuth()
  const page = options.page ?? 0
  const query = options.query?.trim() ?? ''
  const scope = ledgerCursorScope(userId, query)
  const cursor = getPageCursor(scope, page)
  return useQuery({
    queryKey: ledgerListKey(userId, page, query),
    queryFn: async (): Promise<LedgerPage> => {
      let request = supabase!
        .from('ledger_entries')
        .select('*')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
      const search = query ? `category.ilike.${ilikePattern(query)},note.ilike.${ilikePattern(query)}` : null
      if (search && cursor) request = request.or(afterCursor(cursor, ledgerOrder, search))
      else if (search) request = request.or(search)
      else if (cursor) request = request.or(afterCursor(cursor, ledgerOrder))
      let countRequest = supabase!.from('ledger_entries').select('id', { count: 'exact', head: true })
      if (search) countRequest = countRequest.or(search)
      const [rowsResult, countResult] = await Promise.all([
        request.limit(LEDGER_PAGE_SIZE),
        countRequest
      ])
      const { data, error } = rowsResult
      const { count, error: countError } = countResult
      if (error) throw error
      if (countError) throw countError
      const items = (data ?? []) as LedgerEntry[]
      const last = items.at(-1)
      rememberPageCursor(scope, page + 1, last ? {
        entry_date: last.entry_date,
        created_at: last.created_at,
        id: last.id
      } : null)
      return { items, total: count ?? 0 }
    },
    enabled: !!supabase && !!userId
  })
}

export interface LedgerSummary {
  total: number
  income: number
  expense: number
  dailyExpense: { date: string; total: number }[]
  categoryExpense: [string, number][]
}

export function useLedgerSummary(month: string) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: [...ledgerKey(userId), 'summary', month] as const,
    queryFn: async (): Promise<LedgerSummary> => {
      const { data, error } = await supabase!.rpc('get_ledger_summary', { p_month: month })
      if (error) throw error
      const value = data as {
        total?: number; income?: number; expense?: number
        daily_expense?: { date: string; total: number }[]
        category_expense?: [string, number][]
      }
      return {
        total: Number(value.total ?? 0),
        income: Number(value.income ?? 0),
        expense: Number(value.expense ?? 0),
        dailyExpense: (value.daily_expense ?? []).map((row) => ({ date: row.date, total: Number(row.total) })),
        categoryExpense: (value.category_expense ?? []).map(([category, total]) => [category, Number(total)])
      }
    },
    enabled: !!supabase && !!userId
  })
}

export function useLedgerEntryById(id: string | null) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: [...ledgerKey(userId), 'focus', id],
    queryFn: async () => {
      const { data, error } = await supabase!.from('ledger_entries').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as LedgerEntry | null
    },
    enabled: !!supabase && !!userId && !!id
  })
}

export interface NewLedgerEntry {
  kind: LedgerEntry['kind']
  category: string
  amount: number
  note: string | null
  entry_date: string
}

export function useAddLedgerEntry() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: NewLedgerEntry) => {
      if (!userId) throw new Error('未登录')
      return enqueueOperation<LedgerEntry>(userId, 'ledger.create', { ...input })
    },
    onSuccess: () => linkedLedgerKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

/** 编辑账单 */
export function useUpdateLedgerEntry() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewLedgerEntry> }) => {
      const { error } = await supabase!.from('ledger_entries').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => linkedLedgerKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useDeleteLedgerEntry() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('ledger_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => linkedLedgerKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}
