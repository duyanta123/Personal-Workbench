import { useMemo, useState } from 'react'
import { CalendarClock, ChevronUp, Plus, Trash2 } from 'lucide-react'
import type { RecurrenceEntityType, RecurrenceFrequency, RecurrenceRule } from '../../types'
import {
  useAddRecurrenceRule,
  useDeleteRecurrenceRule,
  useLedgerRecurrenceSuggestions,
  useRecurrenceRules,
  useUpdateRecurrenceRule,
  type RecurrenceRuleInput
} from '../../hooks/useRecurrences'
import { useCurrentDate } from '../../hooks/useCurrentDate'
import { useToastStore } from '../../stores/toast'
import Button from './Button'
import Input from './Input'

const FREQUENCIES: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: 'daily', label: '每天' }, { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' }, { value: 'yearly', label: '每年' }
]
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function timezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai' } catch { return 'Asia/Shanghai' }
}

function emptyRule(entityType: RecurrenceEntityType, today: string): RecurrenceRuleInput {
  return {
    entity_type: entityType, frequency: 'weekly', interval_count: 1, weekdays: [new Date(`${today}T12:00:00`).getDay()],
    month_day: Number(today.slice(8, 10)), start_date: today, end_date: null, timezone: timezone(), local_time: null,
    enabled: true, generation_mode: 'manual', template: entityType === 'todo'
      ? { text: '', level: 'mid', pinned: false }
      : { kind: 'expense', category: '其他', amount_minor: 0, currency_code: 'CNY', note: null }
  }
}

function ruleLabel(rule: RecurrenceRule) {
  const frequency = FREQUENCIES.find((item) => item.value === rule.frequency)?.label ?? rule.frequency
  const interval = rule.interval_count > 1 ? `，间隔 ${rule.interval_count}` : ''
  const detail = rule.frequency === 'weekly' && rule.weekdays.length
    ? `，周${rule.weekdays.map((day) => WEEKDAYS[day]).join('、')}`
    : rule.frequency === 'monthly' ? `，每月 ${rule.month_day ?? Number(rule.start_date.slice(8, 10))} 日` : ''
  return `${frequency}${interval}${detail}`
}

export default function RecurrencePanel({ entityType }: { entityType: RecurrenceEntityType }) {
  const today = useCurrentDate()
  const rules = useRecurrenceRules(entityType)
  const suggestions = useLedgerRecurrenceSuggestions(today, entityType === 'ledger')
  const add = useAddRecurrenceRule()
  const update = useUpdateRecurrenceRule()
  const remove = useDeleteRecurrenceRule()
  const push = useToastStore((state) => state.push)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => emptyRule(entityType, today))
  const busy = add.isPending || update.isPending || remove.isPending
  const title = entityType === 'todo' ? '周期任务' : '周期账目'
  const template = draft.template
  const set = <K extends keyof RecurrenceRuleInput>(key: K, value: RecurrenceRuleInput[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const setTemplate = (key: string, value: unknown) => setDraft((current) => ({ ...current, template: { ...current.template, [key]: value } }))

  const ordered = useMemo(() => [...(rules.data ?? [])].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.start_date.localeCompare(b.start_date)), [rules.data])

  async function create() {
    try {
      await add.mutateAsync(draft)
      setDraft(emptyRule(entityType, today))
      setOpen(false)
      push({ kind: 'success', message: `${title}已创建` })
    } catch (cause) { push({ kind: 'error', message: cause instanceof Error ? cause.message : '周期规则创建失败' }) }
  }

  async function toggle(rule: RecurrenceRule) {
    try { await update.mutateAsync({ id: rule.id, current: rule, patch: { enabled: !rule.enabled } }) }
    catch (cause) { push({ kind: 'error', message: cause instanceof Error ? cause.message : '更新失败' }) }
  }

  async function deleteRule(rule: RecurrenceRule) {
    if (!window.confirm('删除周期规则？已生成的历史实例会保留。')) return
    try { await remove.mutateAsync(rule.id) } catch (cause) { push({ kind: 'error', message: cause instanceof Error ? cause.message : '删除失败' }) }
  }

  async function acceptSuggestion(suggestion: import('../../hooks/useRecurrences').LedgerRecurrenceSuggestion) {
    try {
      await add.mutateAsync({
        entity_type: 'ledger', frequency: suggestion.frequency, interval_count: 1, weekdays: suggestion.weekdays,
        month_day: suggestion.month_day, start_date: today, end_date: null, timezone: timezone(), local_time: null,
        enabled: true, generation_mode: 'manual', template: suggestion.template
      })
      await suggestions.refetch()
      push({ kind: 'success', message: '已根据建议创建周期账目' })
    } catch (cause) { push({ kind: 'error', message: cause instanceof Error ? cause.message : '建议确认失败' }) }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <CalendarClock size={16} className="text-accent" /><h2 className="text-sm font-bold text-ink">{title}</h2>
        <span className="text-[11px] text-ink-3">{ordered.filter((rule) => rule.enabled).length} 条启用</span>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setOpen((value) => !value)}>
          {open ? <ChevronUp size={14} /> : <Plus size={14} />}{open ? '收起' : '新建规则'}
        </Button>
      </div>

      {open && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {entityType === 'todo' ? (
              <label htmlFor={`${entityType}-recurrence-text`} className="sm:col-span-2 text-xs text-ink-2">待办内容<Input id={`${entityType}-recurrence-text`} className="mt-1" value={String(template.text ?? '')} onChange={(event) => setTemplate('text', event.target.value)} /></label>
            ) : <>
              <label htmlFor="ledger-recurrence-kind" className="text-xs text-ink-2">收支类型<select id="ledger-recurrence-kind" className="mt-1 w-full rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink" value={String(template.kind ?? 'expense')} onChange={(event) => setTemplate('kind', event.target.value)}><option value="expense">支出</option><option value="income">收入</option></select></label>
              <label htmlFor="ledger-recurrence-amount" className="text-xs text-ink-2">金额<Input id="ledger-recurrence-amount" className="mt-1" type="number" min="0.01" step="0.01" value={Number(template.amount_minor ?? 0) / 100 || ''} onChange={(event) => setTemplate('amount_minor', Math.round(Number(event.target.value) * 100))} /></label>
              <label htmlFor="ledger-recurrence-category" className="text-xs text-ink-2">分类<Input id="ledger-recurrence-category" className="mt-1" value={String(template.category ?? '其他')} onChange={(event) => setTemplate('category', event.target.value)} /></label>
              <label htmlFor="ledger-recurrence-mode" className="text-xs text-ink-2">生成方式<select id="ledger-recurrence-mode" className="mt-1 w-full rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink" value={draft.generation_mode} onChange={(event) => set('generation_mode', event.target.value as RecurrenceRuleInput['generation_mode'])}><option value="manual">待确认</option><option value="automatic">自动入账</option></select></label>
            </>}
            <label htmlFor={`${entityType}-recurrence-frequency`} className="text-xs text-ink-2">频率<select id={`${entityType}-recurrence-frequency`} className="mt-1 w-full rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink" value={draft.frequency} onChange={(event) => set('frequency', event.target.value as RecurrenceFrequency)}>{FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label htmlFor={`${entityType}-recurrence-interval`} className="text-xs text-ink-2">间隔<Input id={`${entityType}-recurrence-interval`} className="mt-1" type="number" min="1" max="365" value={draft.interval_count} onChange={(event) => set('interval_count', Number(event.target.value))} /></label>
            <label htmlFor={`${entityType}-recurrence-start`} className="text-xs text-ink-2">开始日期<Input id={`${entityType}-recurrence-start`} className="mt-1" type="date" value={draft.start_date} onChange={(event) => set('start_date', event.target.value)} /></label>
            <label htmlFor={`${entityType}-recurrence-end`} className="text-xs text-ink-2">结束日期<Input id={`${entityType}-recurrence-end`} className="mt-1" type="date" value={draft.end_date ?? ''} onChange={(event) => set('end_date', event.target.value || null)} /></label>
            {(draft.frequency === 'monthly' || draft.frequency === 'yearly') && <label htmlFor={`${entityType}-recurrence-month-day`} className="text-xs text-ink-2">月内日期<Input id={`${entityType}-recurrence-month-day`} className="mt-1" type="number" min="1" max="31" value={draft.month_day ?? ''} onChange={(event) => set('month_day', event.target.value ? Number(event.target.value) : null)} /></label>}
            <label htmlFor={`${entityType}-recurrence-timezone`} className="sm:col-span-2 text-xs text-ink-2">时区<Input id={`${entityType}-recurrence-timezone`} className="mt-1" value={draft.timezone} onChange={(event) => set('timezone', event.target.value)} /></label>
          </div>
          {draft.frequency === 'weekly' && <div className="mt-3 flex flex-wrap gap-2" aria-label="重复星期">{WEEKDAYS.map((label, day) => {
            const selected = draft.weekdays.includes(day)
            return <button key={day} type="button" aria-pressed={selected} onClick={() => set('weekdays', selected ? draft.weekdays.filter((value) => value !== day) : [...draft.weekdays, day])} className={`h-8 w-8 rounded-full border text-xs font-semibold ${selected ? 'border-accent bg-accent text-white' : 'border-border text-ink-2'}`}>{label}</button>
          })}</div>}
          <div className="mt-4 flex justify-end"><Button onClick={() => void create()} disabled={busy}>创建周期规则</Button></div>
        </div>
      )}

      {entityType === 'ledger' && (suggestions.data?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg bg-nested p-3"><div className="text-xs font-semibold text-ink">检测到的周期建议</div><ul className="mt-2 space-y-2">{suggestions.data?.map((suggestion) => <li key={suggestion.key} className="flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate text-ink-2">{suggestion.frequency === 'weekly' ? '每周' : '每月'} · {String(suggestion.template.category)} · {(Number(suggestion.template.amount_minor) / 100).toFixed(2)} · {suggestion.occurrences} 笔</span><Button size="sm" onClick={() => void acceptSuggestion(suggestion)} disabled={add.isPending}>确认创建</Button></li>)}</ul></div>
      )}

      {ordered.length > 0 && <ul className="mt-3 divide-y divide-border">{ordered.map((rule) => (
        <li key={rule.id} className="flex min-w-0 items-center gap-3 py-3">
          <button type="button" role="switch" aria-checked={rule.enabled} onClick={() => void toggle(rule)} disabled={busy} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${rule.enabled ? 'bg-accent' : 'bg-border'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} /></button>
          <div className="min-w-0 flex-1"><p className={`truncate text-sm ${rule.enabled ? 'font-semibold text-ink' : 'text-ink-3'}`}>{entityType === 'todo' ? String(rule.template.text ?? '') : `${String(rule.template.category ?? '其他')} · ${(Number(rule.template.amount_minor ?? 0) / 100).toFixed(2)}`}</p><p className="mt-0.5 truncate text-[11px] text-ink-3">{ruleLabel(rule)} · {rule.timezone}{entityType === 'ledger' ? ` · ${rule.generation_mode === 'automatic' ? '自动入账' : '待确认'}` : ''}</p></div>
          <button type="button" onClick={() => void deleteRule(rule)} disabled={busy} aria-label="删除周期规则" className="text-ink-3 hover:text-danger"><Trash2 size={15} /></button>
        </li>
      ))}</ul>}
      {rules.isLoading && <p className="mt-3 text-xs text-ink-3">加载周期规则…</p>}
      {!rules.isLoading && ordered.length === 0 && !open && <p className="mt-3 text-xs text-ink-3">尚未设置周期规则。</p>}
    </section>
  )
}
