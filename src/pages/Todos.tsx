import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Pin,
  PinOff,
  Pencil,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react'
import {
  useAddTodo,
  useDeleteTodo,
  useMoveTodo,
  useTodoById,
  useTodoStats,
  useTodos,
  useToggleTodo,
  useToggleTodoPin,
  useUpdateTodo,
  TODOS_PAGE_SIZE,
  todosListKey
} from '../hooks/useTodos'
import type { TodoPage } from '../hooks/useTodos'
import { useDeferredDelete } from '../hooks/useDeferredDelete'
import { useTouch } from '../hooks/useTouch'
import { useToastStore } from '../stores/toast'
import { dateStr } from '../utils/date'
import type { Priority, Todo } from '../types'
import { useAuth } from '../hooks/useAuth'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Segmented from '../components/ui/Segmented'
import Progress from '../components/ui/Progress'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import Ring from '../components/ui/Ring'
import SideCard from '../components/ui/SideCard'
import { cn } from '../lib/cn'
import QueryError from '../components/ui/QueryError'
import { useSearchParams } from 'react-router-dom'
import { useCurrentDate } from '../hooks/useCurrentDate'
import { useClampPage } from '../hooks/useClampPage'

const LEVEL_META: Record<Priority, { label: string; variant: 'danger' | 'warning' | 'accent' }> = {
  high: { label: '高', variant: 'danger' },
  mid: { label: '中', variant: 'warning' },
  low: { label: '低', variant: 'accent' }
}

const LEVEL_OPTIONS = (Object.keys(LEVEL_META) as Priority[]).map((lv) => ({
  value: lv,
  label: `${LEVEL_META[lv].label}优先级`
}))

/** 未完成任务按 逾期 → 今天/无日期 → 未来 分组 */
function dueMeta(t: Todo, today: string) {
  if (!t.due_date) return { group: 'today', label: '' }
  if (t.due_date < today) {
    const days = Math.round((new Date(today).getTime() - new Date(t.due_date).getTime()) / 86400000)
    return { group: 'overdue', label: `逾期 ${days} 天`, danger: true as const }
  }
  if (t.due_date === today) return { group: 'today', label: '今天' }
  return { group: 'future', label: t.due_date.slice(5).replace('-', '/') }
}

export default function Todos() {
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const todosQuery = useTodos({ page, query: deferredQuery })
  const todos = todosQuery.data?.items
  useClampPage(todosQuery.data?.total, TODOS_PAGE_SIZE, page, setPage)
  const isLoading = todosQuery.isLoading
  const statsQuery = useTodoStats()
  const addTodo = useAddTodo()
  const toggleTodo = useToggleTodo()
  const togglePin = useToggleTodoPin()
  const updateTodo = useUpdateTodo()
  const moveTodo = useMoveTodo()
  const deleteTodo = useDeleteTodo()
  const push = useToastStore((s) => s.push)
  const touch = useTouch()
  const { userId } = useAuth()

  const [text, setText] = useState('')
  const [level, setLevel] = useState<Priority>('mid')
  const [due, setDue] = useState<string>('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  const focusQuery = useTodoById(focusId)

  const today = useCurrentDate()
  const doneCount = statsQuery.data?.done ?? 0
  const totalCount = statsQuery.data?.total ?? 0
  const pct = totalCount ? (doneCount / totalCount) * 100 : 0

  const normalizedQuery = query.trim().toLowerCase()
  const searching = normalizedQuery.length > 0
  const notDone = useMemo(
    () => (todos ?? []).filter((todo) => !todo.done && (!searching || todo.text.toLowerCase().includes(normalizedQuery))),
    [normalizedQuery, searching, todos]
  )
  const doneList = (todos ?? []).filter(
    (todo) => todo.done && (!searching || todo.text.toLowerCase().includes(normalizedQuery))
  )

  // 侧栏统计
  const byLevel = statsQuery.data?.byLevel ?? { high: 0, mid: 0, low: 0 }

  useEffect(() => setPage(0), [query])
  useEffect(() => {
    if (!focusId || focusQuery.isLoading || focusQuery.data !== null) return
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
    push({ kind: 'info', message: '定位的待办不存在或已删除' })
  }, [focusId, focusQuery.isLoading, focusQuery.data, push, searchParams, setSearchParams])

  const { requestDelete, isPending: isDeletePending, remainingSeconds } = useDeferredDelete<Todo, TodoPage>({
    key: todosListKey(userId, page, deferredQuery),
    label: (t) => t.text,
    remove: (id) => deleteTodo.mutateAsync(id),
    cache: {
      getItems: (cache) => cache?.items ?? [],
      remove: (cache, id) => cache && { items: cache.items.filter((item) => item.id !== id), total: Math.max(0, cache.total - 1) },
      restore: (cache) => cache
    }
  })

  function handleDropOn(targetId: string) {
    if (!dragId || dragId === targetId) return
    const from = notDone.findIndex((t) => t.id === dragId)
    const to = notDone.findIndex((t) => t.id === targetId)
    if (from < 0 || to < 0) return
    if (notDone[from].pinned !== notDone[to].pinned) {
      push({ kind: 'info', message: '置顶与普通待办不能跨组拖动，请先切换置顶状态' })
      setDragId(null)
      return
    }
    moveTodo.mutate({ id: dragId, anchorId: targetId, position: from < to ? 'after' : 'before' }, {
      onError: () => push({ kind: 'error', message: '排序保存失败，请重试' })
    })
    setDragId(null)
  }

  function move(id: string, dir: -1 | 1) {
    const idx = notDone.findIndex((t) => t.id === id)
    const to = idx + dir
    if (idx < 0 || to < 0 || to >= notDone.length) return
    if (notDone[idx].pinned !== notDone[to].pinned) return
    moveTodo.mutate({
      id,
      anchorId: notDone[to].id,
      position: dir < 0 ? 'before' : 'after'
    }, { onError: () => push({ kind: 'error', message: '排序保存失败，请重试' }) })
  }

  async function handleToggle(t: Todo) {
    const nextDone = !t.done
    try {
      await toggleTodo.mutateAsync({ id: t.id, done: nextDone })
      if (nextDone) {
        const refreshed = await statsQuery.refetch()
        const nextStats = refreshed.data ?? statsQuery.data
        push({ kind: 'success', message: nextStats && nextStats.done >= nextStats.total ? '今日计划全部完成' : `完成「${t.text}」` })
      }
    } catch {
      push({ kind: 'error', message: '待办状态保存失败，请重试' })
    }
  }

  async function handlePin(t: Todo) {
    try {
      await togglePin.mutateAsync({ id: t.id, pinned: !t.pinned })
      push({ kind: 'info', message: t.pinned ? '已取消置顶' : '已置顶' })
    } catch {
      push({ kind: 'error', message: '待办置顶保存失败，请重试' })
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    try {
      if (editingId) {
        await updateTodo.mutateAsync({ id: editingId, patch: { text: t, level, due_date: due || null } })
        push({ kind: 'success', message: '待办已更新' })
      } else {
        await addTodo.mutateAsync({ text: t, level, due_date: due || null })
        push({ kind: 'success', message: '待办已添加' })
      }
      setText('')
      setDue('')
      setEditingId(null)
    } catch {
      push({ kind: 'error', message: editingId ? '待办更新失败，请重试' : '待办添加失败，请重试' })
    }
  }

  function startEdit(todo: Todo) {
    setEditingId(todo.id)
    setText(todo.text)
    setLevel(todo.level)
    setDue(todo.due_date ?? '')
  }

  function quickDue(offset: number | null) {
    setDue(offset === null ? '' : dateStr(offset))
  }

  const LEVEL_ROW = [
    { key: 'high', label: '高优先级', color: 'var(--danger)' },
    { key: 'mid', label: '中优先级', color: 'var(--m3)' },
    { key: 'low', label: '低优先级', color: 'var(--accent)' }
  ] as const

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="TODAY"
        title="每日计划"
        description={
          totalCount ? `${doneCount} / ${totalCount} 已完成` : '把今天要做的事写下来。'
        }
        actions={
          totalCount > 0 ? (
            <span className="text-sm font-semibold text-m1 tabular-nums">{Math.round(pct)}%</span>
          ) : undefined
        }
      />
      {todosQuery.isError && <QueryError onRetry={() => todosQuery.refetch()} />}

      {focusQuery.data && (
        <div className="rounded-2xl border border-accent bg-accent-2/40 p-4 shadow-card">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">搜索定位</div>
          <div className="mt-1 text-sm font-semibold text-ink">{focusQuery.data.text}</div>
          <button
            type="button"
            onClick={() => { const next = new URLSearchParams(searchParams); next.delete('focus'); setSearchParams(next, { replace: true }) }}
            className="mt-2 text-xs font-medium text-accent"
          >
            关闭定位
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* 左栏 */}
        <div className="min-w-0 space-y-4">
          {totalCount > 0 && (
            <Progress value={pct} color="bg-m1" className={pct === 100 ? 'progress-done' : ''} />
          )}

          {/* 搜索 */}
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索待办…"
              maxLength={1000}
              className="pl-9"
            />
          </div>

          {/* 添加表单 */}
          <form onSubmit={handleAdd} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="今天要做什么？" maxLength={1000} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Segmented value={level} onChange={setLevel} options={LEVEL_OPTIONS} />
                <Input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  aria-label="截止日期"
                  className="w-40 tabular-nums"
                />
                <div className="flex items-center gap-1 text-xs">
                  {[
                    { label: '今天', v: 0 },
                    { label: '明天', v: 1 },
                    { label: '清空', v: null }
                  ].map((c) => (
                    <button
                      key={String(c.v)}
                      type="button"
                      onClick={() => quickDue(c.v)}
                      className={cn(
                        'rounded-full px-2.5 py-1 font-medium transition-colors',
                        due === dateStr(c.v ?? 999)
                          ? 'bg-accent-2 text-accent'
                          : 'bg-nested text-ink-2 hover:bg-hover hover:text-ink'
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
              <Button type="submit" disabled={!text.trim() || addTodo.isPending || updateTodo.isPending}>
                <Plus size={16} />
                {editingId ? '保存' : '添加'}
              </Button>
              {editingId && <IconButton type="button" onClick={() => { setEditingId(null); setText(''); setDue('') }} aria-label="取消编辑"><X size={16} /></IconButton>}
              </div>
            </div>
          </form>

          {/* 未完成任务 */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !todos?.length ? (
            <EmptyState
              icon={<ClipboardList size={22} />}
              title="暂无待办"
              description="从上面添加第一条吧。"
            />
          ) : (
            <>
              {notDone.length === 0 && searching ? (
                <EmptyState icon={<Search size={22} />} title="没有匹配的待办" />
              ) : (
                <ul className="space-y-2">
                  {notDone.map((t) => {
                    const due = dueMeta(t, today)
                    return (
                      <li
                        key={t.id}
                        draggable={!searching && !isDeletePending(t.id)}
                        onDragStart={(e: DragEvent) => {
                          setDragId(t.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={(e: DragEvent) => e.preventDefault()}
                        onDrop={(e: DragEvent) => {
                          e.preventDefault()
                          handleDropOn(t.id)
                        }}
                        className={cn(
                          'group flex items-center gap-3 rounded-2xl border bg-surface px-4 py-3 transition-colors duration-150',
                          isDeletePending(t.id) ? 'border-danger/40 opacity-60' : dragId === t.id ? 'border-accent bg-accent-2/40 opacity-60' : 'border-border hover:bg-hover'
                        )}
                      >
                        <button
                          onClick={() => handleToggle(t)}
                          disabled={isDeletePending(t.id)}
                          aria-label="切换完成"
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150',
                            'border-ink-3 text-transparent hover:border-accent'
                          )}
                        >
                          <Check size={14} strokeWidth={3} className="check-pop" />
                        </button>
                        <span className="flex-1 text-sm text-ink">{t.text}</span>
                        {isDeletePending(t.id) && <Badge variant="danger">待删除 {remainingSeconds(t.id)}s</Badge>}
                        {due.label && (
                          due.danger ? (
                            <Badge variant="danger">{due.label}</Badge>
                          ) : due.label === '今天' ? (
                            <Badge variant="accent">今天</Badge>
                          ) : (
                            <Badge variant="neutral">{due.label}</Badge>
                          )
                        )}
                        <Badge variant={LEVEL_META[t.level].variant}>{LEVEL_META[t.level].label}</Badge>
                        <div className="flex items-center gap-0.5">
                          {touch && !searching && (
                            <>
                              <IconButton size="sm" aria-label="上移" onClick={() => move(t.id, -1)}>
                                <ChevronUp size={15} />
                              </IconButton>
                              <IconButton size="sm" aria-label="下移" onClick={() => move(t.id, 1)}>
                                <ChevronDown size={15} />
                              </IconButton>
                            </>
                          )}
                          <IconButton
                            size="sm"
                            onClick={() => startEdit(t)}
                            disabled={isDeletePending(t.id)}
                            aria-label="编辑"
                            className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
                          >
                            <Pencil size={15} />
                          </IconButton>
                          <IconButton
                            size="sm"
                            onClick={() => void handlePin(t)}
                            disabled={togglePin.isPending || isDeletePending(t.id)}
                            aria-label={t.pinned ? '取消置顶' : '置顶'}
                            className={cn(
                              touch || t.pinned ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
                              t.pinned && 'text-m3'
                            )}
                          >
                            {t.pinned ? <Pin size={15} /> : <PinOff size={15} />}
                          </IconButton>
                          <IconButton
                            size="sm"
                            onClick={() => requestDelete(t)}
                            disabled={isDeletePending(t.id)}
                            aria-label="删除"
                            className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              {/* 已完成（可折叠） */}
              {doneList.length > 0 && (
                <div className="rounded-2xl border border-border bg-surface">
                  <button
                    onClick={() => setShowDone((s) => !s)}
                    className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
                  >
                    <span>
                      已完成 <span className="tabular-nums">{doneList.length}</span>
                    </span>
                    <ChevronDown
                      size={16}
                      className={cn('transition-transform duration-150', showDone && 'rotate-180')}
                    />
                  </button>
                  {showDone && (
                    <ul className="space-y-1 px-2 pb-2">
                      {doneList.map((t) => (
                        <li
                          key={t.id}
                          className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-hover"
                        >
                          <button
                            onClick={() => handleToggle(t)}
                            disabled={isDeletePending(t.id)}
                            aria-label="恢复未完成"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-m1 bg-m1 text-white"
                          >
                            <Check size={14} strokeWidth={3} />
                          </button>
                          <span className="flex-1 text-sm text-ink-3 line-through">{t.text}</span>
                          {isDeletePending(t.id) && <Badge variant="danger">待删除 {remainingSeconds(t.id)}s</Badge>}
                          <Badge variant={LEVEL_META[t.level].variant}>{LEVEL_META[t.level].label}</Badge>
                          <IconButton size="sm" onClick={() => startEdit(t)} disabled={isDeletePending(t.id)} aria-label="编辑"><Pencil size={15} /></IconButton>
                          <IconButton
                            size="sm"
                            onClick={() => requestDelete(t)}
                            disabled={isDeletePending(t.id)}
                            aria-label="删除"
                            className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
          {(todosQuery.data?.total ?? 0) > TODOS_PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3">
              <IconButton onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || todosQuery.isFetching} aria-label="上一页"><ChevronLeft size={17} /></IconButton>
              <span className="text-xs text-ink-3 tabular-nums">第 {page + 1} / {Math.ceil((todosQuery.data?.total ?? 0) / TODOS_PAGE_SIZE)} 页</span>
              <IconButton onClick={() => setPage((value) => value + 1)} disabled={(page + 1) * TODOS_PAGE_SIZE >= (todosQuery.data?.total ?? 0) || todosQuery.isFetching} aria-label="下一页"><ChevronRight size={17} /></IconButton>
            </div>
          )}
        </div>

        {/* 右栏统计 */}
        <aside className="h-fit space-y-3 lg:sticky lg:top-4">
          <SideCard title="完成情况" icon={<ClipboardList size={14} />}>
            <div className="flex items-center gap-4">
              <Ring value={pct} size={88} color="var(--m1)">
                <span className="text-lg font-bold tabular-nums text-ink">{Math.round(pct)}%</span>
              </Ring>
              <div className="text-xs text-ink-2">
                <div>
                  已完成 <span className="font-bold text-ink tabular-nums">{doneCount}</span> / {totalCount}
                </div>
                <div className="mt-1 text-ink-3">剩余 {totalCount - doneCount} 项</div>
              </div>
            </div>
          </SideCard>
          <SideCard title="优先级分布" icon={<ClipboardList size={14} />}>
            <ul className="space-y-2">
              {LEVEL_ROW.map((r) => (
                <li key={r.key} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                  <span className="text-ink-2">{r.label}</span>
                  <span className="ml-auto font-bold text-ink tabular-nums">{byLevel[r.key]} 项</span>
                </li>
              ))}
            </ul>
          </SideCard>
        </aside>
      </div>
    </div>
  )
}
