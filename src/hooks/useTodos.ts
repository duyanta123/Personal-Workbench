import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { enqueueOperation } from '../lib/outbox'
import type { Priority, Todo } from '../types'
import { useAuth } from './useAuth'
import { rpcArray, rpcRecord } from '../lib/rpcSchemas'
import { afterCursor, cursorScope, cursorToken, getPageCursor, rememberPageCursor } from '../lib/cursorPagination'

export const TODOS_PAGE_SIZE = 50
export const todosKey = (userId: string | null) => ['todos', userId] as const
const todosCursorScope = (userId: string | null, query: string) => cursorScope(['todos', userId, query.trim().toLowerCase()])
const todosOrder = [
  { column: 'pinned', direction: 'desc' as const },
  { column: 'sort_order', direction: 'asc' as const },
  { column: 'id', direction: 'asc' as const }
] as const
export const todosListKey = (userId: string | null, page: number, query = '') => [
  ...todosKey(userId), 'page', page, query.trim().toLowerCase(),
  cursorToken(getPageCursor(todosCursorScope(userId, query), page))
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
    ['workbench_insights', userId] as const
  ]
}

function literalPattern(value: string) {
  return `%${value.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/\*/g, '\\*')}%`
}

export function useTodos(options: { page?: number; query?: string } = {}) {
  const { userId } = useAuth()
  const page = Math.max(0, options.page ?? 0)
  const query = options.query?.trim() ?? ''
  const scope = todosCursorScope(userId, query)
  const cursor = getPageCursor(scope, page)
  return useQuery({
    queryKey: todosListKey(userId, page, query),
    queryFn: async (): Promise<TodoPage> => {
      let request = supabase!
        .from('todos')
        .select('*')
        .order('pinned', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
      const pattern = query ? literalPattern(query) : null
      if (pattern) request = request.ilike('text', pattern)
      if (cursor) request = request.or(afterCursor(cursor, todosOrder))
      let countRequest = supabase!.from('todos').select('id', { count: 'exact', head: true })
      if (pattern) countRequest = countRequest.ilike('text', pattern)
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
        sort_order: last.sort_order,
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
      return enqueueOperation<Todo>(userId, 'todo.create', {
        text: input.text,
        level: input.level,
        due_date: input.due_date ?? null,
        done: input.done ?? false,
        pinned: input.pinned ?? false
      })
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useToggleTodo() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase!.from('todos').update({ done }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useUpdateTodo() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Todo, 'text' | 'level' | 'done' | 'due_date'>> }) => {
      const { error } = await supabase!.from('todos').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useMoveTodo() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, anchorId, position }: { id: string; anchorId: string; position: 'before' | 'after' }) => {
      const { data, error } = await supabase!.rpc('move_todo', {
        p_todo_id: id,
        p_anchor_id: anchorId,
        p_position: position
      })
      if (error) throw error
      return rpcRecord(data, 'move todo') as unknown as Todo
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useDeleteTodo() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('todos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useToggleTodoPin() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase!.from('todos').update({ pinned }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => linkedTodoKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}
