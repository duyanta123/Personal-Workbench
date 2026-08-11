import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Settings2, Trash2, Wallet, X } from 'lucide-react'
import {
  LEDGER_PAGE_SIZE,
  ledgerListKey,
  useAddLedgerEntry,
  useDeleteLedgerEntry,
  useLedgerEntries,
  useLedgerEntryById,
  useLedgerSummary,
  useUpdateLedgerEntry
} from '../hooks/useLedger'
import type { LedgerPage } from '../hooks/useLedger'
import { usePreferences, useUpdatePreferences, mergeCategories } from '../hooks/usePreferences'
import { useDeferredDelete } from '../hooks/useDeferredDelete'
import { useTouch } from '../hooks/useTouch'
import { useToastStore } from '../stores/toast'
import { donutStops } from '../utils/ledgerStats'
import type { LedgerEntry } from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Segmented from '../components/ui/Segmented'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import SideCard from '../components/ui/SideCard'
import { cn } from '../lib/cn'
import { useAuth } from '../hooks/useAuth'
import QueryError from '../components/ui/QueryError'
import { useSearchParams } from 'react-router-dom'
import { useCurrentDate, useTodayDateField } from '../hooks/useCurrentDate'
import { useClampPage } from '../hooks/useClampPage'

const BUILTIN_CATS = {
  expense: ['餐饮', '交通', '购物', '居住', '娱乐', '学习', '医疗', '其他'],
  income: ['工资', '奖金', '理财', '其他']
} as const

type Kind = LedgerEntry['kind']

export default function Ledger() {
  const currentDate = useCurrentDate()
  const month = currentDate.slice(0, 7)
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const entriesQuery = useLedgerEntries({ page, query: deferredQuery })
  useClampPage(entriesQuery.data?.total, LEDGER_PAGE_SIZE, page, setPage)
  const entries = entriesQuery.data?.items
  const isLoading = entriesQuery.isLoading
  const summaryQuery = useLedgerSummary(month)
  const addEntry = useAddLedgerEntry()
  const updateEntry = useUpdateLedgerEntry()
  const deleteEntry = useDeleteLedgerEntry()
  const prefsQuery = usePreferences()
  const { data: prefs } = prefsQuery
  const updatePrefs = useUpdatePreferences()
  const push = useToastStore((s) => s.push)
  const touch = useTouch()
  const { userId } = useAuth()

  const [kind, setKind] = useState<Kind>('expense')
  const [cat, setCat] = useState('餐饮')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const dateField = useTodayDateField()
  const date = dateField.value
  const setDate = dateField.setValue
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newCat, setNewCat] = useState('')
  const [budgetEdit, setBudgetEdit] = useState(false)
  const [budgetVal, setBudgetVal] = useState('')
  const [year, monthNum] = month.split('-').map(Number)
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  const focusQuery = useLedgerEntryById(focusId)

  const expenseTotal = summaryQuery.data?.expense ?? 0
  const incomeTotal = summaryQuery.data?.income ?? 0
  const todayExpense = summaryQuery.data?.dailyExpense.find((row) => row.date === currentDate)?.total ?? 0

  const customCats = useMemo(() => prefs?.categories?.[kind] ?? [], [kind, prefs?.categories])
  const cats = useMemo(() => mergeCategories(BUILTIN_CATS[kind], customCats), [kind, customCats])

  const catTotals = useMemo(() => {
    return summaryQuery.data?.categoryExpense ?? []
  }, [summaryQuery.data?.categoryExpense])

  const donut = donutStops(catTotals)
  const donutBg =
    donut.length > 0
      ? `conic-gradient(${donut
          .map((s, i) => `${s.color} ${i === 0 ? 0 : donut[i - 1].stop}% ${s.stop}%`)
          .join(', ')})`
      : 'none'

  const bars = useMemo(() => {
    const totals = new Map((summaryQuery.data?.dailyExpense ?? []).map((row) => [row.date, row.total]))
    const days = new Date(year, monthNum, 0).getDate()
    return Array.from({ length: days }, (_, index) => {
      const day = index + 1
      const date = `${month}-${String(day).padStart(2, '0')}`
      return { day, date, total: totals.get(date) ?? 0 }
    })
  }, [summaryQuery.data?.dailyExpense, year, monthNum, month])
  const maxBar = Math.max(1, ...bars.map((b) => b.total))

  const budget = prefs?.monthly_budget ?? null

  useEffect(() => setPage(0), [query])
  useEffect(() => {
    if (!focusId || focusQuery.isLoading || focusQuery.data !== null) return
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
    push({ kind: 'info', message: '定位的账单不存在或已删除' })
  }, [focusId, focusQuery.isLoading, focusQuery.data, push, searchParams, setSearchParams])

  const { requestDelete, isPending: isDeletePending, remainingSeconds } = useDeferredDelete<LedgerEntry, LedgerPage>({
    key: ledgerListKey(userId, page, deferredQuery),
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
    dateField.resetToToday()
  }

  function startEdit(e: LedgerEntry) {
    setEditingId(e.id)
    setKind(e.kind)
    setCat(e.category)
    setAmount(String(e.amount))
    setNote(e.note ?? '')
    setDate(e.entry_date)
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    const amt = Number(amount)
    if (!amt || amt <= 0) return
    const payload = { kind, category: cat, amount: amt, note: note.trim() || null, entry_date: date }
    try {
      if (editingId) {
        await updateEntry.mutateAsync({ id: editingId, patch: payload })
        push({ kind: 'success', message: '账单已更新' })
      } else {
        await addEntry.mutateAsync(payload)
        push({ kind: 'success', message: `已记一笔 ¥${amt.toFixed(2)}` })
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

  async function saveBudget() {
    const v = Number(budgetVal)
    if (!Number.isFinite(v) || v <= 0) return
    try {
      await updatePrefs.mutateAsync({ monthly_budget: v })
      setBudgetEdit(false)
      push({ kind: 'success', message: `预算设为 ¥${v}` })
    } catch {
      push({ kind: 'error', message: '预算保存失败，请重试' })
    }
  }

  async function clearBudget() {
    try {
      await updatePrefs.mutateAsync({ monthly_budget: null })
      setBudgetEdit(false)
      setBudgetVal('')
      push({ kind: 'success', message: '已清除预算' })
    } catch {
      push({ kind: 'error', message: '预算清除失败，请重试' })
    }
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

      {focusQuery.data && (
        <div className="rounded-2xl border border-accent bg-accent-2/40 p-4 shadow-card">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">搜索定位</div>
          <div className="mt-1 text-sm font-semibold text-ink">{focusQuery.data.category} · {focusQuery.data.kind === 'expense' ? '-' : '+'}¥{focusQuery.data.amount.toFixed(2)}</div>
          {focusQuery.data.note && <p className="mt-1 text-xs text-ink-2">{focusQuery.data.note}</p>}
          <button type="button" onClick={() => { const next = new URLSearchParams(searchParams); next.delete('focus'); setSearchParams(next, { replace: true }) }} className="mt-2 text-xs font-medium text-accent">关闭定位</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
      {/* 本月汇总 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-ink-3">本月支出</div>
          <div className="mt-1 text-lg font-bold tracking-tight text-danger tabular-nums">
            -¥{expenseTotal.toFixed(2)}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-ink-3">本月收入</div>
          <div className="mt-1 text-lg font-bold tracking-tight text-m1 tabular-nums">
            +¥{incomeTotal.toFixed(2)}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-ink-3">结余</div>
          <div className="mt-1 text-lg font-bold tracking-tight text-ink tabular-nums">
            ¥{(incomeTotal - expenseTotal).toFixed(2)}
          </div>
        </div>
      </div>

      {/* 预算（可选） */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
        {budgetEdit ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0.01"
              value={budgetVal}
              onChange={(e) => setBudgetVal(e.target.value)}
              placeholder="月预算金额"
              max="9999999999.99"
              className="w-36 tabular-nums"
            />
            <Button size="sm" onClick={saveBudget} disabled={!Number(budgetVal) || updatePrefs.isPending}>
              保存
            </Button>
            {budget !== null && <Button size="sm" variant="ghost" onClick={clearBudget} disabled={updatePrefs.isPending}>清除预算</Button>}
            <IconButton size="sm" onClick={() => setBudgetEdit(false)} aria-label="取消">
              <X size={16} />
            </IconButton>
          </div>
        ) : (
          <>
            <div className="text-sm">
              {budget !== null ? (
                <span className="text-ink">
                  本月预算{' '}
                  <span className="font-bold tabular-nums">¥{budget.toFixed(0)}</span>
                  <span className="ml-2 text-xs text-ink-3">
                    剩余 <span className="tabular-nums">¥{(budget - expenseTotal).toFixed(0)}</span>
                  </span>
                </span>
              ) : (
                <span className="text-ink-3">设置月度预算，控制支出</span>
              )}
            </div>
            <button
              onClick={() => {
                setBudgetVal(budget ? String(budget) : '')
                setBudgetEdit(true)
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
            >
              <Settings2 size={13} />
              {budget !== null ? '调整' : '设置'}
            </button>
          </>
        )}
      </div>

      {/* 添加/编辑账单 */}
      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={kind}
            onChange={(k) => {
              setKind(k)
              setCat(k === 'expense' ? '餐饮' : '工资')
            }}
            options={[
              { value: 'expense' as const, label: '支出' },
              { value: 'income' as const, label: '收入' }
            ]}
          />
          {editingId && (
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              <X size={14} />
              取消编辑
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                cat === c
                  ? 'bg-accent-2 text-accent'
                  : 'bg-nested text-ink-2 hover:bg-hover hover:text-ink'
              )}
            >
              {c}
            </button>
          ))}
          <div className="inline-flex items-center gap-1 rounded-full bg-nested px-2 py-1">
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustomCat()
                }
              }}
              placeholder="新分类"
              maxLength={200}
              className="w-16 bg-transparent text-xs text-ink outline-none placeholder:text-ink-3"
            />
            <button type="button" onClick={addCustomCat} aria-label="添加分类" className="text-ink-3 hover:text-accent">
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
              placeholder="金额"
              max="9999999999.99"
            className="w-32 tabular-nums"
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="记账日期"
            className="w-40 tabular-nums"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
              placeholder="备注（可选）"
              maxLength={100000}
            className="min-w-40 flex-1"
          />
          <Button type="submit" disabled={!amount || Number(amount) <= 0 || addEntry.isPending || updateEntry.isPending}>
            <Plus size={16} />
            {editingId ? '保存修改' : '记一笔'}
          </Button>
        </div>
      </form>

      {/* 支出构成：饼图 + 图例 */}
      {catTotals.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">本月支出构成</h2>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
            <div
              className="relative h-36 w-36 shrink-0 rounded-full shadow-card"
              style={{ background: donutBg }}
            >
              <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-surface">
                <span className="text-[10px] text-ink-3">总支出</span>
                <span className="text-base font-bold text-ink tabular-nums">
                  ¥{expenseTotal.toFixed(0)}
                </span>
              </div>
            </div>
            <ul className="w-full flex-1 space-y-2">
              {donut.map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="w-10 shrink-0 text-ink-2">{s.label}</span>
                  <span className="flex-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-nested">
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
                    </div>
                  </span>
                  <span className="w-16 shrink-0 text-right text-ink-2 tabular-nums">
                    ¥{s.value.toFixed(0)} · {Math.round(s.pct)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 每日支出趋势 */}
      {bars.some((b) => b.total > 0) && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">本月每日支出</h2>
          <div className="mt-4 flex h-28 items-end gap-[3px]">
            {bars.map((b) => {
              const isToday = b.date === currentDate
              const h = b.total ? Math.max(8, (b.total / maxBar) * 100) : 2
              return (
                <div key={b.day} className="group relative flex h-full flex-1 items-end justify-center">
                  <div
                    className={cn(
                      'w-full rounded-t-sm transition-all duration-200',
                      isToday ? 'bg-accent' : b.total ? 'bg-m3/70 hover:bg-m3' : 'bg-nested'
                    )}
                    style={{ height: `${h}%` }}
                    title={`${b.day} 日 ¥${b.total.toFixed(0)}`}
                  />
                  {b.day % 5 === 1 && (
                    <span className="absolute -bottom-4 text-[9px] text-ink-3 tabular-nums">{b.day}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

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
                {e.kind === 'expense' ? '-' : '+'}¥{e.amount.toFixed(2)}
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
        <aside className="h-fit space-y-3 lg:sticky lg:top-4">
          <SideCard title="收支概况" icon={<Wallet size={14} />}>
            <ul className="space-y-2">
              {[
                { k: '本月收入', v: `¥${incomeTotal.toFixed(2)}`, c: 'var(--m1)' },
                { k: '本月支出', v: `¥${expenseTotal.toFixed(2)}`, c: 'var(--danger)' },
                { k: '净结余', v: `¥${(incomeTotal - expenseTotal).toFixed(2)}` },
                { k: '今日支出', v: `¥${todayExpense.toFixed(2)}` },
                { k: '总笔数', v: `${summaryQuery.data?.total ?? 0} 笔` }
              ].map((r) => (
                <li key={r.k} className="flex items-center justify-between text-xs">
                  <span className="text-ink-2">{r.k}</span>
                  <span
                    className="font-bold tabular-nums"
                    style={r.c ? { color: r.c } : undefined}
                  >
                    {r.v}
                  </span>
                </li>
              ))}
            </ul>
          </SideCard>
          <SideCard title="支出分类占比" icon={<Wallet size={14} />}>
            {catTotals.length === 0 ? (
              <p className="py-2 text-center text-xs text-ink-3">暂无支出记录</p>
            ) : (
              <ul className="space-y-2">
                {catTotals.slice(0, 6).map(([cat, val]) => {
                  const pct = expenseTotal ? Math.round((val / expenseTotal) * 100) : 0
                  return (
                    <li key={cat} className="flex items-center gap-2 text-xs">
                      <span className="w-8 shrink-0 truncate text-ink-2">{cat}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nested">
                        <div className="h-full rounded-full bg-m3" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 shrink-0 text-right text-ink-3 tabular-nums">{pct}%</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </SideCard>
        </aside>
      </div>
    </div>
  )
}
