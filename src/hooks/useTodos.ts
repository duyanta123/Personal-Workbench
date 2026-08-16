import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createEntity, deleteEntity, moveTodoEntity, updateEntity } from '../lib/domainCommands'
import type { Priority, Todo, TodoStatusHistory } from '../types'
import { useAuth } from './useAuth'
import { rpcArray } from '../lib/rpcSchemas'
import { afterCursor, cursorScope, cursorToken, getPageCursor, rememberPageCursor } from '../lib/cursorPagination'
import { validateTodoCreate } from '../utils/createValidation'

export const TODOS_PAGE_SIZE = 50
export const todosKey = (userId: string | null) => ['todos', userId] as const
export type TodoDueFilter = 'overdue' | 'today' | 'future' | 'none'
export interface TodoListFilters {
  showDone?: boolean
  level?: Priority
  due?: TodoDueFilter
  currentDate?: string
}
export interface TodoSort {
  column: 'sort_order' | 'created_at'
  direction: 'asc' | 'desc'
}
const DEFAULT_TODO_SORT: TodoSort = { column: 'sort_order', direction: 'asc' }
const todosCursorScope = (userId: string | null, query: string, filters: TodoListFilters, sort: TodoSort) =>
  cursorScope(['todos', userId, query.trim().toLowerCase(), filters, sort])
function todosOrder(sort: TodoSort) {
  return [
    { column: 'pinned', direction: 'desc' as const },
    { column: sort.column, direction: sort.direction },
    { column: 'id', direction: sort.direction }
  ] as const
}
export const todosListKey = (userId: string | null, page: number, query = '', filters: TodoListFilters = {}, sort: TodoSort = DEFAULT_TODO_SORT) => [
  ...todosKey(userId), 'page', page, query.trim().toLowerCase(),
  filters, sort,
  cursorToken(getPageCursor(todosCursorScope(userId, query, filters, sort), page))
] as const
export const todayTodosKey = (userId: string | null, date: string) => ['today_todos', userId, date] as const

export interface TodoPage {
  items: Todo[]
  total: number
}

export interface TodoStats {
  total: number
  done: number
  byLevel: Record<Priority, number>
}

function linkedTodoKeys(userId: string | null) {
  return [
    todosKey(userId),
    ['today_todos', userId] as const,
    ['focus_items', userId] as const,
    ['dashboard_summary', userId] as const,
    ['today_workspace', userId] as const,
    ['workbench_insights', userId] as const
  ]
}

function literalPattern(value: string) {
  return `%${value.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/\*/g, '\\*')}%`
}

export function useTodos(options: { page?: number; query?: string; filters?: TodoListFilters; sort?: TodoSort } = {}) {
  const { userId } = useAuth()
  const page = Math.max(0, options.page ?? 0)
  const query = options.query?.trim() ?? ''
  const filters = options.filters ?? {}
  const sort = options.sort ?? DEFAULT_TODO_SORT
  const scope = todosCursorScope(userId, query, filters, sort)
  const cursor = getPageCursor(scope, page)
  return useQuery({
    queryKey: todosListKey(userId, page, query, filters, sort),
    queryFn: async (): Promise<TodoPage> => {
      const order = todosOrder(sort)
      let request = supabase!
        .from('todos')
        .select('*')
      for (const field of order) request = request.order(field.column, { ascending: field.direction === 'asc' })
      const pattern = query ? literalPattern(query) : null
      if (pattern) request = request.ilike('text', pattern)
      if (!filters.showDone) request = request.eq('done', false)
      if (filters.level) request = request.eq('level', filters.level)
      if (filters.due === 'none') request = request.is('due_date', null)
      else if (filters.due && filters.currentDate) request = filters.due === 'overdue'
        ? request.lt('due_date', filters.currentDate)
        : filters.due === 'today' ? request.eq('due_date', filters.currentDate) : request.gt('due_date', filters.currentDate)
      if (cursor) request = request.or(afterCursor(cursor, order))
      let countRequest = supabase!.from('todos').select('id', { count: 'exact', head: true })
      if (pattern) countRequest = countRequest.ilike('text', pattern)
      if (!filters.showDone) countRequest = countRequest.eq('done', false)
      if (filters.level) countRequest = countRequest.eq('level', filters.level)
      if (filters.due === 'none') countRequest = countRequest.is('due_date', null)
      else if (filters.due && filters.currentDate) countRequest = filters.due === 'overdue'
        ? countRequest.lt('due_date', filters.currentDate)
        : filters.due === 'today' ? countRequest.eq('due_date', filters.currentDate) : countRequest.gt('due_date', filters.currentDate)
      const [rowsResult, countResult] = await Promise.all([
        request.limit(TODOS_PAGE_SIZE),
        countRequest
      ])
      const { data, error } = rowsResult
      const { count, error: countError } = countResult
      if (error) throw error
      if (countError) throw countError
      const items = (data ?? []) as Todo[]
      const last = items.at(-1)
      rememberPageCursor(scope, page + 1, last ? {
        pinned: last.pinned,
        [order[1].column]: last[order[1].column],
        id: last.id
      } : null)
      return { items, total: count ?? 0 }
    },
    enabled: !!supabase && !!userId
  })
}

export function useTodayTodos(date: string) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: todayTodosKey(userId, date),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_today_todos', { p_date: date, p_limit: 50 })
      if (error) throw error
      return rpcArray(data ?? [], 'today todos') as unknown as Todo[]
    },
    enabled: !!supabase && !!userId
  })
}

export function useTodoStats() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: [...todosKey(userId), 'stats'],
    queryFn: async (): Promise<TodoStats> => {
      const [total, done, high, mid, low] = await Promise.all([
        supabase!.from('todos').select('id', { count: 'exact', head: true }),
        supabase!.from('todos').select('id', { count: 'exact', head: true }).eq('done', true),
        supabase!.from('todos').select('id', { count: 'exact', head: true }).eq('done', false).eq('level', 'high'),
        supabase!.from('todos').select('id', { count: 'exact', head: true }).eq('done', false).eq('level', 'mid'),
        supabase!.from('todos').select('id', { count: 'exact', head: true }).eq('done', false).eq('level', 'low')
      ])
      for (const result of [total, done, high, mid, low]) if (result.error) throw result.error
      return {
        total: total.count ?? 0,
        done: done.count ?? 0,
        byLevel: { high: high.count ?? 0, mid: mid.count ?? 0, low: low.count ?? 0 }
      }
    },
    enabled: !!supabase && !!userId
  })
}

export function useTodoById(id: string | null) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: [...todosKey(userId), 'focus', id],
    queryFn: async () => {
      const { data, error } = await supabase!.from('todos').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Todo | null
    },
    enabled: !!supabase && !!userId && !!id
  })
}

export interface NewTodo {
  text: string
  level: Priority
  due_date?: string | null
  done?: boolean
  pinned?: boolean
  sort_order?: number
}

export function useAddTodo() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: NewTodo) => {
      if (!userId) throw new Error('未登录')
      return createEntity(qc, userId, 'todo', validateTodoCreate(input))
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useToggleTodo() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      if (!userId) throw new Error('未登录')
      return updateEntity(qc, userId, 'todo', id, { done, status: done ? 'done' : 'open' })
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useUpdateTodo() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Todo, 'text' | 'level' | 'done' | 'due_date'>> }) => {
      if (!userId) throw new Error('未登录')
      const next = patch.done === undefined ? patch : { ...patch, status: patch.done ? 'done' : 'open' }
      return updateEntity(qc, userId, 'todo', id, next)
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useMoveTodo() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, anchorId, position }: { id: string; anchorId: string; position: 'before' | 'after' }) => {
      if (!userId) throw new Error('未登录')
      return moveTodoEntity(qc, userId, id, anchorId, position)
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useDeleteTodo() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('未登录')
      return deleteEntity(qc, userId, 'todo', id)
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useToggleTodoPin() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      if (!userId) throw new Error('未登录')
      return updateEntity(qc, userId, 'todo', id, { pinned })
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

function shiftDay(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

/** 周期实例延期：顺延 occurrence_date 与 due_date，触发器记录 postponed 历史并标记 detached。 */
export function usePostponeTodo() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      if (!userId) throw new Error('未登录')
      const pages = qc.getQueriesData<TodoPage>({ queryKey: todosKey(userId) })
      const todo = pages
        .flatMap(([, page]) => page?.items ?? [])
        .find((item) => item.id === id)
        ?? (qc.getQueryData([...todosKey(userId), 'focus', id]) as Todo | undefined)
      if (!todo?.occurrence_date) throw new Error('仅周期实例支持延期')
      const nextOccurrence = shiftDay(todo.occurrence_date, days)
      return updateEntity(qc, userId, 'todo', id, {
        occurrence_date: nextOccurrence,
        due_date: todo.due_date ? shiftDay(todo.due_date, days) : nextOccurrence
      })
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

/** 单条待办的状态流转历史（完成/跳过/恢复/延期）。 */
export function useTodoHistory(todoId: string | null) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: [...todosKey(userId), 'history', todoId],
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('todo_status_history')
        .select('*')
        .eq('todo_id', todoId!)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as TodoStatusHistory[]
    },
    enabled: !!supabase && !!userId && !!todoId
  })
}
