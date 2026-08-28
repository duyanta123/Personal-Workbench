import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  History,
  Pin,
  PinOff,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react'
import {
  useAddTodo,
  useDeleteTodo,
  useMoveTodo,
  usePostponeTodo,
  useTodoById,
  useTodoStats,
  useTodos,
  useToggleTodo,
  useToggleTodoPin,
  useUpdateTodo,
  TODOS_PAGE_SIZE,
  todosListKey
} from '../hooks/useTodos'
import type { TodoListFilters, TodoPage } from '../hooks/useTodos'
import { useDeferredDelete } from '../hooks/useDeferredDelete'
import { useTouch } from '../hooks/useTouch'
import { useToastStore } from '../stores/toast'
import type { Priority, Todo } from '../types'
import { useAuth } from '../hooks/useAuth'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Progress from '../components/ui/Progress'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import { cn } from '../lib/cn'
import QueryError from '../components/ui/QueryError'
import { useSearchParams } from 'react-router-dom'
import { useCurrentDate } from '../hooks/useCurrentDate'
import { useClampPage } from '../hooks/useClampPage'
import RecurrencePanel from '../components/ui/RecurrencePanel'
import TodoArtifactsPanel, { type TodoViewState } from '../components/ui/TodoArtifactsPanel'
import TodoEditor from '../features/todos/TodoEditor'
import TodoSummary from '../features/todos/TodoSummary'
import TodoHistoryInline from '../features/todos/TodoHistoryInline'
import TodoPostponePanel from '../features/todos/TodoPostponePanel'
import TodoDoneSection from '../features/todos/TodoDoneSection'
import TodoFocusPanel from '../features/todos/TodoFocusPanel'
import { LEVEL_META } from '../features/todos/levelMeta'

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
  const today = useCurrentDate()
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [viewState, setViewState] = useState<TodoViewState>({ showDone: false, sort: { column: 'sort_order', direction: 'asc' } })
  const deferredQuery = useDeferredValue(query.trim())
  const listFilters: TodoListFilters = { showDone: viewState.showDone, level: viewState.level, due: viewState.due, currentDate: today }
  const todosQuery = useTodos({ page, query: deferredQuery, filters: listFilters, sort: viewState.sort })
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
  const postponeTodo = usePostponeTodo()
  const push = useToastStore((s) => s.push)
  const touch = useTouch()
  const { userId } = useAuth()

  const [text, setText] = useState('')
  const [level, setLevel] = useState<Priority>('mid')
  const [due, setDue] = useState<string>('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingOriginal, setEditingOriginal] = useState<Todo | null>(null)
  const [postponeId, setPostponeId] = useState<string | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  const focusQuery = useTodoById(focusId)

  const doneCount = statsQuery.data?.done ?? 0
  const totalCount = statsQuery.data?.total ?? 0
  const pct = totalCount ? (doneCount / totalCount) * 100 : 0
  const showDone = viewState.showDone
  const manualOrder = viewState.sort.column === 'sort_order' && viewState.sort.direction === 'asc'

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

  useEffect(() => setPage(0), [query, viewState.showDone, viewState.level, viewState.due, viewState.sort])
  useEffect(() => {
    if (!focusId || focusQuery.isLoading || focusQuery.data !== null) return
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
    push({ kind: 'info', message: '定位的待办不存在或已删除' })
  }, [focusId, focusQuery.isLoading, focusQuery.data, push, searchParams, setSearchParams])

  const { requestDelete, isPending: isDeletePending, remainingSeconds } = useDeferredDelete<Todo, TodoPage>({
    key: todosListKey(userId, page, deferredQuery, listFilters, viewState.sort),
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
        // 最小 diff patch：只提交实际变化的字段，避免把其他设备已变更的
        // 字段以过时的 expected 值重发，造成多设备"假冲突"。
        const patch: Partial<Pick<Todo, 'text' | 'level' | 'due_date'>> = {}
        if (t !== editingOriginal?.text) patch.text = t
        if (level !== editingOriginal?.level) patch.level = level
        if ((due || null) !== (editingOriginal?.due_date ?? null)) patch.due_date = due || null
        if (Object.keys(patch).length > 0) {
          await updateTodo.mutateAsync({ id: editingId, patch })
          push({ kind: 'success', message: '待办已更新' })
        }
      } else {
        await addTodo.mutateAsync({ text: t, level, due_date: due || null })
        push({ kind: 'success', message: '待办已添加' })
      }
      setText('')
      setDue('')
      setEditingId(null)
      setEditingOriginal(null)
    } catch {
      push({ kind: 'error', message: editingId ? '待办更新失败，请重试' : '待办添加失败，请重试' })
    }
  }

  function startEdit(todo: Todo) {
    setEditingId(todo.id)
    setEditingOriginal(todo)
    setText(todo.text)
    setLevel(todo.level)
    setDue(todo.due_date ?? '')
  }

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
      <RecurrencePanel entityType="todo" />
      <TodoArtifactsPanel
        draft={{ text, level, due }} query={query} state={viewState} onChange={setViewState}
        onApplyView={(view) => { setQuery(view.query); setViewState(view.state) }}
      />

      {focusQuery.data && (
        <TodoFocusPanel
          todo={focusQuery.data}
          onClose={() => { const next = new URLSearchParams(searchParams); next.delete('focus'); setSearchParams(next, { replace: true }) }}
        />
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
          <TodoEditor
            text={text} level={level} due={due} editing={Boolean(editingId)}
            busy={addTodo.isPending || updateTodo.isPending}
            onTextChange={setText} onLevelChange={setLevel} onDueChange={setDue}
            onSubmit={handleAdd}
            onCancel={() => { setEditingId(null); setEditingOriginal(null); setText(''); setDue('') }}
          />

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
                    const isRecurrence = Boolean(t.recurrence_rule_id && t.occurrence_date)
                    return (
                      <Fragment key={t.id}>
                      <li
                        draggable={manualOrder && !searching && !isDeletePending(t.id)}
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
                          {touch && manualOrder && !searching && (
                            <>
                              <IconButton size="sm" aria-label="上移" onClick={() => move(t.id, -1)}>
                                <ChevronUp size={15} />
                              </IconButton>
                              <IconButton size="sm" aria-label="下移" onClick={() => move(t.id, 1)}>
                                <ChevronDown size={15} />
                              </IconButton>
                            </>
                          )}
                          {isRecurrence && (
                            <IconButton
                              size="sm"
                              onClick={() => { setPostponeId(postponeId === t.id ? null : t.id); setHistoryId(null) }}
                              disabled={postponeTodo.isPending || isDeletePending(t.id)}
                              aria-label="延期"
                              className={cn('text-ink-3', !touch && 'opacity-0 transition-opacity duration-150 group-hover:opacity-100', postponeId === t.id && 'text-accent opacity-100')}
                            >
                              <CalendarClock size={15} />
                            </IconButton>
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
                          {isRecurrence && (
                            <IconButton
                              size="sm"
                              onClick={() => { setHistoryId(historyId === t.id ? null : t.id); setPostponeId(null) }}
                              disabled={isDeletePending(t.id)}
                              aria-label="状态历史"
                              className={cn('text-ink-3', !touch && 'opacity-0 transition-opacity duration-150 group-hover:opacity-100', historyId === t.id && 'text-accent opacity-100')}
                            >
                              <History size={15} />
                            </IconButton>
                          )}
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
                      {postponeId === t.id && (
                        <TodoPostponePanel
                          pending={postponeTodo.isPending}
                          onPostpone={(days, label) => {
                            void postponeTodo.mutateAsync({ id: t.id, days })
                              .then(() => {
                                setPostponeId(null)
                                push({ kind: 'success', message: `已顺延 ${label}，可在状态历史中查看` })
                              })
                              .catch(() => push({ kind: 'error', message: '延期保存失败，请重试' }))
                          }}
                        />
                      )}
                      {historyId === t.id && <TodoHistoryInline todoId={t.id} onClose={() => setHistoryId(null)} />}
                      </Fragment>
                    )
                  })}
                </ul>
              )}

              {/* 已完成（可折叠） */}
              {doneCount > 0 && (
                <TodoDoneSection
                  doneCount={doneCount}
                  showDone={showDone}
                  doneList={doneList}
                  touch={touch}
                  isDeletePending={isDeletePending}
                  remainingSeconds={remainingSeconds}
                  onToggleShowDone={() => setViewState((current) => ({ ...current, showDone: !current.showDone }))}
                  onToggle={handleToggle}
                  onEdit={startEdit}
                  onDelete={requestDelete}
                />
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
        <TodoSummary percent={pct} done={doneCount} total={totalCount} byLevel={byLevel} />
      </div>
    </div>
  )
}
