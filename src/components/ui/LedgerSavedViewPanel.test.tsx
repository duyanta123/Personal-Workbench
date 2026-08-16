import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LedgerSavedViewPanel, { type LedgerViewState } from './LedgerSavedViewPanel'

const mocks = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), push: vi.fn() }))
const accountId = '11111111-1111-4111-8111-111111111111'

vi.mock('../../hooks/useWorkbenchArtifacts', () => ({
  useSavedViews: () => ({
    isSuccess: true,
    data: [{
      id: 'view-1', name: '大额支出', is_default: false,
      filters: { query: '午饭', kind: 'expense', status: 'posted', account_id: accountId },
      sort: [{ column: 'amount_minor', direction: 'desc' }]
    }]
  }),
  useAddSavedView: () => ({ mutateAsync: mocks.add, isPending: false }),
  useDeleteSavedView: () => ({ mutateAsync: mocks.remove, isPending: false })
}))
vi.mock('../../stores/toast', () => ({ useToastStore: (selector: (state: { push: typeof mocks.push }) => unknown) => selector({ push: mocks.push }) }))

describe('LedgerSavedViewPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.add.mockResolvedValue({}) })

  it('restores validated filters and sort from a saved view', () => {
    const onApplyView = vi.fn()
    render(<LedgerSavedViewPanel
      query=""
      state={{ sort: { column: 'entry_date', direction: 'desc' } }}
      categories={['餐饮']}
      accounts={[]}
      onChange={vi.fn()}
      onApplyView={onApplyView}
    />)
    fireEvent.click(screen.getByRole('button', { name: '大额支出' }))
    expect(onApplyView).toHaveBeenCalledWith({
      query: '午饭',
      state: expect.objectContaining({ kind: 'expense', status: 'posted', accountId, sort: { column: 'amount_minor', direction: 'desc' } })
    })
  })

  it('maps current camelCase state to the saved JSON contract', async () => {
    const state: LedgerViewState = { accountId, dateFrom: '2026-08-01', status: 'planned', sort: { column: 'entry_date', direction: 'asc' } }
    render(<LedgerSavedViewPanel query=" 周期 " state={state} categories={[]} accounts={[]} onChange={vi.fn()} onApplyView={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('视图名称'), { target: { value: '待确认' } })
    fireEvent.click(screen.getByRole('button', { name: '保存当前筛选' }))
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith({
      entity_kind: 'ledger', name: '待确认',
      filters: { query: '周期', account_id: accountId, status: 'planned', date_from: '2026-08-01' },
      sort: [{ column: 'entry_date', direction: 'asc' }], is_default: false
    }))
  })
})
