import { useState } from 'react'
import { Settings2, X } from 'lucide-react'
import type { CurrencyCode } from '../../types'
import type { useUpdatePreferences } from '../../hooks/usePreferences'
import { useToastStore } from '../../stores/toast'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import IconButton from '../../components/ui/IconButton'
import { formatMinor, parseMoneyToMinor } from '../../utils/money'

export default function LedgerBudgetBar({
  budget, budgetMinor, expenseMinor, currency, updatePrefs
}: {
  budget: number | null
  budgetMinor: number | null
  expenseMinor: number
  currency: CurrencyCode
  updatePrefs: ReturnType<typeof useUpdatePreferences>
}) {
  const [budgetEdit, setBudgetEdit] = useState(false)
  const [budgetVal, setBudgetVal] = useState('')
  const push = useToastStore((s) => s.push)

  async function saveBudget() {
    const v = Number(budgetVal)
    if (!Number.isFinite(v) || v <= 0) return
    try {
      await updatePrefs.mutateAsync({ monthly_budget: v, monthly_budget_minor: parseMoneyToMinor(budgetVal) })
      setBudgetEdit(false)
      push({ kind: 'success', message: `预算设为 ¥${v}` })
    } catch {
      push({ kind: 'error', message: '预算保存失败，请重试' })
    }
  }

  async function clearBudget() {
    try {
      await updatePrefs.mutateAsync({ monthly_budget: null, monthly_budget_minor: null })
      setBudgetEdit(false)
      setBudgetVal('')
      push({ kind: 'success', message: '已清除预算' })
    } catch {
      push({ kind: 'error', message: '预算清除失败，请重试' })
    }
  }

  return (
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
            {budgetMinor !== null ? (
              <span className="text-ink">
                本月预算{' '}
                <span className="font-bold tabular-nums">{formatMinor(budgetMinor, currency)}</span>
                <span className="ml-2 text-xs text-ink-3">
                  剩余 <span className="tabular-nums">{formatMinor(budgetMinor - expenseMinor, currency)}</span>
                </span>
              </span>
            ) : (
              <span className="text-ink-3">设置月度预算，控制支出</span>
            )}
          </div>
          <button
            onClick={() => {
              setBudgetVal(budgetMinor ? String(budgetMinor / 100) : '')
              setBudgetEdit(true)
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
          >
            <Settings2 size={13} />
            {budgetMinor !== null ? '调整' : '设置'}
          </button>
        </>
      )}
    </div>
  )
}
