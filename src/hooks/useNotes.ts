import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createEntity, deleteEntity, updateEntity } from '../lib/domainCommands'
import type { Note, NoteLayout } from '../types'
import { useAuth } from './useAuth'
import { localDayRange } from '../utils/localDayRange'
import { LIMITS, requireLength, safeExternalUrl, validateTags } from '../utils/validation'
import { afterCursor, cursorScope, cursorToken, getPageCursor, rememberPageCursor } from '../lib/cursorPagination'
import { validateNoteCreate } from '../utils/createValidation'

export const NOTES_PAGE_SIZE = 50
export const notesKey = (userId: string | null) => ['notes', userId] as const
const linkedNoteKeys = (userId: string | null) => [notesKey(userId), ['dashboard_summary', userId] as const, ['workbench_insights', userId] as const]
const notesCursorScope = (userId: string | null, query: string, tag: string | null) => cursorScope([
  'notes', userId, query.trim().toLowerCase(), tag
])
const notesOrder = [
  { column: 'pinned', direction: 'desc' as const },
  { column: 'updated_at', direction: 'desc' as const },
  { column: 'id', direction: 'desc' as const }
] as const
export const notesListKey = (userId: string | null, page: number, query = '', tag: string | null = null) => [
  ...notesKey(userId),
  'page',
  page,
  query.trim().toLowerCase(),
  tag,
  cursorToken(getPageCursor(notesCursorScope(userId, query, tag), page))
] as const

export interface NotesPage {
  items: Note[]
  total: number
}

function ilikePattern(query: string) {
  const escaped = query.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/\*/g, '\\*')
  return `"%${escaped}%"`
}

export function useNotes(options: { page?: number; query?: string; tag?: string | null } = {}) {
  const { userId } = useAuth()
  const page = options.page ?? 0
  const query = options.query?.trim() ?? ''
  const tag = options.tag ?? null
  const scope = notesCursorScope(userId, query, tag)
  const cursor = getPageCursor(scope, page)
  return useQuery({
    queryKey: notesListKey(userId, page, query, tag),
    queryFn: async (): Promise<NotesPage> => {
      let request = supabase!
        .from('notes')
        .select('*')
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
      const search = query ? `title.ilike.${ilikePattern(query)},body.ilike.${ilikePattern(query)}` : null
      if (search && cursor) request = request.or(afterCursor(cursor, notesOrder, search))
      else if (search) request = request.or(search)
      else if (cursor) request = request.or(afterCursor(cursor, notesOrder))
      if (tag) request = request.contains('tags', [tag])
      let countRequest = supabase!.from('notes').select('id', { count: 'exact', head: true })
      if (search) countRequest = countRequest.or(search)
      if (tag) countRequest = countRequest.contains('tags', [tag])
      const [rowsResult, countResult] = await Promise.all([
        request.limit(NOTES_PAGE_SIZE),
        countRequest
      ])
      const { data, error } = rowsResult
      const { count, error: countError } = countResult
      if (error) throw error
      if (countError) throw countError
      const items = (data ?? []) as Note[]
      const last = items.at(-1)
      rememberPageCursor(scope, page + 1, last ? {
        pinned: last.pinned,
        updated_at: last.updated_at,
        id: last.id
      } : null)
      return { items, total: count ?? 0 }
    },
    enabled: !!supabase && !!userId
  })
}

export interface NoteStats {
  total: number
  pinned: number
  today: number
  tagCounts: [string, number][]
}

export function useNoteStats(today: string) {
  const { userId } = useAuth()
  const range = localDayRange(today)
  return useQuery({
    queryKey: [...notesKey(userId), 'stats', today] as const,
    queryFn: async (): Promise<NoteStats> => {
      const { data, error } = await supabase!.rpc('get_note_stats_range', {
        p_start: range.start,
        p_end: range.end
      })
      if (error) throw error
      const value = data as { total?: number; pinned?: number; today?: number; tag_counts?: [string, number][] }
      return {
        total: Number(value.total ?? 0),
        pinned: Number(value.pinned ?? 0),
        today: Number(value.today ?? 0),
        tagCounts: value.tag_counts ?? []
      }
    },
    enabled: !!supabase && !!userId
  })
}

export function useNoteById(id: string | null) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: [...notesKey(userId), 'focus', id],
    queryFn: async () => {
      const { data, error } = await supabase!.from('notes').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Note | null
    },
    enabled: !!supabase && !!userId && !!id
  })
}

export function useAddNote() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      title: string | null
      body: string
      tags: string[]
      pinned?: boolean
      layout?: NoteLayout
      image_url?: string | null
    }) => {
      if (!userId) throw new Error('未登录')
      return createEntity(qc, userId, 'note', validateNoteCreate(input))
    },
    onSuccess: () => linkedNoteKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({
      id,
      patch
    }: {
      id: string
      patch: {
        title: string | null
        body: string
        tags: string[]
        layout?: NoteLayout
        image_url?: string | null
      }
    }) => {
      requireLength(patch.body, LIMITS.body, '正文', 1)
      if (patch.title) requireLength(patch.title, LIMITS.title, '标题')
      validateTags(patch.tags)
      safeExternalUrl(patch.image_url)
      if (!userId) throw new Error('未登录')
      return updateEntity(qc, userId, 'note', id, patch)
    },
    onSuccess: () => linkedNoteKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

/** 切换置顶 */
export function useTogglePin() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      if (!userId) throw new Error('未登录')
      return updateEntity(qc, userId, 'note', id, { pinned })
    },
    onSuccess: () => linkedNoteKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('未登录')
      return deleteEntity(qc, userId, 'note', id)
    },
    onSuccess: () => linkedNoteKeys(userId).forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  })
}
