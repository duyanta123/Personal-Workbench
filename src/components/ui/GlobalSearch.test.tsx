import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GlobalSearch from './GlobalSearch'

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), search: vi.fn() }))

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('../../hooks/useGlobalSearch', () => ({
  useGlobalSearch: (query: string, enabled: boolean) => {
    mocks.search(query, enabled)
    return {
      data: {
        todos: [{ id: 'todo-1', text: 'Target todo', done: false }],
        notes: [],
        ledger: []
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn()
    }
  }
}))

describe('GlobalSearch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('navigates to an exact focus card instead of guessing a page', () => {
    const onClose = vi.fn()
    render(<GlobalSearch open onClose={onClose} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Target' } })
    fireEvent.click(screen.getByText('Target todo').closest('button')!)

    expect(onClose).toHaveBeenCalled()
    expect(mocks.navigate).toHaveBeenCalledWith('/todos?focus=todo-1')
  })
})
