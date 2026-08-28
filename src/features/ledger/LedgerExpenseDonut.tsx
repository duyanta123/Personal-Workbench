import type { CurrencyCode } from '../../types'
import { donutStops } from '../../utils/ledgerStats'
import { formatMinor } from '../../utils/money'

export default function LedgerExpenseDonut({
  catTotals, expenseMinor, currency
}: {
  catTotals: [string, number][]
  expenseMinor: number
  currency: CurrencyCode
}) {
  const donut = donutStops(catTotals)
  const donutBg =
    donut.length > 0
      ? `conic-gradient(${donut
          .map((s, i) => `${s.color} ${i === 0 ? 0 : donut[i - 1].stop}% ${s.stop}%`)
          .join(', ')})`
      : 'none'

  return (
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
              {formatMinor(expenseMinor, currency)}
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
              {formatMinor(s.value, currency)} · {Math.round(s.pct)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
