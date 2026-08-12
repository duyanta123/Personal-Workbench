import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ListTodo, Sparkles, Wallet, X } from 'lucide-react'
import type { QuickCaptureCandidate, QuickCaptureKind } from '../../utils/quickCapture'
import { parseQuickCapture } from '../../utils/quickCapture'
import { parseTags } from '../../utils/validation'
import { BUILTIN_LEDGER_CATEGORIES } from '../../utils/ledgerCategories'
import { MAX_LEDGER_AMOUNT, validateLedgerCreate, validateNoteCreate, validateTodoCreate } from '../../utils/createValidation'
import { submitQuickCapture } from '../../lib/quickCaptureSubmit'
import { useAuth } from '../../hooks/useAuth'
import { useCurrentDate } from '../../hooks/useCurrentDate'
import { usePreferences, mergeCategories } from '../../hooks/usePreferences'
import { useToastStore } from '../../stores/toast'
import { useUiStore } from '../../stores/ui'
import Modal from './Modal'
import Button from './Button'
import Input, { Textarea } from './Input'
import { cn } from '../../lib/cn'

const KIND_META = {
  todo: { label: '待办', icon: ListTodo },
  ledger: { label: '记账', icon: Wallet },
  note: { label: '笔记', icon: BookOpen }
} as const

function byKind(candidates: QuickCaptureCandidate[]) {
  return new Map(candidates.map((candidate) => [candidate.kind, candidate]))
}

function fallbackCandidate(kind: QuickCaptureKind, source: string, today: string): QuickCaptureCandidate {
  if (kind === 'todo') return {
    kind, confidence: 'ambiguous', missingFields: source.trim() ? [] : ['text'], evidence: [],
    draft: { text: source.trim(), level: 'mid', due_date: null, done: false, pinned: false }
  }
  if (kind === 'ledger') return {
    kind, confidence: 'ambiguous', missingFields: ['amount'], evidence: [],
    draft: { kind: 'expense', category: '其他', amount: null, note: source.trim() || null, entry_date: today }
  }
  return {
    kind, confidence: 'ambiguous', missingFields: source.trim() ? [] : ['body'], evidence: [],
    draft: { title: null, body: source.trim(), tags: [], pinned: false, layout: 'default', image_url: null }
  }
}

export default function QuickCaptureDialog() {
  const open = useUiStore((state) => state.quickCaptureOpen)
  const initialSource = useUiStore((state) => state.quickCaptureSource)
  const close = useUiStore((state) => state.closeQuickCapture)
  const { userId, canWrite } = useAuth()
  const today = useCurrentDate()
  const preferences = usePreferences()
  const push = useToastStore((state) => state.push)
  const [source, setSource] = useState('')
  const [selectedKind, setSelectedKind] = useState<QuickCaptureKind>('note')
  const [candidate, setCandidate] = useState<QuickCaptureCandidate>(() => fallbackCandidate('note', '', today))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [noteTags, setNoteTags] = useState('')
  const operationId = useRef(crypto.randomUUID())
  const customCategories = preferences.data?.categories

  const parsed = useMemo(() => parseQuickCapture(source, { today, categories: customCategories }), [source, today, customCategories])
  const parsedByKind = useMemo(() => byKind(parsed.candidates), [parsed.candidates])

  useEffect(() => {
    if (!open) return
    setSource(initialSource)
    const result = parseQuickCapture(initialSource, { today, categories: customCategories })
    const kind = result.selectedKind ?? result.candidates[0]?.kind ?? 'note'
    setSelectedKind(kind)
    setCandidate(result.candidates.find((item) => item.kind === kind) ?? fallbackCandidate(kind, initialSource, today))
    const initialCandidate = result.candidates.find((item) => item.kind === kind)
    setNoteTags(initialCandidate?.kind === 'note' ? initialCandidate.draft.tags.join(', ') : '')
    operationId.current = crypto.randomUUID()
    setError('')
  }, [open, initialSource, today, customCategories])

  function handleSourceChange(value: string) {
    setSource(value)
    const result = parseQuickCapture(value, { today, categories: customCategories })
    const kind = result.selectedKind ?? result.candidates[0]?.kind ?? 'note'
    setSelectedKind(kind)
    setCandidate(result.candidates.find((item) => item.kind === kind) ?? fallbackCandidate(kind, value, today))
    const nextCandidate = result.candidates.find((item) => item.kind === kind)
    setNoteTags(nextCandidate?.kind === 'note' ? nextCandidate.draft.tags.join(', ') : '')
    setError('')
  }

  function chooseKind(kind: QuickCaptureKind) {
    setSelectedKind(kind)
    setCandidate(parsedByKind.get(kind) ?? fallbackCandidate(kind, source, today))
    const nextCandidate = parsedByKind.get(kind)
    setNoteTags(nextCandidate?.kind === 'note' ? nextCandidate.draft.tags.join(', ') : '')
    setError('')
  }

  function updateDraft(patch: Record<string, unknown>) {
    setCandidate((current) => ({ ...current, draft: { ...current.draft, ...patch } } as QuickCaptureCandidate))
    setError('')
  }

  function validateCurrent() {
    if (candidate.kind === 'todo') return validateTodoCreate(candidate.draft)
    if (candidate.kind === 'ledger') return validateLedgerCreate(candidate.draft)
    return validateNoteCreate(candidate.draft)
  }

  let validationError = ''
  try {
    validateCurrent()
    if (candidate.kind === 'note') parseTags(noteTags)
  } catch (cause) { validationError = (cause as Error).message }

  async function submit() {
    if (!userId || !canWrite || validationError || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const candidateToSubmit = candidate.kind === 'note'
        ? { ...candidate, draft: { ...candidate.draft, tags: parseTags(noteTags) } } as QuickCaptureCandidate
        : candidate
      const result = await submitQuickCapture(userId, candidateToSubmit, operationId.current)
      push({
        kind: result.status === 'queued' ? 'info' : 'success',
        message: result.status === 'queued' ? '网络中断，记录已加入待同步' : `${KIND_META[candidate.kind].label}已保存`
      })
      close()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const expenseCategories = mergeCategories(BUILTIN_LEDGER_CATEGORIES.expense, customCategories?.expense)
  const incomeCategories = mergeCategories(BUILTIN_LEDGER_CATEGORIES.income, customCategories?.income)

  return (
    <Modal open={open} onClose={close} title="智能快速记录" panelClassName="max-w-xl">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Sparkles size={18} className="text-accent" />
          <div>
            <h3 className="text-sm font-bold text-ink">智能快速记录</h3>
            <p className="text-[11px] text-ink-3">本地解析，确认后才会保存</p>
          </div>
          <button onClick={close} aria-label="关闭智能快速记录" className="ml-auto text-ink-3 hover:text-ink"><X size={18} /></button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label htmlFor="quick-capture-source" className="mb-1.5 block text-xs font-medium text-ink-2">一句话记录</label>
            <Textarea id="quick-capture-source" data-autofocus rows={2} value={source} onChange={(event) => handleSourceChange(event.target.value)} placeholder="例如：中午和同事吃饭 45" maxLength={100000} disabled={!canWrite} />
            {!canWrite && <p role="alert" className="mt-1.5 text-xs text-m3">当前为离线只读模式，联网并验证会话后才能记录。</p>}
          </div>

          {source.trim() && (
            <>
              <div role="tablist" aria-label="记录类型" className="grid grid-cols-3 gap-2">
                {(Object.keys(KIND_META) as QuickCaptureKind[]).map((kind) => {
                  const meta = KIND_META[kind]
                  const Icon = meta.icon
                  return (
                    <button key={kind} role="tab" aria-selected={selectedKind === kind} onClick={() => chooseKind(kind)} className={cn('flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold', selectedKind === kind ? 'border-accent bg-accent-2 text-accent' : 'border-border text-ink-2 hover:bg-hover')}>
                      <Icon size={14} /> {meta.label}
                    </button>
                  )
                })}
              </div>

              {candidate.evidence.length > 0 && <p className="text-xs text-ink-3">识别依据：{candidate.evidence.join(' · ')}</p>}

              {candidate.kind === 'todo' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label htmlFor="quick-todo-text" className="sm:col-span-2 text-xs text-ink-2">待办内容<Input id="quick-todo-text" className="mt-1" value={candidate.draft.text} maxLength={1000} onChange={(event) => updateDraft({ text: event.target.value })} /></label>
                  <label htmlFor="quick-todo-level" className="text-xs text-ink-2">优先级<select id="quick-todo-level" className="mt-1 w-full rounded-xl border border-border bg-page px-3 py-2 text-sm text-ink" value={candidate.draft.level} onChange={(event) => updateDraft({ level: event.target.value })}><option value="high">高</option><option value="mid">中</option><option value="low">低</option></select></label>
                  <label htmlFor="quick-todo-date" className="text-xs text-ink-2">截止日期<Input id="quick-todo-date" className="mt-1" type="date" value={candidate.draft.due_date ?? ''} onChange={(event) => updateDraft({ due_date: event.target.value || null })} /></label>
                </div>
              )}

              {candidate.kind === 'ledger' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label htmlFor="quick-ledger-kind" className="text-xs text-ink-2">类型<select id="quick-ledger-kind" className="mt-1 w-full rounded-xl border border-border bg-page px-3 py-2 text-sm text-ink" value={candidate.draft.kind} onChange={(event) => updateDraft({ kind: event.target.value, category: '其他' })}><option value="expense">支出</option><option value="income">收入</option></select></label>
                  <label htmlFor="quick-ledger-amount" className="text-xs text-ink-2">金额<Input id="quick-ledger-amount" className="mt-1" type="number" min="0.01" max={MAX_LEDGER_AMOUNT} step="0.01" value={candidate.draft.amount ?? ''} onChange={(event) => updateDraft({ amount: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                  <label htmlFor="quick-ledger-category" className="text-xs text-ink-2">分类<select id="quick-ledger-category" className="mt-1 w-full rounded-xl border border-border bg-page px-3 py-2 text-sm text-ink" value={candidate.draft.category} onChange={(event) => updateDraft({ category: event.target.value })}>{(candidate.draft.kind === 'expense' ? expenseCategories : incomeCategories).map((category) => <option key={category}>{category}</option>)}</select></label>
                  <label htmlFor="quick-ledger-date" className="text-xs text-ink-2">日期<Input id="quick-ledger-date" className="mt-1" type="date" value={candidate.draft.entry_date} onChange={(event) => updateDraft({ entry_date: event.target.value })} /></label>
                  <label htmlFor="quick-ledger-note" className="sm:col-span-2 text-xs text-ink-2">备注<Textarea id="quick-ledger-note" className="mt-1" rows={2} maxLength={100000} value={candidate.draft.note ?? ''} onChange={(event) => updateDraft({ note: event.target.value || null })} /></label>
                </div>
              )}

              {candidate.kind === 'note' && (
                <div className="space-y-3">
                  <label htmlFor="quick-note-title" className="block text-xs text-ink-2">标题（可选）<Input id="quick-note-title" className="mt-1" maxLength={1000} value={candidate.draft.title ?? ''} onChange={(event) => updateDraft({ title: event.target.value || null })} /></label>
                  <label htmlFor="quick-note-body" className="block text-xs text-ink-2">正文<Textarea id="quick-note-body" className="mt-1" rows={4} maxLength={100000} value={candidate.draft.body} onChange={(event) => updateDraft({ body: event.target.value })} /></label>
                  <label htmlFor="quick-note-tags" className="block text-xs text-ink-2">标签（逗号分隔）<Input id="quick-note-tags" className="mt-1" value={noteTags} onChange={(event) => { setNoteTags(event.target.value); setError('') }} /></label>
                </div>
              )}

              {(error || validationError) && <p role="alert" className="text-xs text-danger">{error || validationError}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={close}>取消</Button>
                <Button onClick={() => void submit()} disabled={!canWrite || Boolean(validationError) || submitting}>{submitting ? '保存中…' : `确认保存为${KIND_META[candidate.kind].label}`}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
