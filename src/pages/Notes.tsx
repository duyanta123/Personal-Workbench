import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import {
  NOTES_PAGE_SIZE,
  notesListKey,
  useAddNote,
  useDeleteNote,
  useNoteStats,
  useNoteById,
  useNotes,
  useTogglePin,
  useUpdateNote
} from '../hooks/useNotes'
import type { NotesPage } from '../hooks/useNotes'
import { useDeferredDelete } from '../hooks/useDeferredDelete'
import { useTouch } from '../hooks/useTouch'
import { useToastStore } from '../stores/toast'
import type { Note, NoteLayout } from '../types'
import { useAuth } from '../hooks/useAuth'
import Input from '../components/ui/Input'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import SideCard from '../components/ui/SideCard'
import { cn } from '../lib/cn'
import QueryError from '../components/ui/QueryError'
import { useSearchParams } from 'react-router-dom'
import { useCurrentDate } from '../hooks/useCurrentDate'
import { LIMITS, parseTags, renderTag, requireLength, safeExternalUrl } from '../utils/validation'
import { useClampPage } from '../hooks/useClampPage'
import EntityLinksPanel from '../components/ui/EntityLinksPanel'
import NoteEditor from '../features/notes/NoteEditor'
import NoteCard from '../features/notes/NoteCard'

const EMPTY = { title: '', body: '', tags: '', layout: 'default' as NoteLayout, imageUrl: '' }

export default function Notes() {
  const today = useCurrentDate()
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const notesQuery = useNotes({ page, query: deferredQuery, tag: tagFilter })
  const notes = notesQuery.data?.items ?? []
  useClampPage(notesQuery.data?.total, NOTES_PAGE_SIZE, page, setPage)
  const isLoading = notesQuery.isLoading
  const statsQuery = useNoteStats(today)
  const addNote = useAddNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const togglePin = useTogglePin()
  const push = useToastStore((s) => s.push)
  const touch = useTouch()
  const { userId } = useAuth()

  const [form, setForm] = useState(EMPTY)
  const [preview, setPreview] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  const focusQuery = useNoteById(focusId)
  const allTags = useMemo(() => (statsQuery.data?.tagCounts ?? []).map(([tag]) => tag).sort(), [statsQuery.data])
  const tagCounts = statsQuery.data?.tagCounts ?? []
  const sorted = notes

  useEffect(() => setPage(0), [query, tagFilter])
  useEffect(() => {
    if (!focusId || focusQuery.isLoading || focusQuery.data !== null) return
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
    push({ kind: 'info', message: '定位的笔记不存在或已删除' })
  }, [focusId, focusQuery.isLoading, focusQuery.data, push, searchParams, setSearchParams])

  const { requestDelete, isPending: isDeletePending, remainingSeconds } = useDeferredDelete<Note, NotesPage>({
    key: notesListKey(userId, page, deferredQuery, tagFilter),
    label: (n) => n.title ?? '笔记',
    remove: (id) => deleteNote.mutateAsync(id),
    cache: {
      getItems: (cache) => cache?.items ?? [],
      remove: (cache, id) => cache && {
        items: cache.items.filter((item) => item.id !== id),
        total: Math.max(0, cache.total - 1)
      },
      restore: (cache) => cache
    }
  })

  function reset() {
    setForm(EMPTY)
    setEditingId(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      const body = requireLength(form.body.trim(), LIMITS.body, '正文', 1)
      const payload = {
        title: form.title.trim() ? requireLength(form.title.trim(), LIMITS.title, '标题') : null,
        body,
        tags: parseTags(form.tags),
        layout: form.layout,
        image_url: form.layout === 'feature' ? safeExternalUrl(form.imageUrl) : null
      }
      if (editingId) {
        await updateNote.mutateAsync({ id: editingId, patch: payload })
        push({ kind: 'success', message: '已保存修改' })
      } else {
        await addNote.mutateAsync(payload)
        push({ kind: 'success', message: '已保存' })
      }
      reset()
    } catch (error) {
      push({ kind: 'error', message: error instanceof Error ? error.message : editingId ? '笔记更新失败，请重试' : '笔记保存失败，请重试' })
    }
  }

  function startEdit(n: Note) {
    setEditingId(n.id)
    setForm({
      title: n.title ?? '',
      body: n.body,
      tags: n.tags.join(', '),
      layout: n.layout ?? 'default',
      imageUrl: n.image_url ?? ''
    })
  }

  async function handlePin(n: Note) {
    try {
      await togglePin.mutateAsync({ id: n.id, pinned: !n.pinned })
      push({ kind: 'info', message: n.pinned ? '已取消置顶' : '已置顶' })
    } catch {
      push({ kind: 'error', message: '置顶状态保存失败，请重试' })
    }
  }

  /** 操作按钮组（置顶/编辑/删除） */
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="NOTES"
        title="内容记录"
        description="灵感、摘录与收藏。"
      />
      {(notesQuery.isError || statsQuery.isError) && (
        <QueryError onRetry={() => { notesQuery.refetch(); statsQuery.refetch() }} />
      )}

      {focusQuery.data && (
        <div className="rounded-2xl border border-accent bg-accent-2/40 p-4 shadow-card">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">搜索定位</div>
          <div className="mt-1 text-sm font-semibold text-ink">{focusQuery.data.title ?? '无标题'}</div>
          <p className="mt-1 line-clamp-2 text-xs text-ink-2">{focusQuery.data.body}</p>
          <button type="button" onClick={() => { const next = new URLSearchParams(searchParams); next.delete('focus'); setSearchParams(next, { replace: true }) }} className="mt-2 text-xs font-medium text-accent">关闭定位</button>
        </div>
      )}

      {(editingId || focusQuery.data?.id) && <EntityLinksPanel sourceKind="note" sourceId={editingId ?? focusQuery.data!.id} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {/* 编辑/新建表单 */}
          <NoteEditor
            form={form}
            onChange={setForm}
            allTags={allTags}
            preview={preview}
            onPreviewChange={setPreview}
            editing={Boolean(editingId)}
            busy={addNote.isPending || updateNote.isPending}
            onSubmit={handleSubmit}
            onCancel={reset}
          />

          {/* 搜索 + 标签筛选 */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索标题、正文…"
                className="pl-9"
              />
            </div>
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
                    {renderTag(t)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 列表 */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !sorted.length ? (
            <EmptyState
              icon={<BookOpen size={22} />}
              title={query || tagFilter ? '没有匹配的记录' : '还没有记录'}
              description={query || tagFilter ? undefined : '写一条吧。'}
            />
          ) : (
            <ul className="space-y-2">
              {sorted.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  touch={touch}
                  pending={isDeletePending(note.id)}
                  remainingSeconds={remainingSeconds(note.id)}
                  onPin={() => void handlePin(note)}
                  onEdit={() => startEdit(note)}
                  onDelete={() => requestDelete(note)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* 右栏统计 */}
        <aside className="h-fit space-y-3 lg:sticky lg:top-4">
          <SideCard title="记录统计" icon={<BookOpen size={14} />}>
            <ul className="space-y-2">
              {[
                { k: '累计记录', v: `${statsQuery.data?.total ?? 0} 条` },
                { k: '今日新增', v: `${statsQuery.data?.today ?? 0} 条` },
                { k: '标签种类', v: `${allTags.length} 种` }
              ].map((r) => (
                <li key={r.k} className="flex items-center justify-between text-xs">
                  <span className="text-ink-2">{r.k}</span>
                  <span className="font-bold text-ink tabular-nums">{r.v}</span>
                </li>
              ))}
            </ul>
          </SideCard>
          <SideCard title="标签分布" icon={<BookOpen size={14} />}>
            {tagCounts.length === 0 ? (
              <p className="py-2 text-center text-xs text-ink-3">暂无标签</p>
            ) : (
              <ul className="space-y-2">
                {tagCounts.slice(0, 6).map(([t, c]) => {
                  const max = tagCounts[0][1]
                  return (
                    <li key={t} className="flex items-center gap-2 text-xs">
                      <span className="w-12 shrink-0 truncate text-ink-2">{renderTag(t)}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nested">
                        <div className="h-full rounded-full bg-m5" style={{ width: `${(c / max) * 100}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-ink-3 tabular-nums">{c}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </SideCard>
          {(notesQuery.data?.total ?? 0) > NOTES_PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-2">
              <IconButton
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={page === 0 || notesQuery.isFetching}
                aria-label="上一页"
              >
                <ChevronLeft size={17} />
              </IconButton>
              <span className="text-xs text-ink-3 tabular-nums">
                第 {page + 1} / {Math.ceil((notesQuery.data?.total ?? 0) / NOTES_PAGE_SIZE)} 页
              </span>
              <IconButton
                onClick={() => setPage((value) => value + 1)}
                disabled={(page + 1) * NOTES_PAGE_SIZE >= (notesQuery.data?.total ?? 0) || notesQuery.isFetching}
                aria-label="下一页"
              >
                <ChevronRight size={17} />
              </IconButton>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
