import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { SearchResultItem } from '../types'
import { useAuth } from './useAuth'

const EMPTY_RESULT: SearchResultItem[] = []

function isSearchResult(value: unknown): value is SearchResultItem[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== 'object') return false
    const result = item as Record<string, unknown>
    return typeof result.kind === 'string' && typeof result.id === 'string' && typeof result.title === 'string'
  })
}

export function useGlobalSearch(query: string, enabled: boolean) {
  const { userId } = useAuth()
  const normalized = query.trim()
  return useQuery({
    queryKey: ['global_search', userId, normalized.toLowerCase()] as const,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('search_workbench_v2', {
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
