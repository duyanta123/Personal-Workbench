import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PomodoroCard from './PomodoroCard'

const mocks = vi.hoisted(() => ({
  todayTodos: vi.fn(),
  push: vi.fn()
}))

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ userId: 'user-1' }) }))
vi.mock('../../hooks/useCurrentDate', () => ({ useCurrentDate: () => '2026-08-08' }))
vi.mock('../../hooks/usePomodoro', () => ({
  usePomodoroStats: () => ({ data: { count: 0, minutes: 0 } }),
  useCompletePomodoro: () => ({ mutateAsync: vi.fn() })
}))
vi.mock('../../hooks/usePreferences', () => ({
  DEFAULT_POMODORO: { focus: 25, break: 5, long_break: 15, rounds_per_cycle: 4 },
  usePreferences: () => ({ data: { pomodoro: { focus: 25, break: 5, long_break: 15, rounds_per_cycle: 4 } } }),
  useUpdatePreferences: () => ({ mutateAsync: vi.fn(), isPending: false })
}))
vi.mock('../../hooks/useTodos', () => ({
  useTodayTodos: (date: string) => {
    mocks.todayTodos(date)
    return { data: [], isSuccess: true }
  },
  useToggleTodo: () => ({ mutateAsync: vi.fn(), isPending: false })
}))
vi.mock('../../stores/toast', () => ({
  useToastStore: (selector: (state: { push: typeof mocks.push }) => unknown) => selector({ push: mocks.push })
}))

describe('PomodoroCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('loads the lightweight today-todos source for the current local date', () => {
    render(<PomodoroCard />)
    expect(mocks.todayTodos).toHaveBeenCalledWith('2026-08-08')
  })
})
