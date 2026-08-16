import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProblems } from './useProblems'
import { useTodos } from './useTodos'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  rowsLimit: vi.fn()
}))

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from }
}))

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    session: null,
    userId: '10000000-0000-0000-0000-000000000001',
    loading: false,
    mode: 'online',
    canWrite: true
  })
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('cursor transport routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rowsLimit.mockResolvedValue({ data: [], error: null })
    mocks.rpc.mockResolvedValue({ data: { items: [], total: 0 }, error: null })
    mocks.from.mockImplementation(() => ({
      select: (_columns: string, options?: { head?: boolean }) => {
        if (options?.head) return Promise.resolve({ count: 0, error: null })
        const rows = {
          order: vi.fn(() => rows),
          limit: mocks.rowsLimit
        }
        return rows
      }
    }))
  })

  it('uses the cursor RPC only for practice problems', async () => {
    const { result } = renderHook(() => useProblems(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocks.rpc).toHaveBeenCalledWith('get_practice_page_cursor', expect.any(Object))
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('uses PostgREST cursor queries for ordinary tables', async () => {
    const { result } = renderHook(() => useTodos({ filters: { showDone: true } }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocks.from).toHaveBeenCalledWith('todos')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
