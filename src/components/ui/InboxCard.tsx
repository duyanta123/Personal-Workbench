import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Inbox, Sparkles, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { InboxItem } from '../../types'
import { useRouteInboxItem, type InboxRouteKind } from '../../hooks/useTodayWorkspace'
import { useCurrentDate } from '../../hooks/useCurrentDate'
import { parseQuickCapture, type QuickCaptureCandidate } from '../../utils/quickCapture'
import { useToastStore } from '../../stores/toast'
import Button from './Button'
import Input, { Textarea } from './Input'
import Modal from './Modal'

const ROUTE_OPTIONS: Array<{ value: InboxRouteKind; label: string }> = [
  { value: 'todo', label: '待办' }, { value: 'ledger', label: '账目' }, { value: 'note', label: '笔记' },
  { value: 'habit', label: '习惯' }, { value: 'goal', label: '目标' }, { value: 'practice', label: '练习' },
  { value: 'workout', label: '训练' }
]

function candidateFor(item: InboxItem, kind: InboxRouteKind, today: string) {
  const stored = item.parsed_candidates.find((value): value is QuickCaptureCandidate => {
    return Boolean(value) && typeof value === 'object' && (value as { kind?: unknown }).kind === kind
  })
  if (stored) return stored.draft as unknown as Record<string, unknown>
  const parsed = parseQuickCapture(item.raw_text, { today })
  const candidate = parsed.candidates.find((value) => value.kind === kind)
  if (candidate) return candidate.draft as unknown as Record<string, unknown>
  return null
}

export function initialInboxDraft(item: InboxItem, kind: InboxRouteKind, today: string): Record<string, unknown> {
  const parsed = candidateFor(item, kind, today)
  const suggested = item.parsed_candidates.find((value): value is QuickCaptureCandidate =>
    Boolean(value) && typeof value === 'object' && (value as { suggestedKind?: unknown }).suggestedKind === kind)
  const sourceText = suggested?.kind === 'note' ? suggested.draft.body : item.raw_text
  if (parsed && kind === 'ledger') return {
    ...parsed,
    amount_minor: parsed.amount == null ? null : Math.round(Number(parsed.amount) * 100),
    currency_code: 'CNY',
    status: 'posted'
  }
  if (parsed) return parsed
  if (kind === 'todo') return { text: sourceText, level: 'mid', due_date: null, pinned: false, done: false }
  if (kind === 'ledger') return { kind: 'expense', category: '其他', amount_minor: null, currency_code: 'CNY', note: sourceText, entry_date: today, status: 'posted' }
  if (kind === 'note') return { title: null, body: sourceText, tags: [], pinned: false, layout: 'default', image_url: null }
  if (kind === 'habit') return { name: sourceText, emoji: 'flame', pinned: false, tracking_type: 'boolean', period_days: 1, target_count: 1, target_mode: 'at_least' }
  if (kind === 'goal') return { name: sourceText, emoji: 'target', current: 0, target: 1, unit: null, note: null, pinned: false }
  if (kind === 'practice') return { title: sourceText, platform: 'leetcode', difficulty: 'medium', status: 'todo', tags: [], url: null, note: null }
  return { date: today, body_part: sourceText, duration_min: null, note: null }
}

function validateRoute(kind: InboxRouteKind, draft: Record<string, unknown>) {
  const required = kind === 'todo' ? draft.text : kind === 'ledger' ? draft.amount_minor : kind === 'note' ? draft.body
    : kind === 'habit' || kind === 'goal' ? draft.name : kind === 'practice' ? draft.title : draft.body_part
  if (required === null || required === undefined || String(required).trim() === '') return '请补齐必填字段'
  if (kind === 'ledger' && (!Number.isSafeInteger(Number(draft.amount_minor)) || Number(draft.amount_minor) <= 0)) return '金额必须大于 0'
  if (kind === 'goal' && (!(Number(draft.target) > 0))) return '目标值必须大于 0'
  return ''
}

function InboxRouteDialog({ item, onClose }: { item: InboxItem; onClose: () => void }) {
  const today = useCurrentDate()
  const route = useRouteInboxItem()
  const push = useToastStore((state) => state.push)
  const suggested = ROUTE_OPTIONS.some((option) => option.value === item.suggested_kind) ? item.suggested_kind as InboxRouteKind : 'note'
  const [kind, setKind] = useState<InboxRouteKind>(suggested)
  const [draft, setDraft] = useState<Record<string, unknown>>(() => initialInboxDraft(item, suggested, today))
  const ids = useRef({ commandId: crypto.randomUUID(), targetId: crypto.randomUUID() })
  const error = validateRoute(kind, draft)

  useEffect(() => { setDraft(initialInboxDraft(item, kind, today)) }, [item, kind, today])
  const set = (field: string, value: unknown) => setDraft((current) => ({ ...current, [field]: value }))

  async function submit() {
    if (error || route.isPending) return
    try {
      await route.mutateAsync({ itemId: item.id, kind, payload: draft, ...ids.current })
      push({ kind: 'success', message: `已分流为${ROUTE_OPTIONS.find((option) => option.value === kind)?.label}` })
      onClose()
    } catch (cause) {
      push({ kind: 'error', message: cause instanceof Error ? cause.message : '分流失败' })
    }
  }

  return (
    <Modal open onClose={onClose} title="分流收件箱" panelClassName="max-w-lg">
      <div className="rounded-lg border border-border bg-surface p-5 shadow-overlay">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-ink">分流收件箱</h3><p className="mt-1 line-clamp-2 text-xs text-ink-3">{item.raw_text}</p></div>
          <button onClick={onClose} aria-label="关闭分流" className="text-ink-3 hover:text-ink"><X size={18} /></button>
        </div>
        <label htmlFor="inbox-route-kind" className="mt-4 block text-xs text-ink-2">目标类型
          <select id="inbox-route-kind" value={kind} onChange={(event) => setKind(event.target.value as InboxRouteKind)} className="mt-1 w-full rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink">
            {ROUTE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {kind === 'todo' && <><label htmlFor="inbox-todo-text" className="sm:col-span-2 text-xs text-ink-2">内容<Input id="inbox-todo-text" className="mt-1" value={String(draft.text ?? '')} onChange={(e) => set('text', e.target.value)} /></label><label htmlFor="inbox-todo-due" className="text-xs text-ink-2">截止日期<Input id="inbox-todo-due" className="mt-1" type="date" value={String(draft.due_date ?? '')} onChange={(e) => set('due_date', e.target.value || null)} /></label></>}
          {kind === 'ledger' && <><label htmlFor="inbox-ledger-amount" className="text-xs text-ink-2">金额<Input id="inbox-ledger-amount" className="mt-1" type="number" min="0.01" step="0.01" value={draft.amount_minor == null ? '' : Number(draft.amount_minor) / 100} onChange={(e) => set('amount_minor', e.target.value ? Math.round(Number(e.target.value) * 100) : null)} /></label><label htmlFor="inbox-ledger-category" className="text-xs text-ink-2">分类<Input id="inbox-ledger-category" className="mt-1" value={String(draft.category ?? '其他')} onChange={(e) => set('category', e.target.value)} /></label><label htmlFor="inbox-ledger-note" className="sm:col-span-2 text-xs text-ink-2">备注<Textarea id="inbox-ledger-note" className="mt-1" rows={2} value={String(draft.note ?? '')} onChange={(e) => set('note', e.target.value || null)} /></label></>}
          {kind === 'note' && <><label htmlFor="inbox-note-title" className="sm:col-span-2 text-xs text-ink-2">标题<Input id="inbox-note-title" className="mt-1" value={String(draft.title ?? '')} onChange={(e) => set('title', e.target.value || null)} /></label><label htmlFor="inbox-note-body" className="sm:col-span-2 text-xs text-ink-2">正文<Textarea id="inbox-note-body" className="mt-1" rows={4} value={String(draft.body ?? '')} onChange={(e) => set('body', e.target.value)} /></label></>}
          {kind === 'habit' && <label htmlFor="inbox-habit-name" className="sm:col-span-2 text-xs text-ink-2">习惯名称<Input id="inbox-habit-name" className="mt-1" value={String(draft.name ?? '')} onChange={(e) => set('name', e.target.value)} /></label>}
          {kind === 'goal' && <><label htmlFor="inbox-goal-name" className="text-xs text-ink-2">目标名称<Input id="inbox-goal-name" className="mt-1" value={String(draft.name ?? '')} onChange={(e) => set('name', e.target.value)} /></label><label htmlFor="inbox-goal-target" className="text-xs text-ink-2">目标值<Input id="inbox-goal-target" className="mt-1" type="number" min="0.01" value={String(draft.target ?? 1)} onChange={(e) => set('target', Number(e.target.value))} /></label></>}
          {kind === 'practice' && <label htmlFor="inbox-practice-title" className="sm:col-span-2 text-xs text-ink-2">题目<Input id="inbox-practice-title" className="mt-1" value={String(draft.title ?? '')} onChange={(e) => set('title', e.target.value)} /></label>}
          {kind === 'workout' && <><label htmlFor="inbox-workout-part" className="text-xs text-ink-2">训练部位<Input id="inbox-workout-part" className="mt-1" value={String(draft.body_part ?? '')} onChange={(e) => set('body_part', e.target.value)} /></label><label htmlFor="inbox-workout-date" className="text-xs text-ink-2">日期<Input id="inbox-workout-date" className="mt-1" type="date" value={String(draft.date ?? today)} onChange={(e) => set('date', e.target.value)} /></label></>}
        </div>
        {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>取消</Button><Button onClick={() => void submit()} disabled={Boolean(error) || route.isPending}>{route.isPending ? '分流中…' : '确认分流'}</Button></div>
      </div>
    </Modal>
  )
}

export default function InboxCard({ items, focusId }: { items: InboxItem[]; focusId?: string | null }) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<InboxItem | null>(null)
  const pending = useMemo(() => items.filter((item) => item.status === 'pending'), [items])
  const focusIndex = focusId ? pending.findIndex((item) => item.id === focusId) : -1
  const visible = pending.slice(0, focusIndex >= 8 ? focusIndex + 1 : 8)
  const focusRef = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    if (focusId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [focusId, pending.length])

  return (
    <div id="inbox" className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Inbox size={16} className="text-accent" /><h2 className="text-sm font-extrabold text-ink">收件箱</h2>
        <span className="rounded-full bg-accent-2 px-2 py-0.5 text-[10px] font-semibold text-accent">{pending.length}</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => navigate('/?focus=inbox')}>查看全部 <ArrowRight size={13} /></Button>
      </div>
      {pending.length === 0 ? <p className="mt-4 flex items-center gap-2 text-xs text-ink-3"><Sparkles size={14} />快速记录中的歧义内容会出现在这里。</p> : (
        <ul className="mt-3 divide-y divide-border">{visible.map((item) => (
          <li
            key={item.id}
            ref={item.id === focusId ? focusRef : undefined}
            className={item.id === focusId
              ? 'flex min-w-0 items-center gap-2 rounded-lg border border-accent bg-accent-2/40 px-2 py-2'
              : 'flex min-w-0 items-center gap-2 py-2'}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /><span className="min-w-0 flex-1 truncate text-sm text-ink">{item.raw_text}</span><Button size="sm" variant="secondary" onClick={() => setSelected(item)}>分流</Button>
          </li>
        ))}</ul>
      )}
      {selected && <InboxRouteDialog item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
