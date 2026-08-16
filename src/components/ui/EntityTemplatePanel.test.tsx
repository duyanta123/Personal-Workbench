import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EntityTemplatePanel from './EntityTemplatePanel'

const mocks = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), push: vi.fn() }))

vi.mock('../../hooks/useWorkbenchArtifacts', () => ({
  useWorkbenchTemplates: () => ({ data: [{ id: 'template-1', name: '阅读', payload: { name: '  阅读  ', emoji: 'book', tracking_type: 'boolean', period_days: 1, target_count: 1, target_value: null, target_mode: 'at_least', reminder_time: '08:30' } }] }),
  useAddWorkbenchTemplate: () => ({ mutateAsync: mocks.add, isPending: false }),
  useDeleteWorkbenchTemplate: () => ({ mutateAsync: mocks.remove, isPending: false })
}))
vi.mock('../../stores/toast', () => ({ useToastStore: (selector: (state: { push: typeof mocks.push }) => unknown) => selector({ push: mocks.push }) }))

describe('EntityTemplatePanel', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.add.mockResolvedValue({}) })

  it('normalizes stored payload before instantiation', async () => {
    const instantiate = vi.fn().mockResolvedValue({})
    render(<EntityTemplatePanel kind="habit" draft={{}} canSave={false} instantiate={instantiate} />)
    fireEvent.click(screen.getByRole('button', { name: '阅读' }))
    await waitFor(() => expect(instantiate).toHaveBeenCalledWith(expect.objectContaining({ name: '阅读', tracking_type: 'boolean', reminder_time: '08:30' })))
  })

  it('surfaces malformed legacy templates without instantiating them', async () => {
    const instantiate = vi.fn()
    vi.mocked(mocks.push).mockClear()
    render(<EntityTemplatePanel kind="goal" draft={{}} canSave={false} instantiate={instantiate} />)
    fireEvent.click(screen.getByRole('button', { name: '阅读' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' })))
    expect(instantiate).not.toHaveBeenCalled()
  })
})
