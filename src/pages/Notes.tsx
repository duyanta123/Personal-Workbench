import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useAddNote, useDeleteNote, useNotes, useUpdateNote } from '../hooks/useNotes'
import type { Note } from '../types'

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

  const inputCls =
    'w-full rounded-xl border border-ink/15 bg-card px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">内容记录</h1>

      {/* 编辑/新建表单 */}
      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="标题（可选）"
          className={inputCls}
        />
        <textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="写点什么：灵感、摘录、收藏的链接…"
          rows={4}
          className={`${inputCls} resize-none`}
        />
        <div className="flex items-center justify-between gap-3">
          <input
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="标签，用逗号分隔（可选）"
            className={`${inputCls} flex-1`}
          />
          <div className="flex gap-2">
            {editingId && (
              <button
                type="button"
                onClick={reset}
                className="rounded-xl bg-nested px-4 py-2 text-sm text-ink-2"
              >
                取消
              </button>
            )}
            <button
              type="submit"
              disabled={!form.body.trim()}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-page disabled:opacity-40"
            >
              {editingId ? '保存修改' : '保存'}
            </button>
          </div>
        </div>
      </form>

      {/* 标签筛选 */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTagFilter(null)}
            className={`rounded-lg px-3 py-1 text-xs transition ${
              tagFilter === null ? 'bg-accent text-page' : 'bg-card text-ink-2'
            }`}
          >
            全部
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className={`rounded-lg px-3 py-1 text-xs transition ${
                tagFilter === t ? 'bg-accent text-page' : 'bg-card text-ink-2'
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* 列表 */}
      {isLoading ? (
        <p className="py-8 text-center text-sm text-ink-3">加载中…</p>
      ) : !filtered?.length ? (
        <p className="py-8 text-center text-sm text-ink-3">
          {tagFilter ? '该标签下还没有记录。' : '还没有记录，写一条吧。'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => (
            <li key={n.id} className="rounded-2xl bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {n.title && <div className="text-sm font-medium">{n.title}</div>}
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{n.body}</p>
                  {n.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {n.tags.map((t) => (
                        <span key={t} className="rounded-md bg-nested px-2 py-0.5 text-xs text-ink-3">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-xs text-ink-3">{n.updated_at.slice(0, 10)}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(n)}
                      aria-label="编辑"
                      className="text-xs text-ink-3 transition hover:text-accent"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => deleteNote.mutate(n.id)}
                      aria-label="删除"
                      className="text-xs text-ink-3 transition hover:text-danger"
                    >
                      删除
                    </button>
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
