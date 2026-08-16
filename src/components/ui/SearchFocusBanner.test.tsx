import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import SearchFocusBanner from './SearchFocusBanner'

const focusId = '11111111-1111-4111-8111-111111111111'

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ userId: 'user-1' }) }))
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: focusId, name: '季度目标', note: '聚焦增长' }, error: null }) }) }) })
  }
}))
vi.mock('./EntityLinksPanel', () => ({ default: ({ sourceKind, sourceId }: { sourceKind: string; sourceId: string }) => <div>links:{sourceKind}:{sourceId}</div> }))

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="location">{location.pathname}{location.search}</output>
}

describe('SearchFocusBanner', () => {
  it('loads an exact focused record, exposes links, and clears focus', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/goals?focus=${focusId}`]}><SearchFocusBanner /><LocationProbe /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('季度目标')).toBeInTheDocument()
    expect(screen.getByText(`links:goal:${focusId}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭搜索定位' }))
    await waitFor(() => expect(screen.getByLabelText('location')).toHaveTextContent('/goals'))
    expect(screen.getByLabelText('location')).not.toHaveTextContent('focus=')
  })
})
