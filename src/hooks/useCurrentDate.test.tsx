import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCurrentDate } from './useCurrentDate'

describe('useCurrentDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rolls over at the next local midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 8, 23, 59, 59, 500))
    const { result } = renderHook(() => useCurrentDate())
    expect(result.current).toBe('2026-08-08')

    act(() => vi.advanceTimersByTime(1100))
    expect(result.current).toBe('2026-08-09')
  })

  it('refreshes after the window regains focus', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 8, 12))
    const { result } = renderHook(() => useCurrentDate())
    vi.setSystemTime(new Date(2026, 7, 9, 12))

    act(() => window.dispatchEvent(new Event('focus')))
    expect(result.current).toBe('2026-08-09')
  })
})
