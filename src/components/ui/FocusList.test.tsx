import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FocusList from './FocusList'

const mocks = vi.hoisted(() => ({
  focusItems: vi.fn(),
  habitMutate: vi.fn(),
  navigate: vi.fn(),
  push: vi.fn()
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('../../hooks/useCurrentDate', () => ({ useCurrentDate: () => '2026-08-08' }))
vi.mock('../../hooks/useFocusItems', () => ({
  useFocusItems: (date: string) => {
    mocks.focusItems(date)
    return {
      data: {
        todos: [],
        habits: [{ id: 'habit-1', name: 'Read', emoji: 'book', pinned: true, done_today: true }],
        goals: []
      }
    }
  }
}))
vi.mock('../../hooks/useHabits', () => ({
  useToggleHabitLog: () => ({ mutateAsync: mocks.habitMutate, isPendingFor: () => false })
}))
vi.mock('../../hooks/useTodos', () => ({
  useToggleTodo: () => ({ mutateAsync: vi.fn(), isPending: false })
}))
vi.mock('../../hooks/useGoals', () => ({
  useIncrementGoal: () => ({ mutateAsync: vi.fn(), isPending: false })
}))
vi.mock('../../stores/toast', () => ({
  useToastStore: (selector: (state: { push: typeof mocks.push }) => unknown) => selector({ push: mocks.push })
}))

describe('FocusList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses focus-items and sends an explicit false state when unchecking a habit', async () => {
    mocks.habitMutate.mockResolvedValue(undefined)
    render(<FocusList />)

    expect(mocks.focusItems).toHaveBeenCalledWith('2026-08-08')
    fireEvent.click(screen.getAllByRole('button')[0])

    await waitFor(() => {
      expect(mocks.habitMutate).toHaveBeenCalledWith({
        habitId: 'habit-1',
        date: '2026-08-08',
        done: false
      })
    })
  })
})
