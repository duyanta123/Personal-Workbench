import { Wallet } from 'lucide-react'
import type { CurrencyCode } from '../../types'
import SideCard from '../../components/ui/SideCard'
import { formatMinor } from '../../utils/money'

export default function LedgerStatsAside({
  incomeMinor, expenseMinor, todayExpenseMinor, total, catTotals, currency
}: {
  incomeMinor: number
  expenseMinor: number
  todayExpenseMinor: number
  total: number
  catTotals: [string, number][]
  currency: CurrencyCode
}) {
  return (
    <aside className="h-fit space-y-3 lg:sticky lg:top-4">
      <SideCard title="收支概况" icon={<Wallet size={14} />}>
        <ul className="space-y-2">
          {[
            { k: '本月收入', v: formatMinor(incomeMinor, currency), c: 'var(--m1)' },
            { k: '本月支出', v: formatMinor(expenseMinor, currency), c: 'var(--danger)' },
            { k: '净结余', v: formatMinor(incomeMinor - expenseMinor, currency) },
            { k: '今日支出', v: formatMinor(todayExpenseMinor, currency) },
            { k: '总笔数', v: `${total} 笔` }
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
              const pct = expenseMinor ? Math.round((val / expenseMinor) * 100) : 0
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
  )
}
