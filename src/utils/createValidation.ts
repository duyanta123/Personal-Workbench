import type { NoteLayout, Priority } from '../types'
import { LIMITS, requireLength, safeExternalUrl, validateTags } from './validation'

export const MAX_LEDGER_AMOUNT = 9_999_999_999.99

export interface TodoCreateDraft {
  text: string
  level: Priority
  due_date?: string | null
  done?: boolean
  pinned?: boolean
}

export interface LedgerCreateDraft {
  kind: 'income' | 'expense'
  category: string
  amount: number | null
  note: string | null
  entry_date: string
}

export interface NoteCreateDraft {
  title: string | null
  body: string
  tags: string[]
  pinned?: boolean
  layout?: NoteLayout
  image_url?: string | null
}

function validDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label}格式无效`)
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`${label}格式无效`)
  }
  return value
}

export function validateTodoCreate(input: TodoCreateDraft) {
  const text = requireLength(input.text.trim(), LIMITS.title, '待办内容', 1)
  if (!['high', 'mid', 'low'].includes(input.level)) throw new Error('待办优先级无效')
  const dueDate = input.due_date ? validDate(input.due_date, '截止日期') : null
  return {
    text,
    level: input.level,
    due_date: dueDate,
    done: input.done ?? false,
    pinned: input.pinned ?? false
  }
}

export function validateLedgerCreate(input: LedgerCreateDraft) {
  if (input.kind !== 'income' && input.kind !== 'expense') throw new Error('账单类型无效')
  const category = requireLength(input.category.trim(), LIMITS.short, '分类', 1)
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_LEDGER_AMOUNT) {
    throw new Error(`金额必须大于 0 且不超过 ${MAX_LEDGER_AMOUNT}`)
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(input.amount))) throw new Error('金额最多保留两位小数')
  const note = input.note?.trim() || null
  if (note) requireLength(note, LIMITS.body, '备注')
  return {
    kind: input.kind,
    category,
    amount,
    note,
    entry_date: validDate(input.entry_date, '记账日期')
  }
}

export function validateNoteCreate(input: NoteCreateDraft) {
  const body = requireLength(input.body.trim(), LIMITS.body, '正文', 1)
  const title = input.title?.trim() || null
  if (title) requireLength(title, LIMITS.title, '标题')
  const tags = validateTags(input.tags)
  const imageUrl = safeExternalUrl(input.image_url)
  return {
    title,
    body,
    tags,
    pinned: input.pinned ?? false,
    layout: input.layout ?? 'default' as NoteLayout,
    image_url: imageUrl
  }
}
