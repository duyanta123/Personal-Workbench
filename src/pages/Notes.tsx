import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Pencil, Pin, PinOff, Save, Search, Trash2, X } from 'lucide-react'
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
import Button from '../components/ui/Button'
import Input, { Textarea } from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import Segmented from '../components/ui/Segmented'
import SideCard from '../components/ui/SideCard'
import { cn } from '../lib/cn'
import QueryError from '../components/ui/QueryError'
import { useSearchParams } from 'react-router-dom'
import { useCurrentDate } from '../hooks/useCurrentDate'
import { LIMITS, parseTags, renderTag, requireLength, safeExternalUrl, safeExternalUrlOrNull } from '../utils/validation'
import { useClampPage } from '../hooks/useClampPage'
import MarkdownPreview from '../components/ui/MarkdownPreview'
import EntityLinksPanel from '../components/ui/EntityLinksPanel'

const LAYOUT_OPTIONS = [
  { value: 'default' as const, label: '标准' },
  { value: 'quote' as const, label: '引文' },
  { value: 'feature' as const, label: '大图' }
]

const EMPTY = { title: '', body: '', tags: '', layout: 'default' as NoteLayout, imageUrl: '' }

function NoteImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  const safeSrc = safeExternalUrlOrNull(src)
  if (!safeSrc || failed) {
    return <div role="img" aria-label="图片加载失败" className="flex h-40 items-center justify-center bg-nested text-xs text-ink-3">图片无法加载</div>
  }
  return (
    <img
      src={safeSrc}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-40 w-full object-cover"
    />
  )
}

/** 标签输入框：基于已有标签提供 # 前缀补全（键盘 ↑↓ 选择、Enter/点击确认）。 */
function TagInput({ value, onChange, allTags }: { value: string; onChange: (value: string) => void; allTags: string[] }) {
  const [highlight, setHighlight] = useState(0)

  const activeToken = (() => {
    const token = value.split(/[,，\s]+/).at(-1) ?? ''
    return token.replace(/^#/, '')
  })()
  const existing = new Set(parseTags(value))
  const suggestions = activeToken
    ? allTags.filter((tag) => tag.startsWith(activeToken) && !existing.has(tag)).slice(0, 8)
    : []

  function pick(tag: string) {
    const head = value.split(/[,，\s]+/).slice(0, -1).filter(Boolean)
    const next = [...head, tag].join(', ')
    onChange(next)
    setHighlight(0)
  }

  return (
    <div className="relative min-w-48 flex-1">
      <Input
        value={value}
        onChange={(event) => { onChange(event.target.value); setHighlight(0) }}
        onKeyDown={(event) => {
          if (!suggestions.length) return
          if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight((current) => (current + 1) % suggestions.length) }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight((current) => (current - 1 + suggestions.length) % suggestions.length) }
          else if (event.key === 'Enter') { event.preventDefault(); pick(suggestions[highlight] ?? suggestions[0]) }
        }}
        placeholder="标签，用逗号分隔（可选），输入 # 或文字获得补全"
        maxLength={LIMITS.tags * (LIMITS.tag + 1)}
        aria-label="标签"
      />
      {suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="标签补全"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-overlay"
        >
          {suggestions.map((tag, index) => (
            <li key={tag} role="option" aria-selected={index === highlight}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => { event.preventDefault(); pick(tag) }}
                className={cn(
                  'block w-full px-3 py-1.5 text-left text-xs',
                  index === highlight ? 'bg-hover text-ink' : 'text-ink-2'
                )}
              >
                {renderTag(tag)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

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
  function renderActions(n: Note) {
    return (
      <div
        className={cn(
          'flex gap-1',
          touch ? '' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'
        )}
      >
        <IconButton size="sm" onClick={() => handlePin(n)} disabled={isDeletePending(n.id)} aria-label={n.pinned ? '取消置顶' : '置顶'}>
          {n.pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </IconButton>
        <IconButton size="sm" onClick={() => startEdit(n)} disabled={isDeletePending(n.id)} aria-label="编辑">
          <Pencil size={15} />
        </IconButton>
        <IconButton size="sm" onClick={() => requestDelete(n)} disabled={isDeletePending(n.id)} aria-label="删除">
          <Trash2 size={15} />
        </IconButton>
      </div>
    )
  }

  function renderCard(n: Note) {
    // 引文布局
    if (n.layout === 'quote') {
      return (
        <li
          key={n.id}
          className={cn('group rounded-2xl border bg-surface px-6 py-5 transition-colors duration-150 hover:bg-hover', isDeletePending(n.id) ? 'border-danger/40 opacity-60' : 'border-border')}
        >
          <div className="flex items-center justify-end gap-2">{isDeletePending(n.id) && <Badge variant="danger">待删除 {remainingSeconds(n.id)}s</Badge>}{renderActions(n)}</div>
          <p className="pt-1 text-center text-base font-medium leading-relaxed text-ink">
            <MarkdownPreview source={n.body} className="text-center" />
          </p>
          <div className="mt-3 text-center text-xs text-ink-3">
            {n.tags.length > 0 && n.tags.map((t) => `${renderTag(t)}`).join(' ')}
            {n.tags.length > 0 && ' · '}
            {n.updated_at.slice(0, 10)}
          </div>
        </li>
      )
    }

    // 大图布局（无图时回退标准）
    if (n.layout === 'feature' && n.image_url) {
      return (
        <li
          key={n.id}
          className={cn('group overflow-hidden rounded-2xl border bg-surface transition-colors duration-150 hover:bg-hover', isDeletePending(n.id) ? 'border-danger/40 opacity-60' : 'border-border')}
        >
          <div className="relative">
            <NoteImage src={n.image_url} />
            <div className="absolute right-2 top-2 rounded-xl bg-surface/90 p-1 backdrop-blur">
              {isDeletePending(n.id) && <Badge variant="danger">待删除 {remainingSeconds(n.id)}s</Badge>}
              {renderActions(n)}
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-1.5">
              {n.title && <div className="text-sm font-medium text-ink">{n.title}</div>}
              {n.pinned && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-m3">
                  <Pin size={11} /> 置顶
                </span>
              )}
            </div>
            <div className="mt-1 line-clamp-4 text-sm leading-relaxed text-ink-2"><MarkdownPreview source={n.body} /></div>
            {n.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {n.tags.map((t) => (
                  <Badge key={t} variant="neutral">
                    {renderTag(t)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </li>
      )
    }

    // 标准布局
    return (
      <li
        key={n.id}
        className={cn('group rounded-2xl border bg-surface p-4 transition-colors duration-150 hover:bg-hover', isDeletePending(n.id) ? 'border-danger/40 opacity-60' : 'border-border')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {n.title && <div className="text-sm font-medium text-ink">{n.title}</div>}
              {n.pinned && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-m3">
                  <Pin size={11} /> 置顶
                </span>
              )}
            </div>
            <div className="mt-1 text-sm leading-relaxed text-ink-2"><MarkdownPreview source={n.body} /></div>
            {n.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {n.tags.map((t) => (
                  <Badge key={t} variant="neutral">
                    {renderTag(t)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {isDeletePending(n.id) && <Badge variant="danger">待删除 {remainingSeconds(n.id)}s</Badge>}
            <span className="text-xs text-ink-3 tabular-nums">{n.updated_at.slice(0, 10)}</span>
            {renderActions(n)}
          </div>
        </div>
      </li>
    )
  }

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
          <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="标题（可选）"
              maxLength={LIMITS.title}
            />
            {preview ? (
              <div className="min-h-32 rounded-lg border border-border bg-page p-3"><MarkdownPreview source={form.body || '暂无内容'} /></div>
            ) : (
              <Textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="写点什么：支持 Markdown、层级标签和安全链接…"
                rows={4}
                noResize
                maxLength={LIMITS.body}
              />
            )}
            <div className="flex justify-end"><Button type="button" size="sm" variant="ghost" onClick={() => setPreview((value) => !value)}>{preview ? '编辑 Markdown' : '预览 Markdown'}</Button></div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={form.layout}
                onChange={(v) => setForm({ ...form, layout: v })}
                options={LAYOUT_OPTIONS}
              />
              {form.layout === 'feature' && (
                <Input
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="图片 URL（可选）"
                  maxLength={LIMITS.url}
                  className="min-w-40 flex-1"
                />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} allTags={allTags} />
              <div className="flex gap-2">
                {editingId && (
                  <Button type="button" variant="ghost" onClick={reset}>
                    <X size={16} />
                    取消
                  </Button>
                )}
                <Button type="submit" disabled={!form.body.trim() || addNote.isPending || updateNote.isPending}>
                  <Save size={16} />
                  {editingId ? '保存修改' : '保存'}
                </Button>
              </div>
            </div>
          </form>

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
            <ul className="space-y-2">{sorted.map(renderCard)}</ul>
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
