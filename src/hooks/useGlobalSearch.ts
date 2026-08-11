import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { LedgerEntry, Note, Todo } from '../types'
import { useAuth } from './useAuth'

export interface GlobalSearchResult {
  todos: Todo[]
  notes: Note[]
  ledger: LedgerEntry[]
}

const EMPTY_RESULT: GlobalSearchResult = { todos: [], notes: [], ledger: [] }

function isSearchResult(value: unknown): value is GlobalSearchResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return Array.isArray(result.todos) && Array.isArray(result.notes) && Array.isArray(result.ledger)
}

export function useGlobalSearch(query: string, enabled: boolean) {
  const { userId } = useAuth()
  const normalized = query.trim()
  return useQuery({
    queryKey: ['global_search', userId, normalized.toLowerCase()] as const,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('search_workbench', {
        p_query: normalized,
        p_limit: 6
      })
      if (error) throw error
      return isSearchResult(data) ? data : EMPTY_RESULT
    },
    enabled: !!supabase && !!userId && enabled && normalized.length > 0,
    staleTime: 15_000
  })
}
