import { useEffect, useRef, useState } from 'react'
import { Bookmark, Plus, Trash2 } from 'lucide-react'
import type { LedgerAccount } from '../../types'
import type { LedgerListFilters, LedgerSort, LedgerSortColumn } from '../../hooks/useLedger'
import { useAddSavedView, useDeleteSavedView, useSavedViews } from '../../hooks/useWorkbenchArtifacts'
import { useToastStore } from '../../stores/toast'
import Button from './Button'
import IconButton from './IconButton'
import Input from './Input'

export interface LedgerViewState extends LedgerListFilters {
  sort: LedgerSort
}

const SORT_OPTIONS: Array<{ value: string; label: string; column: LedgerSortColumn; direction: LedgerSort['direction'] }> = [
  { value: 'date_desc', label: '日期（新到旧）', column: 'entry_date', direction: 'desc' },
  { value: 'date_asc', label: '日期（旧到新）', column: 'entry_date', direction: 'asc' },
  { value: 'amount_desc', label: '金额（高到低）', column: 'amount_minor', direction: 'desc' },
  { value: 'amount_asc', label: '金额（低到高）', column: 'amount_minor', direction: 'asc' },
  { value: 'category_asc', label: '分类（A-Z）', column: 'category', direction: 'asc' }
]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

function sortValue(sort: LedgerSort) {
  return SORT_OPTIONS.find((option) => option.column === sort.column && option.direction === sort.direction)?.value ?? 'date_desc'
}

function viewState(view: { filters: Record<string, unknown>; sort: Record<string, unknown>[] }): { query: string; state: LedgerViewState } {
  const filters = view.filters
  const firstSort = view.sort[0]
  const sortColumn = firstSort?.column
  const sortDirection = firstSort?.direction
  const option = SORT_OPTIONS.find((item) => item.column === sortColumn && item.direction === sortDirection) ?? SORT_OPTIONS[0]
  return {
    query: typeof filters.query === 'string' ? filters.query : '',
    state: {
      kind: filters.kind === 'income' || filters.kind === 'expense' ? filters.kind : undefined,
      category: typeof filters.category === 'string' ? filters.category : undefined,
      accountId: typeof filters.account_id === 'string' && UUID.test(filters.account_id) ? filters.account_id : undefined,
      status: filters.status === 'planned' || filters.status === 'posted' ? filters.status : undefined,
      dateFrom: typeof filters.date_from === 'string' && DATE.test(filters.date_from) ? filters.date_from : undefined,
      dateTo: typeof filters.date_to === 'string' && DATE.test(filters.date_to) ? filters.date_to : undefined,
      sort: { column: option.column, direction: option.direction }
    }
  }
}

export default function LedgerSavedViewPanel({
  query,
  state,
  categories,
  accounts,
  onChange,
  onApplyView
}: {
  query: string
  state: LedgerViewState
  categories: string[]
  accounts: LedgerAccount[]
  onChange: (next: LedgerViewState) => void
  onApplyView: (next: { query: string; state: LedgerViewState }) => void
}) {
  const savedViews = useSavedViews('ledger')
  const addView = useAddSavedView()
  const deleteView = useDeleteSavedView()
  const push = useToastStore((store) => store.push)
  const [name, setName] = useState('')
  const [makeDefault, setMakeDefault] = useState(false)
  const defaultApplied = useRef(false)

  useEffect(() => {
    if (defaultApplied.current || !savedViews.isSuccess) return
    defaultApplied.current = true
    const defaultView = savedViews.data.find((view) => view.is_default)
    if (defaultView) onApplyView(viewState(defaultView))
  }, [onApplyView, savedViews.data, savedViews.isSuccess])

  function update(patch: Partial<LedgerViewState>) {
    onChange({ ...state, ...patch })
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    const filters: Record<string, unknown> = { query: query.trim() }
    if (state.kind) filters.kind = state.kind
    if (state.category) filters.category = state.category
    if (state.accountId) filters.account_id = state.accountId
    if (state.status) filters.status = state.status
    if (state.dateFrom) filters.date_from = state.dateFrom
    if (state.dateTo) filters.date_to = state.dateTo
    try {
      await addView.mutateAsync({ entity_kind: 'ledger', name: trimmed, filters, sort: [{ column: state.sort.column, direction: state.sort.direction }], is_default: makeDefault })
      setName(''); setMakeDefault(false)
      push({ kind: 'success', message: '账目视图已保存' })
    } catch (cause) {
      push({ kind: 'error', message: cause instanceof Error ? cause.message : '视图保存失败' })
    }
  }

  async function remove(id: string) {
    try { await deleteView.mutateAsync(id) }
    catch { push({ kind: 'error', message: '视图删除失败' }) }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2"><Bookmark size={15} className="text-accent" /><h2 className="text-sm font-semibold text-ink">保存视图</h2></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <select aria-label="账目类型筛选" value={state.kind ?? ''} onChange={(event) => update({ kind: event.target.value === '' ? undefined : event.target.value as LedgerViewState['kind'] })} className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink">
          <option value="">全部收支</option><option value="expense">支出</option><option value="income">收入</option>
        </select>
        <select aria-label="账目分类筛选" value={state.category ?? ''} onChange={(event) => update({ category: event.target.value || undefined })} className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink">
          <option value="">全部分类</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select aria-label="账目账户筛选" value={state.accountId ?? ''} onChange={(event) => update({ accountId: event.target.value || undefined })} className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink">
          <option value="">全部账户</option>{accounts.filter((account) => !account.archived).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <select aria-label="账目状态筛选" value={state.status ?? ''} onChange={(event) => update({ status: event.target.value === '' ? undefined : event.target.value as LedgerViewState['status'] })} className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink">
          <option value="">全部状态</option><option value="posted">已入账</option><option value="planned">待确认</option>
        </select>
        <Input aria-label="开始日期筛选" type="date" value={state.dateFrom ?? ''} onChange={(event) => update({ dateFrom: event.target.value || undefined })} />
        <Input aria-label="结束日期筛选" type="date" value={state.dateTo ?? ''} onChange={(event) => update({ dateTo: event.target.value || undefined })} />
        <select aria-label="账目排序" value={sortValue(state.sort)} onChange={(event) => { const option = SORT_OPTIONS.find((item) => item.value === event.target.value) ?? SORT_OPTIONS[0]; update({ sort: { column: option.column, direction: option.direction } }) }} className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink sm:col-span-2 lg:col-span-1">
          {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="视图名称" className="min-w-44 flex-1" maxLength={200} />
        <Button size="sm" onClick={() => void save()} disabled={!name.trim() || addView.isPending}><Plus size={13} />保存当前筛选</Button>
        <label className="flex items-center gap-1.5 px-1 text-xs text-ink-2"><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} />设为默认</label>
      </div>
      {(savedViews.data?.length ?? 0) > 0 ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{savedViews.data?.map((view) => <li key={view.id} className="flex items-center gap-2 rounded-lg bg-nested px-2 py-1.5 text-xs"><button type="button" className="min-w-0 flex-1 truncate text-left text-ink" onClick={() => onApplyView(viewState(view))}>{view.name}{view.is_default ? ' · 默认' : ''}</button><IconButton size="sm" aria-label={`删除视图 ${view.name}`} onClick={() => void remove(view.id)} disabled={deleteView.isPending}><Trash2 size={13} /></IconButton></li>)}</ul> : <p className="mt-3 text-xs text-ink-3">保存一组常用筛选，之后可一键恢复。</p>}
    </section>
  )
}
