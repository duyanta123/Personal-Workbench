import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useAddLedgerEntry, useDeleteLedgerEntry, useLedgerEntries } from '../hooks/useLedger'
import { monthPrefix, todayStr } from '../utils/date'
import type { LedgerEntry } from '../types'

const CATS = {
  expense: ['餐饮', '交通', '购物', '居住', '娱乐', '学习', '医疗', '其他'],
  income: ['工资', '奖金', '理财', '其他']
} as const

const kindTxt: Record<LedgerEntry['kind'], string> = { income: '收入', expense: '支出' }

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

  const inputCls =
    'rounded-xl border border-ink/15 bg-card px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">记账</h1>

      {/* 本月汇总 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-card p-4 shadow-card">
          <div className="text-xs text-ink-3">本月支出</div>
          <div className="mt-1 text-lg font-semibold text-danger">-¥{expenseTotal.toFixed(2)}</div>
        </div>
        <div className="rounded-2xl bg-card p-4 shadow-card">
          <div className="text-xs text-ink-3">本月收入</div>
          <div className="mt-1 text-lg font-semibold text-m1">+¥{incomeTotal.toFixed(2)}</div>
        </div>
        <div className="rounded-2xl bg-card p-4 shadow-card">
          <div className="text-xs text-ink-3">结余</div>
          <div className="mt-1 text-lg font-semibold">¥{(incomeTotal - expenseTotal).toFixed(2)}</div>
        </div>
      </div>

      {/* 添加账单 */}
      <form onSubmit={handleAdd} className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
        <div className="flex rounded-xl bg-nested p-1 text-sm">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k)
                setCat(CATS[k][0])
              }}
              className={`flex-1 rounded-lg py-1.5 transition ${
                kind === k ? 'bg-accent font-medium text-page' : 'text-ink-2'
              }`}
            >
              {kindTxt[k]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATS[kind].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${
                cat === c ? 'bg-accent-2 font-medium text-accent' : 'bg-nested text-ink-2'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="金额"
            className={`${inputCls} w-32`}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注（可选）"
            className={`${inputCls} flex-1 min-w-40`}
          />
          <button
            type="submit"
            disabled={!amount || Number(amount) <= 0}
            className="rounded-xl bg-accent px-4 text-sm font-medium text-page disabled:opacity-40"
          >
            记一笔
          </button>
        </div>
      </form>

      {/* 支出构成 */}
      {catTotals.length > 0 && (
        <div className="rounded-2xl bg-card p-4 shadow-card">
          <h2 className="text-sm font-semibold">本月支出构成</h2>
          <div className="mt-3 space-y-2">
            {catTotals.map(([c, v]) => (
              <div key={c} className="flex items-center gap-3 text-xs">
                <span className="w-10 shrink-0 text-ink-2">{c}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-nested">
                  <div
                    className="h-full rounded-full bg-m3"
                    style={{ width: `${maxCat ? (v / maxCat) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-ink-2">¥{v.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 明细 */}
      {isLoading ? (
        <p className="py-8 text-center text-sm text-ink-3">加载中…</p>
      ) : !entries?.length ? (
        <p className="py-8 text-center text-sm text-ink-3">还没有账单，先记一笔吧。</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-card">
              <div className="w-20 shrink-0 text-xs text-ink-3">{e.entry_date.slice(5)}</div>
              <div className="flex-1 text-sm">
                {e.category}
                {e.note && <span className="ml-2 text-xs text-ink-3">{e.note}</span>}
              </div>
              <div className={`text-sm font-medium ${e.kind === 'expense' ? 'text-danger' : 'text-m1'}`}>
                {e.kind === 'expense' ? '-' : '+'}¥{e.amount.toFixed(2)}
              </div>
              <button
                onClick={() => deleteEntry.mutate(e.id)}
                aria-label="删除"
                className="text-sm text-ink-3 transition hover:text-danger"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
