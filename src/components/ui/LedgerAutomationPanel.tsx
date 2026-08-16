import { useMemo, useRef, useState } from 'react'
import { Landmark, Plus, Scale, Sparkles } from 'lucide-react'
import type { LedgerAccountType, LedgerEntry, LedgerRuleStage } from '../../types'
import {
  useAddLedgerAccount, useAddLedgerPayee, useAddLedgerRule, useLedgerAccounts, useLedgerPayees,
  useLedgerReconciliations, useReconcileLedgerAccount
} from '../../hooks/useLedger'
import { parseMoneyToMinor } from '../../utils/money'
import { useCurrentDate } from '../../hooks/useCurrentDate'
import { useToastStore } from '../../stores/toast'
import Button from './Button'
import Input from './Input'

export default function LedgerAutomationPanel({ entries }: { entries: LedgerEntry[] }) {
  const accounts = useLedgerAccounts(); const payees = useLedgerPayees(); const reconciliations = useLedgerReconciliations()
  const addAccount = useAddLedgerAccount(); const addPayee = useAddLedgerPayee(); const addRule = useAddLedgerRule(); const reconcile = useReconcileLedgerAccount()
  const today = useCurrentDate(); const push = useToastStore((state) => state.push)
  const [accountName, setAccountName] = useState(''); const [accountType, setAccountType] = useState<LedgerAccountType>('cash')
  const [opening, setOpening] = useState('0'); const [payeeName, setPayeeName] = useState('')
  const [ruleName, setRuleName] = useState(''); const [ruleStage, setRuleStage] = useState<LedgerRuleStage>('default')
  const [ruleOrder, setRuleOrder] = useState(0); const [conditionText, setConditionText] = useState(''); const [actionCategory, setActionCategory] = useState('')
  const [reconcileAccount, setReconcileAccount] = useState(''); const [statementDate, setStatementDate] = useState(today); const [balance, setBalance] = useState('')
  const [selectedEntries, setSelectedEntries] = useState<string[]>([])
  const reconcileIds = useRef({ commandId: crypto.randomUUID(), reconciliationId: crypto.randomUUID() })
  const eligible = useMemo(() => entries.filter((entry) => entry.status !== 'planned' && !entry.reconciled_at && entry.account_id === reconcileAccount), [entries, reconcileAccount])

  async function createAccount() {
    try {
      await addAccount.mutateAsync({ name: accountName.trim(), type: accountType, opening_balance_minor: parseMoneyToMinor(opening), archived: false })
      setAccountName(''); setOpening('0'); push({ kind: 'success', message: '账户已创建' })
    } catch (cause) { push({ kind: 'error', message: cause instanceof Error ? cause.message : '账户创建失败' }) }
  }
  async function createPayee() {
    try { await addPayee.mutateAsync({ name: payeeName.trim() }); setPayeeName(''); push({ kind: 'success', message: '收付款方已创建' }) }
    catch (cause) { push({ kind: 'error', message: cause instanceof Error ? cause.message : '保存失败' }) }
  }
  async function createRule() {
    try {
      await addRule.mutateAsync({ name: ruleName.trim(), stage: ruleStage, sort_order: ruleOrder, enabled: true,
        conditions: conditionText.trim() ? { note_contains: conditionText.trim() } : {}, actions: { category: actionCategory.trim() } })
      setRuleName(''); setConditionText(''); setActionCategory(''); push({ kind: 'success', message: '记账规则已创建' })
    } catch (cause) { push({ kind: 'error', message: cause instanceof Error ? cause.message : '规则创建失败' }) }
  }
  async function submitReconciliation() {
    try {
      await reconcile.mutateAsync({ accountId: reconcileAccount, statementDate, balanceMinor: parseMoneyToMinor(balance), entryIds: selectedEntries, ...reconcileIds.current })
      reconcileIds.current = { commandId: crypto.randomUUID(), reconciliationId: crypto.randomUUID() }
      setSelectedEntries([]); setBalance(''); push({ kind: 'success', message: '对账已完成' })
    } catch (cause) { push({ kind: 'error', message: cause instanceof Error ? cause.message : '对账失败' }) }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2"><Landmark size={16} className="text-accent" /><h2 className="text-sm font-bold text-ink">账户与自动化</h2></div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-xs font-semibold text-ink">账户与收付款方</summary>
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2"><Input aria-label="账户名称" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="账户名称" /><select aria-label="账户类型" value={accountType} onChange={(e) => setAccountType(e.target.value as LedgerAccountType)} className="rounded-lg border border-border bg-page px-3 text-sm text-ink"><option value="cash">现金</option><option value="bank">银行</option><option value="credit">信用</option><option value="asset">资产</option><option value="liability">负债</option></select></div>
            <div className="flex gap-2"><Input aria-label="期初余额" type="number" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} /><Button size="sm" onClick={() => void createAccount()} disabled={!accountName.trim()}><Plus size={13} />账户</Button></div>
            <div className="flex gap-2"><Input aria-label="收付款方名称" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="收付款方" /><Button size="sm" onClick={() => void createPayee()} disabled={!payeeName.trim()}><Plus size={13} />添加</Button></div>
            <p className="text-[11px] text-ink-3">{accounts.data?.length ?? 0} 个账户 · {payees.data?.length ?? 0} 个收付款方</p>
          </div>
        </details>
        <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-xs font-semibold text-ink"><Sparkles size={13} className="mr-1 inline" />规则</summary>
          <div className="mt-3 space-y-2"><Input aria-label="规则名称" value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="规则名称" />
            <div className="grid grid-cols-2 gap-2"><select aria-label="规则阶段" value={ruleStage} onChange={(e) => setRuleStage(e.target.value as LedgerRuleStage)} className="rounded-lg border border-border bg-page px-3 text-sm text-ink"><option value="pre">前置</option><option value="default">默认</option><option value="post">后置</option></select><Input aria-label="规则顺序" type="number" value={ruleOrder} onChange={(e) => setRuleOrder(Number(e.target.value))} /></div>
            <Input aria-label="备注包含" value={conditionText} onChange={(e) => setConditionText(e.target.value)} placeholder="备注包含" /><Input aria-label="设置分类" value={actionCategory} onChange={(e) => setActionCategory(e.target.value)} placeholder="命中后设置分类" />
            <Button size="sm" onClick={() => void createRule()} disabled={!ruleName.trim() || !actionCategory.trim()}>创建规则</Button>
          </div>
        </details>
        <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-xs font-semibold text-ink"><Scale size={13} className="mr-1 inline" />对账</summary>
          <div className="mt-3 space-y-2"><select aria-label="对账账户" value={reconcileAccount} onChange={(e) => { setReconcileAccount(e.target.value); setSelectedEntries([]) }} className="w-full rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink"><option value="">选择账户</option>{accounts.data?.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <div className="grid grid-cols-2 gap-2"><Input aria-label="账单日期" type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} /><Input aria-label="账单余额" type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="账单余额" /></div>
            <div className="max-h-28 space-y-1 overflow-y-auto">{eligible.map((entry) => <label key={entry.id} className="flex items-center gap-2 text-[11px] text-ink-2"><input type="checkbox" checked={selectedEntries.includes(entry.id)} onChange={(e) => setSelectedEntries((current) => e.target.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id))} />{entry.entry_date} · {entry.category}</label>)}</div>
            <Button size="sm" onClick={() => void submitReconciliation()} disabled={!reconcileAccount || !balance || reconcile.isPending}>确认对账</Button>
            <p className="text-[11px] text-ink-3">已有 {reconciliations.data?.length ?? 0} 个对账批次</p>
          </div>
        </details>
      </div>
    </section>
  )
}
