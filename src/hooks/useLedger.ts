import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createEntity, deleteEntity, updateEntity } from '../lib/domainCommands'
import { afterCursor, cursorScope, cursorToken, getPageCursor, rememberPageCursor } from '../lib/cursorPagination'
import type { LedgerAccount, LedgerEntry, LedgerPayee, LedgerReconciliation, LedgerRule, LedgerSplit } from '../types'
import { useAuth } from './useAuth'
import { validateLedgerCreate } from '../utils/createValidation'
import { parseMoneyToMinor } from '../utils/money'
import { refreshSyncState } from '../lib/outbox'
import type { Json } from '../lib/database.types'
import { rpcRecord } from '../lib/rpcSchemas'

export const LEDGER_PAGE_SIZE = 50
export const ledgerKey = (userId: string | null) => ['ledger_entries', userId] as const
const linkedLedgerKeys = (userId: string | null) => [ledgerKey(userId), ['dashboard_summary', userId] as const, ['today_workspace', userId] as const, ['workbench_insights', userId] as const]
export type LedgerSortColumn = 'entry_date' | 'amount_minor' | 'category' | 'created_at'
export interface LedgerSort {
  column: LedgerSortColumn
  direction: 'asc' | 'desc'
}
export interface LedgerListFilters {
  kind?: LedgerEntry['kind']
  category?: string
  accountId?: string
  status?: LedgerEntry['status']
  dateFrom?: string
  dateTo?: string
}

const DEFAULT_LEDGER_SORT: LedgerSort = { column: 'entry_date', direction: 'desc' }
const ledgerCursorScope = (userId: string | null, query: string, filters: LedgerListFilters, sort: LedgerSort) =>
  cursorScope(['ledger', userId, query.trim().toLowerCase(), filters, sort])
function ledgerOrder(sort: LedgerSort) {
  return [
    { column: sort.column, direction: sort.direction },
    { column: sort.column === 'entry_date' ? 'created_at' : 'entry_date', direction: 'desc' as const },
    { column: 'id', direction: 'desc' as const }
  ] as const
}
export const ledgerListKey = (userId: string | null, page: number, query = '', filters: LedgerListFilters = {}, sort: LedgerSort = DEFAULT_LEDGER_SORT) => [
  ...ledgerKey(userId),
  'page',
  page,
  query.trim().toLowerCase(),
  filters,
  sort,
  cursorToken(getPageCursor(ledgerCursorScope(userId, query, filters, sort), page))
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

export function useLedgerEntries(options: { page?: number; query?: string; filters?: LedgerListFilters; sort?: LedgerSort } = {}) {
  const { userId } = useAuth()
  const page = options.page ?? 0
  const query = options.query?.trim() ?? ''
  const filters = options.filters ?? {}
  const sort = options.sort ?? DEFAULT_LEDGER_SORT
  const scope = ledgerCursorScope(userId, query, filters, sort)
  const cursor = getPageCursor(scope, page)
  return useQuery({
    queryKey: ledgerListKey(userId, page, query, filters, sort),
    queryFn: async (): Promise<LedgerPage> => {
      let request = supabase!
        .from('ledger_entries')
        .select('*')
      const order = ledgerOrder(sort)
      for (const field of order) request = request.order(field.column, { ascending: field.direction === 'asc' })
      const search = query ? `category.ilike.${ilikePattern(query)},note.ilike.${ilikePattern(query)}` : null
      if (filters.kind) request = request.eq('kind', filters.kind)
      if (filters.category) request = request.eq('category', filters.category)
      if (filters.accountId) request = request.eq('account_id', filters.accountId)
      if (filters.status) request = request.eq('status', filters.status)
      if (filters.dateFrom) request = request.gte('entry_date', filters.dateFrom)
      if (filters.dateTo) request = request.lte('entry_date', filters.dateTo)
      if (search && cursor) request = request.or(afterCursor(cursor, order, search))
      else if (search) request = request.or(search)
      else if (cursor) request = request.or(afterCursor(cursor, order))
      let countRequest = supabase!.from('ledger_entries').select('id', { count: 'exact', head: true })
      if (filters.kind) countRequest = countRequest.eq('kind', filters.kind)
      if (filters.category) countRequest = countRequest.eq('category', filters.category)
      if (filters.accountId) countRequest = countRequest.eq('account_id', filters.accountId)
      if (filters.status) countRequest = countRequest.eq('status', filters.status)
      if (filters.dateFrom) countRequest = countRequest.gte('entry_date', filters.dateFrom)
      if (filters.dateTo) countRequest = countRequest.lte('entry_date', filters.dateTo)
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
        [order[0].column]: last[order[0].column as keyof LedgerEntry] as string | number,
        [order[1].column]: last[order[1].column as keyof LedgerEntry] as string | number,
        id: last.id
      } : null)
      return { items, total: count ?? 0 }
    },
    enabled: !!supabase && !!userId
  })
}

export interface LedgerSummary {
  total: number
  incomeMinor: number
  expenseMinor: number
  dailyExpenseMinor: { date: string; totalMinor: number }[]
  categoryExpenseMinor: [string, number][]
  upcoming: LedgerEntry[]
}

export function useLedgerSummary(month: string) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: [...ledgerKey(userId), 'summary', month] as const,
    queryFn: async (): Promise<LedgerSummary> => {
      const { data, error } = await supabase!.rpc('get_ledger_summary', { p_month: month })
      if (error) throw error
      const value = data as {
        total?: number; income_minor?: number; expense_minor?: number
        daily_expense_minor?: { date: string; total_minor: number }[]
        category_expense_minor?: [string, number][]; upcoming?: LedgerEntry[]
      }
      return {
        total: Number(value.total ?? 0),
        incomeMinor: Number(value.income_minor ?? 0), expenseMinor: Number(value.expense_minor ?? 0),
        dailyExpenseMinor: (value.daily_expense_minor ?? []).map((row) => ({ date: row.date, totalMinor: Number(row.total_minor) })),
        categoryExpenseMinor: (value.category_expense_minor ?? []).map(([category, total]) => [category, Number(total)]),
        upcoming: value.upcoming ?? []
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
  amount: number | string
  note: string | null
  entry_date: string
  account_id?: string | null
  payee_id?: string | null
  currency_code?: LedgerEntry['currency_code']
  status?: LedgerEntry['status']
}

export function useAddLedgerEntry() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: NewLedgerEntry) => {
      if (!userId) throw new Error('未登录')
      const payload = validateLedgerCreate({ ...input, amount: Number(input.amount) })
      // 只写 amount_minor；旧 amount 字段由服务端触发器从 minor 派生。
      return createEntity(qc, userId, 'ledger', {
        kind: payload.kind,
        category: payload.category,
        note: payload.note,
        entry_date: payload.entry_date,
        account_id: input.account_id ?? null,
        payee_id: input.payee_id ?? null,
        amount_minor: parseMoneyToMinor(input.amount),
        currency_code: input.currency_code ?? 'CNY',
        status: input.status ?? 'posted'
      })
    },
    onSuccess: () => linkedLedgerKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

const automationKeys = (userId: string | null) => [
  ['ledger_accounts', userId], ['ledger_payees', userId], ['ledger_rules', userId], ['ledger_reconciliations', userId]
] as const

function useLedgerCollection<T>(table: string, key: string) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: [key, userId],
    queryFn: async () => {
      const { data, error } = await supabase!.from(table).select('*').order('created_at', { ascending: true })
      if (error) throw error
      return data as T[]
    },
    enabled: !!supabase && !!userId
  })
}

export const useLedgerAccounts = () => useLedgerCollection<LedgerAccount>('ledger_accounts', 'ledger_accounts')
export const useLedgerPayees = () => useLedgerCollection<LedgerPayee>('ledger_payees', 'ledger_payees')
export const useLedgerRules = () => useLedgerCollection<LedgerRule>('ledger_rules', 'ledger_rules')
export const useLedgerReconciliations = () => useLedgerCollection<LedgerReconciliation>('ledger_reconciliations', 'ledger_reconciliations')

function useCreateLedgerEntity(kind: 'ledger_account' | 'ledger_payee' | 'ledger_rule') {
  const qc = useQueryClient(); const { userId } = useAuth()
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!userId) throw new Error('未登录')
      return createEntity(qc, userId, kind, payload)
    },
    onSuccess: () => automationKeys(userId).forEach((key) => qc.invalidateQueries({ queryKey: key }))
  })
}

export const useAddLedgerAccount = () => useCreateLedgerEntity('ledger_account')
export const useAddLedgerPayee = () => useCreateLedgerEntity('ledger_payee')
export const useAddLedgerRule = () => useCreateLedgerEntity('ledger_rule')

export function useCreateLedgerTransaction() {
  const qc = useQueryClient(); const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: { entry: NewLedgerEntry; splits: Array<Pick<LedgerSplit, 'category' | 'amount_minor' | 'note'>>; commandId?: string; entryId?: string }) => {
      if (!userId) throw new Error('未登录')
      if (!navigator.onLine) throw new Error('拆分账目需要联网提交')
      const sync = await refreshSyncState(userId)
      const entryId = input.entryId ?? crypto.randomUUID()
      const commandId = input.commandId ?? crypto.randomUUID()
      const amountMinor = parseMoneyToMinor(input.entry.amount)
      const { data, error } = await supabase!.rpc('create_ledger_transaction', {
        p_command_id: commandId, p_restore_epoch: sync.restore_epoch, p_entry_id: entryId,
        p_entry: { ...input.entry, amount: undefined, amount_minor: amountMinor, currency_code: input.entry.currency_code ?? 'CNY', status: input.entry.status ?? 'posted' } as Json,
        p_splits: input.splits.map((split) => ({ id: crypto.randomUUID(), ...split })) as Json
      })
      if (error) throw error
      return rpcRecord(data, 'ledger transaction')
    },
    onSuccess: () => linkedLedgerKeys(userId).forEach((key) => qc.invalidateQueries({ queryKey: key }))
  })
}

export function useReconcileLedgerAccount() {
  const qc = useQueryClient(); const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: { accountId: string; statementDate: string; balanceMinor: number; entryIds: string[]; commandId?: string; reconciliationId?: string }) => {
      if (!userId) throw new Error('未登录')
      if (!navigator.onLine) throw new Error('对账需要联网提交')
      const sync = await refreshSyncState(userId)
      const { data, error } = await supabase!.rpc('reconcile_ledger_account', {
        p_command_id: input.commandId ?? crypto.randomUUID(), p_restore_epoch: sync.restore_epoch,
        p_reconciliation_id: input.reconciliationId ?? crypto.randomUUID(), p_account_id: input.accountId,
        p_statement_date: input.statementDate, p_balance_minor: input.balanceMinor, p_entry_ids: input.entryIds
      })
      if (error) throw error
      return rpcRecord(data, 'ledger reconciliation')
    },
    onSuccess: () => {
      linkedLedgerKeys(userId).forEach((key) => qc.invalidateQueries({ queryKey: key }))
      qc.invalidateQueries({ queryKey: ['ledger_reconciliations', userId] })
    }
  })
}

export function useSwitchLedgerCurrency() {
  const qc = useQueryClient(); const { userId } = useAuth()
  return useMutation({
    mutationFn: async (currency: NonNullable<LedgerEntry['currency_code']>) => {
      if (!userId) throw new Error('未登录')
      if (!navigator.onLine) throw new Error('切换账本币种需要联网')
      const sync = await refreshSyncState(userId)
      const { data, error } = await supabase!.rpc('switch_ledger_currency', { p_command_id: crypto.randomUUID(), p_restore_epoch: sync.restore_epoch, p_currency: currency })
      if (error) throw error
      return rpcRecord(data, 'ledger currency switch')
    },
    onSuccess: () => {
      linkedLedgerKeys(userId).forEach((key) => qc.invalidateQueries({ queryKey: key }))
      qc.invalidateQueries({ queryKey: ['prefs', userId] })
    }
  })
}

/** 编辑账单 */
export function useUpdateLedgerEntry() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewLedgerEntry> }) => {
      if (!userId) throw new Error('未登录')
      const validated = patch.amount === undefined ? patch : validateLedgerCreate({
        kind: patch.kind ?? 'expense', category: patch.category ?? '其他', amount: Number(patch.amount),
        note: patch.note ?? null, entry_date: patch.entry_date ?? new Date().toISOString().slice(0, 10)
      })
      return updateEntity(qc, userId, 'ledger', id, {
        ...patch,
        ...(patch.amount === undefined ? {} : { amount: Number(patch.amount), amount_minor: parseMoneyToMinor(validated.amount ?? 0) })
      })
    },
    onSuccess: () => linkedLedgerKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useDeleteLedgerEntry() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('未登录')
      return deleteEntity(qc, userId, 'ledger', id)
    },
    onSuccess: () => linkedLedgerKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}
