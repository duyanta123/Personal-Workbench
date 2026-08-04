import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { BookOpen, Pencil, Save, Trash2, X } from 'lucide-react'
import { useAddNote, useDeleteNote, useNotes, useUpdateNote } from '../hooks/useNotes'
import type { Note } from '../types'
import Button from '../components/ui/Button'
import Input, { Textarea } from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import { cn } from '../lib/cn'

const EMPTY = { title: '', body: '', tags: '' }

export default function Notes() {
  const { data: notes, isLoading } = useNotes()
  const addNote = useAddNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()

  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const n of notes ?? []) for (const t of n.tags) s.add(t)
    return [...s].sort()
  }, [notes])

  const filtered = useMemo(() => {
    if (!tagFilter) return notes
    return (notes ?? []).filter((n) => n.tags.includes(tagFilter))
  }, [notes, tagFilter])

  function reset() {
    setForm(EMPTY)
    setEditingId(null)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const body = form.body.trim()
    if (!body) return
    const payload = {
      title: form.title.trim() || null,
      body,
      tags: form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
    }
    if (editingId) {
      updateNote.mutate({ id: editingId, patch: payload })
    } else {
      addNote.mutate(payload)
    }
    reset()
  }

  function startEdit(n: Note) {
    setEditingId(n.id)
    setForm({ title: n.title ?? '', body: n.body, tags: n.tags.join(', ') })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="NOTES"
        title="内容记录"
        description="灵感、摘录与收藏。"
      />

      {/* 编辑/新建表单 */}
      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="标题（可选）"
        />
        <Textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="写点什么：灵感、摘录、收藏的链接…"
          rows={4}
          noResize
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="标签，用逗号分隔（可选）"
            className="min-w-48 flex-1"
          />
          <div className="flex gap-2">
            {editingId && (
              <Button type="button" variant="ghost" onClick={reset}>
                <X size={16} />
                取消
              </Button>
            )}
            <Button type="submit" disabled={!form.body.trim()}>
              <Save size={16} />
              {editingId ? '保存修改' : '保存'}
            </Button>
          </div>
        </div>
      </form>

      {/* 标签筛选 */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTagFilter(null)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
              tagFilter === null
                ? 'bg-accent text-white'
                : 'bg-surface text-ink-2 hover:bg-hover hover:text-ink'
            )}
          >
            全部
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                tagFilter === t
                  ? 'bg-accent text-white'
                  : 'bg-surface text-ink-2 hover:bg-hover hover:text-ink'
              )}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* 列表 */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !filtered?.length ? (
        <EmptyState
          icon={<BookOpen size={22} />}
          title={tagFilter ? '该标签下还没有记录' : '还没有记录'}
          description={tagFilter ? undefined : '写一条吧。'}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => (
            <li
              key={n.id}
              className="group rounded-2xl border border-border bg-surface p-4 transition-colors duration-150 hover:bg-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {n.title && <div className="text-sm font-medium text-ink">{n.title}</div>}
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
                    {n.body}
                  </p>
                  {n.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {n.tags.map((t) => (
                        <Badge key={t} variant="neutral">
                          #{t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-xs text-ink-3 tabular-nums">{n.updated_at.slice(0, 10)}</span>
                  <div
                    className="flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  >
                    <IconButton size="sm" onClick={() => startEdit(n)} aria-label="编辑">
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton size="sm" onClick={() => deleteNote.mutate(n.id)} aria-label="删除">
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
