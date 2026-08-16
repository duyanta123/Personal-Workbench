import type { NoteCreateDraft, LedgerCreateDraft, TodoCreateDraft } from './createValidation'
import { BUILTIN_LEDGER_CATEGORIES, categoryAliases } from './ledgerCategories'

export type QuickCaptureKind = 'todo' | 'ledger' | 'note'
export type InboxSuggestedKind = 'habit' | 'goal' | 'practice' | 'workout'
export type CaptureConfidence = 'exact' | 'likely' | 'ambiguous'

export type QuickCaptureCandidate =
  | { kind: 'todo'; confidence: CaptureConfidence; missingFields: string[]; evidence: string[]; draft: TodoCreateDraft }
  | { kind: 'ledger'; confidence: CaptureConfidence; missingFields: string[]; evidence: string[]; draft: LedgerCreateDraft }
  | { kind: 'note'; confidence: CaptureConfidence; missingFields: string[]; evidence: string[]; suggestedKind?: InboxSuggestedKind; draft: NoteCreateDraft }

export interface QuickCaptureResult {
  source: string
  candidates: QuickCaptureCandidate[]
  selectedKind: QuickCaptureKind | null
}

export interface QuickCaptureContext {
  today: string
  categories?: { expense?: string[]; income?: string[] }
}

const PREFIXES: Array<{ regex: RegExp; kind: QuickCaptureKind; ledgerKind?: 'income' | 'expense' }> = [
  { regex: /^\s*(?:待办|提醒)\s*[:：]?\s*/u, kind: 'todo' },
  { regex: /^\s*(?:记账)\s*[:：]?\s*/u, kind: 'ledger' },
  { regex: /^\s*(?:支出)\s*[:：]?\s*/u, kind: 'ledger', ledgerKind: 'expense' },
  { regex: /^\s*(?:收入)\s*[:：]?\s*/u, kind: 'ledger', ledgerKind: 'income' },
  { regex: /^\s*(?:笔记|记录)\s*[:：]?\s*/u, kind: 'note' }
]
const INBOX_ONLY_PREFIXES: Array<{ regex: RegExp; kind: InboxSuggestedKind; label: string }> = [
  { regex: /^\s*(?:习惯)\s*[:：]?\s*/u, kind: 'habit', label: '习惯' },
  { regex: /^\s*(?:目标)\s*[:：]?\s*/u, kind: 'goal', label: '目标' },
  { regex: /^\s*(?:练习|题目)\s*[:：]?\s*/u, kind: 'practice', label: '练习' },
  { regex: /^\s*(?:训练|健身)\s*[:：]?\s*/u, kind: 'workout', label: '训练' }
]

function normalizeNumbers(value: string) {
  return value.replace(/[０-９．]/g, (char) => char === '．' ? '.' : String.fromCharCode(char.charCodeAt(0) - 0xfee0))
}

function dateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

function extractDate(source: string, today: string) {
  const base = new Date(`${today}T12:00:00`)
  const relative = /今天|明天|后天/u.exec(source)
  if (relative) {
    const offset = relative[0] === '今天' ? 0 : relative[0] === '明天' ? 1 : 2
    base.setDate(base.getDate() + offset)
    return { date: dateString(base), token: relative[0] }
  }
  const full = /(?<!\d)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)/u.exec(source)
  if (full) {
    const date = validDate(Number(full[1]), Number(full[2]), Number(full[3]))
    if (date) return { date: dateString(date), token: full[0] }
  }
  const local = /(?<!\d)(\d{1,2})月(\d{1,2})日?/u.exec(source)
  if (local) {
    const date = validDate(base.getFullYear(), Number(local[1]), Number(local[2]))
    if (date) return { date: dateString(date), token: local[0] }
  }
  return null
}

function cleanText(source: string, tokens: string[]) {
  let value = source
  for (const token of tokens) value = value.replace(token, ' ')
  return value.replace(/[，,。；;]\s*$/u, '').replace(/\s+/g, ' ').trim()
}

function extractPriority(source: string) {
  const definitions: Array<{ level: TodoCreateDraft['level']; regex: RegExp; label: string }> = [
    { level: 'high', regex: /(?:高优先级|高优|紧急|!high|\bP0\b)/iu, label: '高优先级' },
    { level: 'low', regex: /(?:低优先级|低优|!low|\bP2\b)/iu, label: '低优先级' },
    { level: 'mid', regex: /(?:中优先级|中优|!mid|\bP1\b)/iu, label: '中优先级' }
  ]
  for (const definition of definitions) {
    const match = definition.regex.exec(source)
    if (match) return { level: definition.level, token: match[0], evidence: `优先级：${definition.label}` }
  }
  return { level: 'mid' as const, token: '', evidence: '' }
}

function extractTags(source: string) {
  const tags: string[] = []
  const tokens: string[] = []
  for (const match of source.matchAll(/(?:^|\s)(#[\p{L}\p{N}_/-]+)/gu)) {
    const token = match[1]
    const tag = token.slice(1).replace(/^\/+|\/+$/g, '')
    if (tag && !tags.includes(tag)) tags.push(tag)
    tokens.push(token)
  }
  return { tags, tokens }
}

function findCategory(source: string, kind: 'income' | 'expense', custom: string[] = []) {
  const categories = [...new Set([...BUILTIN_LEDGER_CATEGORIES[kind], ...custom])]
  return categories.find((category) => category !== '其他' && (
    source.includes(category) || categoryAliases(category).some((alias) => source.includes(alias))
  )) ?? '其他'
}

function amountMatches(source: string) {
  const matches: Array<{ token: string; value: number }> = []
  const regex = /(?:[¥￥]\s*)?(\d+(?:\.\d{1,2})?)\s*(?:元)?/gu
  for (const match of source.matchAll(regex)) {
    const value = Number(match[1])
    if (Number.isFinite(value)) matches.push({ token: match[0], value })
  }
  return matches
}

function todoCandidate(body: string, date: string | null, level: TodoCreateDraft['level'], confidence: CaptureConfidence, evidence: string[]): QuickCaptureCandidate {
  return {
    kind: 'todo', confidence, evidence,
    missingFields: body ? [] : ['text'],
    draft: { text: body, level, due_date: date, done: false, pinned: false }
  }
}

function noteCandidate(body: string, tags: string[], confidence: CaptureConfidence, evidence: string[], suggestedKind?: InboxSuggestedKind): QuickCaptureCandidate {
  return {
    kind: 'note', confidence, evidence, suggestedKind,
    missingFields: body ? [] : ['body'],
    draft: { title: null, body, tags, pinned: false, layout: 'default', image_url: null }
  }
}

function ledgerCandidate(
  source: string,
  today: string,
  context: QuickCaptureContext,
  specifiedKind: 'income' | 'expense' | undefined,
  dateToken: string | null,
  date: string | null,
  confidence: CaptureConfidence,
  evidence: string[]
): QuickCaptureCandidate {
  const amountSource = dateToken ? source.replace(dateToken, ' ') : source
  const amounts = amountMatches(amountSource)
  const hasIncome = /收入|工资|薪资|薪水|奖金|到账|收款|利息|分红/u.test(source)
  const hasExpense = /支出|花了|花费|付款|消费|买|吃|饭|打车|房租/u.test(source)
  const conflict = hasIncome && hasExpense
  const kind = specifiedKind ?? (hasIncome && !hasExpense ? 'income' : 'expense')
  const amount = amounts.length === 1 ? amounts[0].value : null
  const category = findCategory(source, kind, context.categories?.[kind])
  const note = cleanText(source, [dateToken ?? '', ...amounts.map((item) => item.token), '记账', '支出', '收入'].filter(Boolean)) || null
  const ambiguous = amounts.length !== 1 || conflict || /退款/u.test(source)
  return {
    kind: 'ledger',
    confidence: ambiguous ? 'ambiguous' : confidence,
    evidence: [...evidence, ...(category !== '其他' ? [`分类：${category}`] : [])],
    missingFields: amount === null ? ['amount'] : [],
    draft: { kind, category, amount, note, entry_date: date ?? today }
  }
}

export function parseQuickCapture(rawSource: string, context: QuickCaptureContext): QuickCaptureResult {
  const source = normalizeNumbers(rawSource).trim()
  if (!source) return { source: rawSource, candidates: [], selectedKind: null }

  const inboxOnlyPrefix = INBOX_ONLY_PREFIXES.find((item) => item.regex.test(source))
  if (inboxOnlyPrefix) {
    const body = source.replace(inboxOnlyPrefix.regex, '').trim()
    const tags = extractTags(body)
    const candidate = noteCandidate(
      cleanText(body, tags.tokens), tags.tags, 'ambiguous',
      [`显式${inboxOnlyPrefix.label}前缀`, '需要在 Inbox 确认必填字段'], inboxOnlyPrefix.kind
    )
    return { source: rawSource, candidates: [candidate], selectedKind: null }
  }

  const prefix = PREFIXES.find((item) => item.regex.test(source))
  const body = prefix ? source.replace(prefix.regex, '').trim() : source
  const extractedDate = extractDate(body, context.today)
  const withoutDate = cleanText(body, extractedDate ? [extractedDate.token] : [])
  const priority = extractPriority(withoutDate)
  const tagResult = extractTags(body)
  const todoBody = cleanText(withoutDate, [priority.token].filter(Boolean))
  const noteBody = cleanText(body, tagResult.tokens)
  const tagEvidence = tagResult.tags.length ? [`标签：${tagResult.tags.map((tag) => `#${tag}`).join(' ')}`] : []
  const priorityEvidence = priority.evidence ? [priority.evidence] : []

  if (prefix?.kind === 'todo') {
    const candidate = todoCandidate(todoBody, extractedDate?.date ?? null, priority.level, 'exact', ['显式待办前缀', ...priorityEvidence, ...tagEvidence])
    return { source: rawSource, candidates: [candidate], selectedKind: 'todo' }
  }
  if (prefix?.kind === 'note') {
    const candidate = noteCandidate(noteBody, tagResult.tags, 'exact', ['显式笔记前缀', ...tagEvidence])
    return { source: rawSource, candidates: [candidate], selectedKind: 'note' }
  }
  if (prefix?.kind === 'ledger') {
    const candidate = ledgerCandidate(body, context.today, context, prefix.ledgerKind, extractedDate?.token ?? null, extractedDate?.date ?? null, 'exact', ['显式记账前缀'])
    return { source: rawSource, candidates: [candidate], selectedKind: candidate.confidence === 'ambiguous' ? null : 'ledger' }
  }

  const amountSource = extractedDate ? body.replace(extractedDate.token, ' ') : body
  const amounts = amountMatches(amountSource)
  const customCategories = [...(context.categories?.expense ?? []), ...(context.categories?.income ?? [])]
  const ledgerWords = [
    ...BUILTIN_LEDGER_CATEGORIES.expense,
    ...BUILTIN_LEDGER_CATEGORIES.income,
    ...customCategories,
    '吃饭', '午饭', '晚饭', '工资', '到账', '花了', '付款', '消费', '打车'
  ]
  const ledgerSignal = ledgerWords.some((word) => word !== '其他' && body.includes(word))
  const todoSignal = extractedDate && /交|提交|完成|处理|联系|开会|提醒|学习|复习|去|买|跑步|健身|做/u.test(withoutDate)

  if (amounts.length > 0 && ledgerSignal) {
    const ledger = ledgerCandidate(body, context.today, context, undefined, extractedDate?.token ?? null, extractedDate?.date ?? null, 'likely', ['金额与收支关键词'])
    if (ledger.confidence !== 'ambiguous') return { source: rawSource, candidates: [ledger], selectedKind: 'ledger' }
  }
  if (todoSignal) {
    const candidate = todoCandidate(todoBody, extractedDate?.date ?? null, priority.level, 'likely', ['日期与行动语义', ...priorityEvidence, ...tagEvidence])
    return { source: rawSource, candidates: [candidate], selectedKind: 'todo' }
  }

  if (amounts.length > 1 || /退款/u.test(body)) {
    const ledger = ledgerCandidate(body, context.today, context, undefined, extractedDate?.token ?? null, extractedDate?.date ?? null, 'ambiguous', ['存在多个金额或退款语义'])
    return {
      source: rawSource,
      selectedKind: null,
      candidates: [
        ledger,
        todoCandidate(todoBody, extractedDate?.date ?? null, priority.level, 'ambiguous', [...priorityEvidence, ...tagEvidence]),
        noteCandidate(noteBody, tagResult.tags, 'ambiguous', tagEvidence)
      ]
    }
  }

  const candidate = noteCandidate(noteBody, tagResult.tags, 'likely', ['未发现明确待办或记账语义', ...tagEvidence])
  return { source: rawSource, candidates: [candidate], selectedKind: 'note' }
}
