import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ListTodo, Search, Wallet, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useGlobalSearch } from '../../hooks/useGlobalSearch'
import Input from './Input'
import QueryError from './QueryError'
import Modal from './Modal'

interface Group {
  title: string
  to: string
  icon: LucideIcon
  cls: string
  items: { id: string; text: string; sub?: string }[]
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
    const r = searchQuery.data ?? { todos: [], notes: [], ledger: [] }
    return [
      {
        title: '待办',
        to: '/todos',
        icon: ListTodo,
        cls: 'bg-m1/10 text-m1',
        items: r.todos.map((t) => ({ id: t.id, text: t.text, sub: t.done ? '已完成' : undefined }))
      },
      {
        title: '内容记录',
        to: '/notes',
        icon: BookOpen,
        cls: 'bg-m5/10 text-m5',
        items: r.notes.map((n) => ({ id: n.id, text: n.title ?? '无标题', sub: n.body.slice(0, 40) }))
      },
      {
        title: '记账',
        to: '/ledger',
        icon: Wallet,
        cls: 'bg-m3/10 text-m3',
        items: r.ledger.map((e) => ({
          id: e.id,
          text: e.category,
          sub: `${e.kind === 'expense' ? '-' : '+'}¥${e.amount.toFixed(2)}${e.note ? ` · ${e.note}` : ''}`
        }))
      }
    ]
  }, [searchQuery.data])

  const total = groups.reduce((s, g) => s + g.items.length, 0)

  function go(to: string, id: string) {
    onClose()
    navigate(`${to}?focus=${encodeURIComponent(id)}`)
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
                        onClick={() => go(g.to, it.id)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-hover"
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${g.cls}`}>
                          <g.icon size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{it.text}</span>
                          {it.sub && <span className="block truncate text-xs text-ink-3">{it.sub}</span>}
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
