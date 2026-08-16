import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TodoArtifactsPanel, { type TodoViewState } from './TodoArtifactsPanel'

const mocks = vi.hoisted(() => ({ addView: vi.fn(), removeView: vi.fn(), addTodo: vi.fn(), push: vi.fn() }))

vi.mock('../../hooks/useWorkbenchArtifacts', () => ({
  useWorkbenchTemplates: () => ({ data: [] }),
  useAddWorkbenchTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWorkbenchTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSavedViews: () => ({ isSuccess: true, data: [{ id: 'view-1', name: '今日高优先', is_default: false, filters: { query: '报告', show_done: true, level: 'high', due: 'today' }, sort: [{ column: 'created_at', direction: 'desc' }] }] }),
  useAddSavedView: () => ({ mutateAsync: mocks.addView, isPending: false }),
  useDeleteSavedView: () => ({ mutateAsync: mocks.removeView, isPending: false })
}))
vi.mock('../../hooks/useTodos', () => ({ useAddTodo: () => ({ mutateAsync: mocks.addTodo }) }))
vi.mock('../../stores/toast', () => ({ useToastStore: (selector: (state: { push: typeof mocks.push }) => unknown) => selector({ push: mocks.push }) }))

describe('TodoArtifactsPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.addView.mockResolvedValue({}) })

  it('restores todo filters and sort from a saved view', () => {
    const onApplyView = vi.fn()
    render(<TodoArtifactsPanel draft={{ text: '', level: 'mid', due: '' }} query="" state={{ showDone: false, sort: { column: 'sort_order', direction: 'asc' } }} onChange={vi.fn()} onApplyView={onApplyView} />)
    fireEvent.click(screen.getByRole('button', { name: '今日高优先' }))
    expect(onApplyView).toHaveBeenCalledWith({ query: '报告', state: { showDone: true, level: 'high', due: 'today', sort: { column: 'created_at', direction: 'desc' } } })
  })

  it('persists the complete allowed task view contract', async () => {
    const state: TodoViewState = { showDone: true, level: 'high', due: 'today', sort: { column: 'created_at', direction: 'desc' } }
    render(<TodoArtifactsPanel draft={{ text: '', level: 'mid', due: '' }} query=" 报告 " state={state} onChange={vi.fn()} onApplyView={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('视图名称'), { target: { value: '工作日' } })
    fireEvent.click(screen.getByRole('button', { name: '保存筛选' }))
    await waitFor(() => expect(mocks.addView).toHaveBeenCalledWith({
      entity_kind: 'todo', name: '工作日',
      filters: { query: '报告', show_done: true, level: 'high', due: 'today' },
      sort: [{ column: 'created_at', direction: 'desc' }], is_default: false
    }))
  })
})
