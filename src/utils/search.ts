import type { LedgerEntry, Note, Todo } from '../types'

/** 按查询词过滤：任一命中的字段包含关键词即通过（大小写不敏感，空查询返回全部） */
export function searchBy<T>(items: T[], query: string, pick: (item: T) => string[]): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((it) => pick(it).some((f) => f.toLowerCase().includes(q)))
}

export interface SearchResult {
  todos: Todo[]
  notes: Note[]
  ledger: LedgerEntry[]
}

/** 跨模块搜索：待办标题 / 笔记标题正文标签 / 记账分类备注 */
export function searchAll(
  data: { todos: Todo[]; notes: Note[]; ledger: LedgerEntry[] },
  query: string
): SearchResult {
  return {
    todos: searchBy(data.todos, query, (t) => [t.text]),
    notes: searchBy(data.notes, query, (n) => [n.title ?? '', n.body, ...n.tags]),
    ledger: searchBy(data.ledger, query, (e) => [e.category, e.note ?? ''])
  }
}
