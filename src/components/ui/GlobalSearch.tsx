import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Dumbbell, Inbox, ListTodo, Repeat2, Search, Target, Wallet, Wrench, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useGlobalSearch } from '../../hooks/useGlobalSearch'
import type { SearchResultItem } from '../../types'
import Input from './Input'
import QueryError from './QueryError'
import Modal from './Modal'
import { formatMinor } from '../../utils/money'

interface Group {
  title: string
  icon: LucideIcon
  cls: string
  items: SearchResultItem[]
}

const GROUPS: Record<string, { title: string; icon: LucideIcon; cls: string }> = {
  todo: { title: '待办', icon: ListTodo, cls: 'bg-m1/10 text-m1' },
  habit: { title: '习惯', icon: Repeat2, cls: 'bg-m2/10 text-m2' },
  ledger: { title: '记账', icon: Wallet, cls: 'bg-m3/10 text-m3' },
  goal: { title: '目标', icon: Target, cls: 'bg-m4/10 text-m4' },
  note: { title: '笔记', icon: BookOpen, cls: 'bg-m5/10 text-m5' },
  practice: { title: '练习', icon: Wrench, cls: 'bg-m6/10 text-m6' },
  workout: { title: '训练', icon: Dumbbell, cls: 'bg-m7/10 text-m7' },
  inbox: { title: '收件箱', icon: Inbox, cls: 'bg-m8/10 text-m8' }
}

function normalizeResults(value: unknown): SearchResultItem[] {
  if (Array.isArray(value)) return value as SearchResultItem[]
  if (!value || typeof value !== 'object') return []
  const legacy = value as { todos?: Array<{ id: string; text: string; done?: boolean }>; notes?: Array<{ id: string; title?: string | null; body: string }>; ledger?: Array<{ id: string; category: string; kind: string; amount: number; note?: string | null }> }
  return [
    ...(legacy.todos ?? []).map((item) => ({ kind: 'todo' as const, id: item.id, title: item.text, subtitle: item.done ? '已完成' : null, route: `/todos?focus=${encodeURIComponent(item.id)}`, matchField: 'text', updatedAt: '' })),
    ...(legacy.notes ?? []).map((item) => ({ kind: 'note' as const, id: item.id, title: item.title ?? '无标题', subtitle: item.body.slice(0, 40), route: `/notes?focus=${encodeURIComponent(item.id)}`, matchField: 'title', updatedAt: '' })),
    ...(legacy.ledger ?? []).map((item) => ({ kind: 'ledger' as const, id: item.id, title: item.category, subtitle: `${item.kind === 'expense' ? '-' : '+'}${formatMinor(Math.round(item.amount * 100))}${item.note ? ` · ${item.note}` : ''}`, route: `/ledger?focus=${encodeURIComponent(item.id)}`, matchField: 'category', updatedAt: '', }))
  ]
}

/** 跨模块全局搜索（待办 / 笔记 / 记账） */
export default function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const deferredQuery = useDeferredValue(q)
  const searchQuery = useGlobalSearch(deferredQuery, open)

  useEffect(() => {
    if (open) setQ('')
  }, [open])

  const groups = useMemo<Group[]>(() => {
    const grouped = new Map<string, SearchResultItem[]>()
    for (const item of normalizeResults(searchQuery.data)) grouped.set(item.kind, [...(grouped.get(item.kind) ?? []), item])
    return Object.entries(GROUPS).map(([kind, meta]) => ({ ...meta, items: grouped.get(kind) ?? [] })).filter((group) => group.items.length > 0)
  }, [searchQuery.data])

  const total = groups.reduce((s, g) => s + g.items.length, 0)

  function go(route: string) {
    onClose()
    navigate(route)
  }

  return (
    <Modal open={open} onClose={onClose} title="全局搜索" panelClassName="max-w-xl">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search size={18} className="shrink-0 text-ink-3" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索待办、笔记、账单…"
              className="border-0 bg-transparent px-0 py-0 focus:border-0"
            />
            <button onClick={onClose} aria-label="关闭搜索" className="shrink-0 text-ink-3 hover:text-ink">
              <X size={18} />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {!q.trim() ? (
              <p className="px-3 py-6 text-center text-sm text-ink-3">输入关键词，跨模块搜索</p>
            ) : searchQuery.isLoading ? (
              <p className="px-3 py-6 text-center text-sm text-ink-3">搜索中…</p>
            ) : searchQuery.isError ? (
              <QueryError onRetry={() => searchQuery.refetch()} />
            ) : total === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-3">没有找到「{q.trim()}」</p>
            ) : (
              groups
                .filter((g) => g.items.length > 0)
                .map((g) => (
                  <div key={g.title} className="mb-1">
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                      {g.title} · {g.items.length}
                    </p>
                    {g.items.slice(0, 6).map((it) => (
                      <button
                        key={it.id}
                        onClick={() => go(it.route)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-hover"
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${g.cls}`}>
                          <g.icon size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{it.title}</span>
                          {it.subtitle && <span className="block truncate text-xs text-ink-3">{it.subtitle}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                ))
            )}
          </div>
        </div>
    </Modal>
  )
}
