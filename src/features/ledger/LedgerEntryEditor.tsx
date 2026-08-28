import type { FormEvent } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import type { CurrencyCode, LedgerAccount, LedgerPayee, LedgerEntry } from '../../types'
import type { LedgerRuleDraft } from '../../utils/ledgerRules'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Segmented from '../../components/ui/Segmented'
import IconButton from '../../components/ui/IconButton'
import { cn } from '../../lib/cn'
import { CURRENCIES, formatMinor } from '../../utils/money'

type Kind = LedgerEntry['kind']
type Split = { category: string; amount: string; note: string }
type RulePreview = { result: LedgerRuleDraft; changes: Array<{ ruleId: string; name: string; field: string; before: unknown; after: unknown }> }

export default function LedgerEntryEditor({
  kind, onKindChange, editing, onCancel, cats, cat, onCatChange, newCat, onNewCatChange, onAddCustomCat,
  amount, onAmountChange, currency, onCurrencyChange, accounts, accountId, onAccountChange, payees, payeeId,
  onPayeeChange, date, onDateChange, note, onNoteChange, onSubmit, busy, rulePreview, rulesConfirmed,
  onRulesConfirmed, splits, onSplitsChange, splitBalanced, splitMinor, amountMinor
}: {
  kind: Kind
  onKindChange: (kind: Kind) => void
  editing: boolean
  onCancel: () => void
  cats: string[]
  cat: string
  onCatChange: (category: string) => void
  newCat: string
  onNewCatChange: (value: string) => void
  onAddCustomCat: () => void
  amount: string
  onAmountChange: (value: string) => void
  currency: CurrencyCode
  onCurrencyChange: (currency: string) => void
  accounts: Array<Pick<LedgerAccount, 'id' | 'name' | 'archived'>>
  accountId: string
  onAccountChange: (value: string) => void
  payees: Array<Pick<LedgerPayee, 'id' | 'name'>>
  payeeId: string
  onPayeeChange: (value: string) => void
  date: string
  onDateChange: (value: string) => void
  note: string
  onNoteChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  busy: boolean
  rulePreview: RulePreview
  rulesConfirmed: boolean
  onRulesConfirmed: (value: boolean) => void
  splits: Split[]
  onSplitsChange: (value: Split[] | ((current: Split[]) => Split[])) => void
  splitBalanced: boolean
  splitMinor: number
  amountMinor: number
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={kind}
          onChange={(next) => onKindChange(next as Kind)}
          options={[{ value: 'expense' as const, label: '支出' }, { value: 'income' as const, label: '收入' }]}
        />
        {editing && <Button type="button" variant="ghost" size="sm" onClick={onCancel}><X size={14} />取消编辑</Button>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {cats.map((value) => (
          <button key={value} type="button" onClick={() => onCatChange(value)} className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150', cat === value ? 'bg-accent-2 text-accent' : 'bg-nested text-ink-2 hover:bg-hover hover:text-ink')}>
            {value}
          </button>
        ))}
        <div className="inline-flex items-center gap-1 rounded-full bg-nested px-2 py-1">
          <input value={newCat} onChange={(event) => onNewCatChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onAddCustomCat() } }} placeholder="新分类" maxLength={200} className="w-16 bg-transparent text-xs text-ink outline-none placeholder:text-ink-3" />
          <button type="button" onClick={onAddCustomCat} aria-label="添加分类" className="text-ink-3 hover:text-accent"><Plus size={14} /></button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => onAmountChange(event.target.value)} placeholder="金额" max="9999999999.99" className="w-32 tabular-nums" />
        <select aria-label="币种" value={currency} onChange={(event) => onCurrencyChange(event.target.value)} className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink">
          {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
        <select aria-label="账户" value={accountId} onChange={(event) => onAccountChange(event.target.value)} className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink">
          <option value="">默认账户</option>
          {accounts.filter((account) => !account.archived).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <select aria-label="收付款方" value={payeeId} onChange={(event) => onPayeeChange(event.target.value)} className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink">
          <option value="">收付款方（可选）</option>
          {payees.map((payee) => <option key={payee.id} value={payee.id}>{payee.name}</option>)}
        </select>
        <Input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} aria-label="记账日期" className="w-40 tabular-nums" />
        <Input value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="备注（可选）" maxLength={100000} className="min-w-40 flex-1" />
        <Button type="submit" disabled={!amount || Number(amount) <= 0 || !splitBalanced || (rulePreview.changes.length > 0 && !rulesConfirmed) || busy}><Plus size={16} />{editing ? '保存修改' : '记一笔'}</Button>
      </div>

      {rulePreview.changes.length > 0 && (
        <div className="rounded-lg border border-accent/30 bg-accent-2/30 p-3 text-xs text-ink-2">
          <div className="font-semibold text-ink">规则预览</div>
          <ul className="mt-1 space-y-1">{rulePreview.changes.map((change) => <li key={`${change.ruleId}-${change.field}`}>{change.name}：{change.field} {String(change.before ?? '空')} → {String(change.after ?? '空')}</li>)}</ul>
          <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={rulesConfirmed} onChange={(event) => onRulesConfirmed(event.target.checked)} />确认应用以上变更</label>
        </div>
      )}

      {!editing && (
        <div className="rounded-lg border border-border bg-page/50 p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-ink"><span>拆分项（可选）</span><Button type="button" size="sm" variant="ghost" onClick={() => onSplitsChange((items) => [...items, { category: cat, amount: '', note: '' }])}><Plus size={13} />添加</Button></div>
          {splits.map((split, index) => (
            <div key={index} className="mt-2 grid grid-cols-[1fr_7rem_1fr_auto] gap-2">
              <Input aria-label={`拆分分类 ${index + 1}`} value={split.category} onChange={(event) => onSplitsChange((items) => items.map((item, i) => i === index ? { ...item, category: event.target.value } : item))} placeholder="分类" />
              <Input aria-label={`拆分金额 ${index + 1}`} value={split.amount} onChange={(event) => onSplitsChange((items) => items.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} placeholder="金额" inputMode="decimal" />
              <Input aria-label={`拆分备注 ${index + 1}`} value={split.note} onChange={(event) => onSplitsChange((items) => items.map((item, i) => i === index ? { ...item, note: event.target.value } : item))} placeholder="备注" />
              <IconButton type="button" size="sm" onClick={() => onSplitsChange((items) => items.filter((_, i) => i !== index))} aria-label="删除拆分项"><Minus size={14} /></IconButton>
            </div>
          ))}
          {splits.length > 0 && <div className={cn('mt-2 text-right text-xs tabular-nums', splitBalanced ? 'text-ink-3' : 'text-danger')}>拆分合计 {formatMinor(Math.max(0, splitMinor), currency)} / 原账目 {formatMinor(amountMinor, currency)}{!splitBalanced && '，金额必须严格相等'}</div>}
        </div>
      )}
    </form>
  )
}
