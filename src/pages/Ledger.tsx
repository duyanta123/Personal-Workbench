import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, ChevronLeft, ChevronRight, Pencil, Search, Trash2, Wallet } from 'lucide-react'
import {
  LEDGER_PAGE_SIZE,
  ledgerListKey,
  useAddLedgerEntry,
  useCreateLedgerTransaction,
  useDeleteLedgerEntry,
  useLedgerEntries,
  useLedgerEntryById,
  useLedgerSummary,
  useLedgerAccounts,
  useLedgerPayees,
  useLedgerRules,
  useSwitchLedgerCurrency,
  useUpdateLedgerEntry
} from '../hooks/useLedger'
import type { LedgerListFilters, LedgerPage } from '../hooks/useLedger'
import { usePreferences, useUpdatePreferences, mergeCategories } from '../hooks/usePreferences'
import { useDeferredDelete } from '../hooks/useDeferredDelete'
import { useTouch } from '../hooks/useTouch'
import { useToastStore } from '../stores/toast'
import type { CurrencyCode, LedgerEntry } from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import { cn } from '../lib/cn'
import { useAuth } from '../hooks/useAuth'
import QueryError from '../components/ui/QueryError'
import { useSearchParams } from 'react-router-dom'
import { useCurrentDate, useTodayDateField } from '../hooks/useCurrentDate'
import { useClampPage } from '../hooks/useClampPage'
import { BUILTIN_LEDGER_CATEGORIES } from '../utils/ledgerCategories'
import RecurrencePanel from '../components/ui/RecurrencePanel'
import LedgerAutomationPanel from '../components/ui/LedgerAutomationPanel'
import LedgerSavedViewPanel, { type LedgerViewState } from '../components/ui/LedgerSavedViewPanel'
import EntityLinksPanel from '../components/ui/EntityLinksPanel'
import { applyLedgerRules } from '../utils/ledgerRules'
import { formatMinor, parseMoneyToMinor, sumMinor } from '../utils/money'
import LedgerEntryEditor from '../features/ledger/LedgerEntryEditor'
import LedgerBudgetBar from '../features/ledger/LedgerBudgetBar'
import LedgerExpenseDonut from '../features/ledger/LedgerExpenseDonut'
import LedgerDailyBars from '../features/ledger/LedgerDailyBars'
import LedgerStatsAside from '../features/ledger/LedgerStatsAside'

type Kind = LedgerEntry['kind']

export default function Ledger() {
  const currentDate = useCurrentDate()
  const month = currentDate.slice(0, 7)
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const [viewState, setViewState] = useState<LedgerViewState>({ sort: { column: 'entry_date', direction: 'desc' } })
  const listFilters: LedgerListFilters = {
    kind: viewState.kind, category: viewState.category, accountId: viewState.accountId,
    status: viewState.status, dateFrom: viewState.dateFrom, dateTo: viewState.dateTo
  }
  const entriesQuery = useLedgerEntries({ page, query: deferredQuery, filters: listFilters, sort: viewState.sort })
  useClampPage(entriesQuery.data?.total, LEDGER_PAGE_SIZE, page, setPage)
  const entries = entriesQuery.data?.items
  const isLoading = entriesQuery.isLoading
  const summaryQuery = useLedgerSummary(month)
  const addEntry = useAddLedgerEntry()
  const createTransaction = useCreateLedgerTransaction()
  const updateEntry = useUpdateLedgerEntry()
  const deleteEntry = useDeleteLedgerEntry()
  const prefsQuery = usePreferences()
  const accountsQuery = useLedgerAccounts()
  const payeesQuery = useLedgerPayees()
  const rulesQuery = useLedgerRules()
  const switchCurrency = useSwitchLedgerCurrency()
  const { data: prefs } = prefsQuery
  const updatePrefs = useUpdatePreferences()
  const push = useToastStore((s) => s.push)
  const touch = useTouch()
  const { userId } = useAuth()

  const [kind, setKind] = useState<Kind>('expense')
  const [cat, setCat] = useState('餐饮')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [accountId, setAccountId] = useState('')
  const [payeeId, setPayeeId] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>('CNY')
  const [rulesConfirmed, setRulesConfirmed] = useState(false)
  const [splits, setSplits] = useState<Array<{ category: string; amount: string; note: string }>>([])
  const dateField = useTodayDateField()
  const date = dateField.value
  const setDate = dateField.setValue
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newCat, setNewCat] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  const focusQuery = useLedgerEntryById(focusId)

  const expenseMinor = summaryQuery.data?.expenseMinor ?? 0
  const incomeMinor = summaryQuery.data?.incomeMinor ?? 0
  const todayExpenseMinor = summaryQuery.data?.dailyExpenseMinor.find((row) => row.date === currentDate)?.totalMinor ?? 0

  const customCats = useMemo(() => prefs?.categories?.[kind] ?? [], [kind, prefs?.categories])
  const cats = useMemo(() => mergeCategories(BUILTIN_LEDGER_CATEGORIES[kind], customCats), [kind, customCats])
  const allCats = useMemo(() => mergeCategories(
    [...BUILTIN_LEDGER_CATEGORIES.expense, ...BUILTIN_LEDGER_CATEGORIES.income],
    [...(prefs?.categories?.expense ?? []), ...(prefs?.categories?.income ?? [])]
  ), [prefs?.categories])

  const catTotals = useMemo(() => {
    return summaryQuery.data?.categoryExpenseMinor ?? []
  }, [summaryQuery.data?.categoryExpenseMinor])

  const budget = prefs?.monthly_budget ?? null
  const budgetMinor = prefs?.monthly_budget_minor ?? (budget === null ? null : Math.round(budget * 100))
  const baseDraft = useMemo(() => {
    let amountMinor = 0
    try { amountMinor = amount ? parseMoneyToMinor(amount) : 0 } catch { /* preview stays empty until valid */ }
    return { kind, category: cat, amount_minor: amountMinor, note: note.trim() || null, account_id: accountId || null, payee_id: payeeId || null }
  }, [accountId, amount, cat, kind, note, payeeId])
  const rulePreview = useMemo(() => applyLedgerRules(baseDraft, rulesQuery.data ?? []), [baseDraft, rulesQuery.data])
  const splitMinor = useMemo(() => {
    try { return sumMinor(splits.map((split) => parseMoneyToMinor(split.amount))) } catch { return -1 }
  }, [splits])
  const splitBalanced = splits.length === 0 || (baseDraft.amount_minor > 0 && splitMinor === baseDraft.amount_minor)

  useEffect(() => setPage(0), [query, viewState.kind, viewState.category, viewState.accountId, viewState.status, viewState.dateFrom, viewState.dateTo, viewState.sort])
  useEffect(() => setCurrency(prefs?.currency_code ?? 'CNY'), [prefs?.currency_code])
  useEffect(() => {
    if (!editingId && !accountId) {
      const defaultAccount = accountsQuery.data?.find((account) => !account.archived)
      if (defaultAccount) setAccountId(defaultAccount.id)
    }
  }, [accountId, accountsQuery.data, editingId])
  useEffect(() => setRulesConfirmed(false), [baseDraft, rulesQuery.data])
  useEffect(() => {
    if (!focusId || focusQuery.isLoading || focusQuery.data !== null) return
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
    push({ kind: 'info', message: '定位的账单不存在或已删除' })
  }, [focusId, focusQuery.isLoading, focusQuery.data, push, searchParams, setSearchParams])

  const { requestDelete, isPending: isDeletePending, remainingSeconds } = useDeferredDelete<LedgerEntry, LedgerPage>({
    key: ledgerListKey(userId, page, deferredQuery, listFilters, viewState.sort),
    label: (e) => `${e.category} ${e.amount}`,
    remove: (id) => deleteEntry.mutateAsync(id),
    cache: {
      getItems: (cache) => cache?.items ?? [],
      remove: (cache, id) => cache && {
        items: cache.items.filter((item) => item.id !== id),
        total: Math.max(0, cache.total - 1)
      },
      restore: (cache) => cache
    }
  })

  function resetForm() {
    setEditingId(null)
    setAmount('')
    setNote('')
    setAccountId(''); setPayeeId(''); setRulesConfirmed(false); setSplits([])
    dateField.resetToToday()
  }

  function startEdit(e: LedgerEntry) {
    setEditingId(e.id)
    setKind(e.kind)
    setCat(e.category)
    setAmount(((e.amount_minor ?? 0) / 100).toFixed(2))
    setNote(e.note ?? '')
    setAccountId(e.account_id ?? ''); setPayeeId(e.payee_id ?? ''); setCurrency(e.currency_code ?? 'CNY')
    setDate(e.entry_date)
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    let amountMinor: number
    try { amountMinor = parseMoneyToMinor(amount) } catch (cause) { push({ kind: 'error', message: (cause as Error).message }); return }
    if (amountMinor <= 0 || !splitBalanced || (rulePreview.changes.length > 0 && !rulesConfirmed)) return
    const applied = rulePreview.result
    const payload = { kind: applied.kind, category: applied.category, amount, note: applied.note, entry_date: date,
      account_id: applied.account_id, payee_id: applied.payee_id, currency_code: currency, status: 'posted' as const }
    try {
      if (editingId) {
        await updateEntry.mutateAsync({ id: editingId, patch: payload })
        push({ kind: 'success', message: '账单已更新' })
      } else {
        if (splits.length) await createTransaction.mutateAsync({ entry: payload, splits: splits.map((split) => ({ category: split.category, amount_minor: parseMoneyToMinor(split.amount), note: split.note.trim() || null })) })
        else await addEntry.mutateAsync(payload)
        push({ kind: 'success', message: `已记一笔 ${formatMinor(amountMinor, currency)}` })
      }
      resetForm()
    } catch {
      push({ kind: 'error', message: editingId ? '账单更新失败，请重试' : '记账失败，请重试' })
    }
  }

  async function addCustomCat() {
    const v = newCat.trim()
    if (!v || cats.includes(v)) return
    try {
      await updatePrefs.mutateAsync({
        categories: {
          expense: kind === 'expense' ? [...customCats, v] : (prefs?.categories?.expense ?? []),
          income: kind === 'income' ? [...customCats, v] : (prefs?.categories?.income ?? [])
        }
      })
      setCat(v)
      setNewCat('')
      push({ kind: 'success', message: `已添加分类「${v}」` })
    } catch {
      push({ kind: 'error', message: '分类保存失败，请重试' })
    }
  }

  async function confirmPlanned(entry: LedgerEntry) {
    try {
      await updateEntry.mutateAsync({ id: entry.id, patch: { status: 'posted' } })
      push({ kind: 'success', message: '周期账目已确认入账' })
    } catch {
      push({ kind: 'error', message: '确认入账失败，请重试' })
    }
  }

  async function changeCurrency(next: CurrencyCode) {
    if (next === currency) return
    if (!window.confirm(`将空账本的本位币设置为 ${next}？产生第一笔账目后将无法切换。`)) return
    try { await switchCurrency.mutateAsync(next); setCurrency(next); push({ kind: 'success', message: `账本本位币已设置为 ${next}` }) }
    catch (cause) { push({ kind: 'error', message: cause instanceof Error ? cause.message : '币种切换失败' }) }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="LEDGER"
        title="记账"
        description="清楚每一笔的流向。"
      />
      {(entriesQuery.isError || summaryQuery.isError || prefsQuery.isError) && (
        <QueryError onRetry={() => { entriesQuery.refetch(); summaryQuery.refetch(); prefsQuery.refetch() }} />
      )}
      <RecurrencePanel entityType="ledger" />
      <LedgerAutomationPanel entries={entries ?? []} />
      <LedgerSavedViewPanel
        query={query}
        state={viewState}
        categories={allCats}
        accounts={accountsQuery.data ?? []}
        onChange={setViewState}
        onApplyView={(next) => { setQuery(next.query); setViewState(next.state) }}
      />

      {focusQuery.data && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-accent bg-accent-2/40 p-4 shadow-card">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">搜索定位</div>
            <div className="mt-1 text-sm font-semibold text-ink">
              {focusQuery.data.category} · {focusQuery.data.kind === 'expense' ? '-' : '+'}
              {formatMinor(focusQuery.data.amount_minor ?? 0, focusQuery.data.currency_code)}
            </div>
            {focusQuery.data.note && <p className="mt-1 text-xs text-ink-2">{focusQuery.data.note}</p>}
            <button type="button" onClick={() => { const next = new URLSearchParams(searchParams); next.delete('focus'); setSearchParams(next, { replace: true }) }} className="mt-2 text-xs font-medium text-accent">关闭定位</button>
          </div>
          <EntityLinksPanel sourceKind="ledger" sourceId={focusQuery.data.id} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
      {/* 本月汇总 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-ink-3">本月支出</div>
          <div className="mt-1 text-lg font-bold tracking-tight text-danger tabular-nums">
            -{formatMinor(expenseMinor, currency)}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-ink-3">本月收入</div>
          <div className="mt-1 text-lg font-bold tracking-tight text-m1 tabular-nums">
            +{formatMinor(incomeMinor, currency)}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-ink-3">结余</div>
          <div className="mt-1 text-lg font-bold tracking-tight text-ink tabular-nums">
            {formatMinor(incomeMinor - expenseMinor, currency)}
          </div>
        </div>
      </div>

      {/* 预算（可选） */}
      <LedgerBudgetBar
        budget={budget}
        budgetMinor={budgetMinor}
        expenseMinor={expenseMinor}
        currency={currency}
        updatePrefs={updatePrefs}
      />

      {/* 添加/编辑账单 */}
      <LedgerEntryEditor
        kind={kind}
        onKindChange={(next) => { setKind(next); setCat(next === 'expense' ? '餐饮' : '工资') }}
        editing={Boolean(editingId)}
        onCancel={resetForm}
        cats={cats}
        cat={cat}
        onCatChange={setCat}
        newCat={newCat}
        onNewCatChange={setNewCat}
        onAddCustomCat={() => void addCustomCat()}
        amount={amount}
        onAmountChange={setAmount}
        currency={currency}
        onCurrencyChange={(next) => void changeCurrency(next as CurrencyCode)}
        accounts={accountsQuery.data ?? []}
        accountId={accountId}
        onAccountChange={setAccountId}
        payees={payeesQuery.data ?? []}
        payeeId={payeeId}
        onPayeeChange={setPayeeId}
        date={date}
        onDateChange={setDate}
        note={note}
        onNoteChange={setNote}
        onSubmit={handleSubmit}
        busy={addEntry.isPending || updateEntry.isPending || createTransaction.isPending || switchCurrency.isPending}
        rulePreview={rulePreview}
        rulesConfirmed={rulesConfirmed}
        onRulesConfirmed={setRulesConfirmed}
        splits={splits}
        onSplitsChange={setSplits}
        splitBalanced={splitBalanced}
        splitMinor={splitMinor}
        amountMinor={baseDraft.amount_minor}
      />

      {(summaryQuery.data?.upcoming.length ?? 0) > 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-ink">Upcoming</h2><span className="text-xs text-ink-3">待确认周期账目</span></div>
          <ul className="mt-3 divide-y divide-border">
            {summaryQuery.data?.upcoming.slice(0, 20).map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2">
                <span className="w-24 shrink-0 text-xs text-ink-3 tabular-nums">{entry.entry_date}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{entry.category}{entry.note ? ` · ${entry.note}` : ''}</span>
                <span className={cn('text-sm font-semibold tabular-nums', entry.kind === 'expense' ? 'text-danger' : 'text-m1')}>{entry.kind === 'expense' ? '-' : '+'}{formatMinor(entry.amount_minor ?? 0, entry.currency_code ?? currency)}</span>
                <Button type="button" size="sm" onClick={() => void confirmPlanned(entry)} disabled={updateEntry.isPending}><Check size={14} />确认</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 支出构成：饼图 + 图例 */}
      {catTotals.length > 0 && (
        <LedgerExpenseDonut catTotals={catTotals} expenseMinor={expenseMinor} currency={currency} />
      )}

      {/* 每日支出趋势 */}
      <LedgerDailyBars daily={summaryQuery.data?.dailyExpenseMinor} month={month} currentDate={currentDate} currency={currency} />

      {/* 搜索 + 明细 */}
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索分类、备注…"
          maxLength={200}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !entries?.length ? (
        <EmptyState
          icon={deferredQuery ? <Search size={22} /> : <Wallet size={22} />}
          title={deferredQuery ? '没有匹配的账单' : '还没有账单'}
          description={deferredQuery ? undefined : '先记一笔吧。'}
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className={cn('group flex items-center gap-3 rounded-2xl border bg-surface px-4 py-3 transition-colors duration-150 hover:bg-hover', isDeletePending(e.id) ? 'border-danger/40 opacity-60' : 'border-border')}
            >
              <div className="w-20 shrink-0 text-xs text-ink-3 tabular-nums">{e.entry_date.slice(5)}</div>
              <div className="min-w-0 flex-1 text-sm text-ink">
                {e.category}
                {e.note && <span className="ml-2 truncate text-xs text-ink-3">{e.note}</span>}
              </div>
              <div
                className={cn(
                  'shrink-0 text-sm font-semibold tabular-nums',
                  e.kind === 'expense' ? 'text-danger' : 'text-m1'
                )}
              >
                {e.kind === 'expense' ? '-' : '+'}{formatMinor(e.amount_minor ?? 0, e.currency_code ?? currency)}
                {e.status === 'planned' && <span className="ml-2 rounded bg-accent-2 px-1.5 py-0.5 text-[10px] font-medium text-accent">待确认</span>}
              </div>
              {isDeletePending(e.id) && <span className="shrink-0 text-[10px] font-medium text-danger">待删除 {remainingSeconds(e.id)}s</span>}
              <div className="flex shrink-0 items-center gap-0.5">
                <IconButton size="sm" onClick={() => startEdit(e)} disabled={isDeletePending(e.id)} aria-label="编辑" className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton
                  size="sm"
                  onClick={() => requestDelete(e)}
                  disabled={isDeletePending(e.id)}
                  aria-label="删除"
                  className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {(entriesQuery.data?.total ?? 0) > LEDGER_PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3">
          <IconButton
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            disabled={page === 0 || entriesQuery.isFetching}
            aria-label="上一页"
          >
            <ChevronLeft size={17} />
          </IconButton>
          <span className="text-xs text-ink-3 tabular-nums">
            第 {page + 1} / {Math.ceil((entriesQuery.data?.total ?? 0) / LEDGER_PAGE_SIZE)} 页
          </span>
          <IconButton
            onClick={() => setPage((value) => value + 1)}
            disabled={(page + 1) * LEDGER_PAGE_SIZE >= (entriesQuery.data?.total ?? 0) || entriesQuery.isFetching}
            aria-label="下一页"
          >
            <ChevronRight size={17} />
          </IconButton>
        </div>
      )}
        </div>

        {/* 右栏统计 */}
        <LedgerStatsAside
          incomeMinor={incomeMinor}
          expenseMinor={expenseMinor}
          todayExpenseMinor={todayExpenseMinor}
          total={summaryQuery.data?.total ?? 0}
          catTotals={catTotals}
          currency={currency}
        />
      </div>
    </div>
  )
}
