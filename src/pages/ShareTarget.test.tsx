import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShareTarget from './ShareTarget'

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ userId: 'user-1', loading: false }) }))
vi.mock('../hooks/useTodayWorkspace', () => ({ useAddInboxItem: () => ({ mutateAsync: mocks.mutate, isPending: false }) }))

describe('ShareTarget', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear() })

  it('reuses command and entity ids after a failed retry', async () => {
    mocks.mutate.mockRejectedValueOnce(new Error('网络暂时不可用')).mockResolvedValueOnce({})
    render(<MemoryRouter initialEntries={['/share-target?title=文章&url=https%3A%2F%2Fexample.com']}><ShareTarget /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: '确认保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('网络暂时不可用')
    fireEvent.click(screen.getByRole('button', { name: '确认保存' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2))
    expect(mocks.mutate.mock.calls[0][0].commandId).toBe(mocks.mutate.mock.calls[1][0].commandId)
    expect(mocks.mutate.mock.calls[0][0].entityId).toBe(mocks.mutate.mock.calls[1][0].entityId)
    expect(await screen.findByRole('button', { name: '已保存到 Inbox' })).toBeDisabled()
  })
})
