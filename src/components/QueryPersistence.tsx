import { useEffect } from 'react'
import { dehydrate, hydrate, useQueryClient } from '@tanstack/react-query'
import { getLocalValue, localKeys, setLocalValue } from '../lib/localData'
import { useAuth } from '../hooks/useAuth'

const MAX_AGE = 7 * 24 * 60 * 60 * 1000
const CACHE_SCHEMA = 1

interface PersistedQueryCache {
  schema: number
  savedAt: number
  state: ReturnType<typeof dehydrate>
}

function containsUserId(value: unknown, userId: string): boolean {
  if (value === userId) return true
  if (Array.isArray(value)) return value.some((item) => containsUserId(item, userId))
  return false
}

export default function QueryPersistence() {
  const queryClient = useQueryClient()
  const { userId } = useAuth()

  useEffect(() => {
    if (!userId) return
    let active = true
    let hydrated = false
    let timer: number | null = null

    const persist = () => {
      if (!hydrated || !active) return
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const state = dehydrate(queryClient, {
          shouldDehydrateQuery: (query) =>
            query.state.status === 'success'
            && query.queryKey[0] !== 'avatars'
            && containsUserId(query.queryKey, userId)
        })
        void setLocalValue<PersistedQueryCache>(userId, localKeys.queryCache, {
          schema: CACHE_SCHEMA,
          savedAt: Date.now(),
          state
        }).catch(() => undefined)
      }, 500)
    }

    void getLocalValue<PersistedQueryCache>(userId, localKeys.queryCache)
      .then((cached) => {
        if (!active || !cached || cached.schema !== CACHE_SCHEMA || Date.now() - cached.savedAt > MAX_AGE) return
        hydrate(queryClient, cached.state)
      })
      .catch(() => undefined)
      .finally(() => {
        hydrated = true
        persist()
      })

    const unsubscribe = queryClient.getQueryCache().subscribe(persist)
    return () => {
      active = false
      unsubscribe()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [queryClient, userId])

  return null
}
