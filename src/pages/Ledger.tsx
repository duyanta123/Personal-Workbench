import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Trash2, Wallet } from 'lucide-react'
import { useAddLedgerEntry, useDeleteLedgerEntry, useLedgerEntries } from '../hooks/useLedger'
import { monthPrefix, todayStr } from '../utils/date'
import type { LedgerEntry } from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Segmented from '../components/ui/Segmented'
import Progress from '../components/ui/Progress'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import { cn } from '../lib/cn'

const CATS = {
  expense: ['餐饮', '交通', '购物', '居住', '娱乐', '学习', '医疗', '其他'],
  income: ['工资', '奖金', '理财', '其他']
} as const

export default function Ledger() {
  const { data: entries, isLoading } = useLedgerEntries()
  const addEntry = useAddLedgerEntry()
  const deleteEntry = useDeleteLedgerEntry()

  const [kind, setKind] = useState<LedgerEntry['kind']>('expense')
  const [cat, setCat] = useState('餐饮')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const month = monthPrefix()
  const monthEntries = useMemo(
    () => (entries ?? []).filter((e) => e.entry_date.startsWith(month)),
    [entries, month]
  )
  const expenseTotal = monthEntries.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0)
  const incomeTotal = monthEntries.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0)

  // 支出构成（本月）
  const catTotals = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of monthEntries) {
      if (e.kind === 'expense') m.set(e.category, (m.get(e.category) ?? 0) + e.amount)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [monthEntries])
  const maxCat = catTotals[0]?.[1] ?? 0

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!amt || amt <= 0) return
    addEntry.mutate({
      kind,
      category: cat,
      amount: amt,
      note: note.trim() || null,
      entry_date: todayStr()
    })
    setAmount('')
    setNote('')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="LEDGER"
        title="记账"
        description="清楚每一笔的流向。"
      />

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

      {/* 添加账单 */}
      <form onSubmit={handleAdd} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <Segmented
          value={kind}
          onChange={(k) => {
            setKind(k)
            setCat(CATS[k][0])
          }}
          options={[
            { value: 'expense' as const, label: '支出' },
            { value: 'income' as const, label: '收入' }
          ]}
        />
        <div className="flex flex-wrap gap-1.5">
          {CATS[kind].map((c) => (
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
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="number"
            min="0"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="金额"
            className="w-32 tabular-nums"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注（可选）"
            className="min-w-40 flex-1"
          />
          <Button type="submit" disabled={!amount || Number(amount) <= 0}>
            <Plus size={16} />
            记一笔
          </Button>
        </div>
      </form>

      {/* 支出构成 */}
      {catTotals.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">本月支出构成</h2>
          <div className="mt-3 space-y-2.5">
            {catTotals.map(([c, v]) => (
              <div key={c} className="flex items-center gap-3 text-xs">
                <span className="w-10 shrink-0 text-ink-2">{c}</span>
                <Progress
                  value={maxCat ? (v / maxCat) * 100 : 0}
                  color="bg-m3"
                  className="flex-1"
                />
                <span className="w-16 shrink-0 text-right text-ink-2 tabular-nums">
                  ¥{v.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 明细 */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !entries?.length ? (
        <EmptyState
          icon={<Wallet size={22} />}
          title="还没有账单"
          description="先记一笔吧。"
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors duration-150 hover:bg-hover"
            >
              <div className="w-20 shrink-0 text-xs text-ink-3 tabular-nums">
                {e.entry_date.slice(5)}
              </div>
              <div className="flex-1 text-sm text-ink">
                {e.category}
                {e.note && <span className="ml-2 text-xs text-ink-3">{e.note}</span>}
              </div>
              <div
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  e.kind === 'expense' ? 'text-danger' : 'text-m1'
                )}
              >
                {e.kind === 'expense' ? '-' : '+'}¥{e.amount.toFixed(2)}
              </div>
              <IconButton
                size="sm"
                onClick={() => deleteEntry.mutate(e.id)}
                aria-label="删除"
                className="opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              >
                <Trash2 size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
