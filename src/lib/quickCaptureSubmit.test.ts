import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuickCaptureCandidate } from '../utils/quickCapture'
import { submitQuickCapture } from './quickCaptureSubmit'

const mocks = vi.hoisted(() => ({ create: vi.fn(), invalidate: vi.fn() }))

vi.mock('./domainCommands', () => ({ createEntity: mocks.create }))
vi.mock('./queryClient', () => ({ queryClient: { invalidateQueries: mocks.invalidate } }))

describe('submitQuickCapture', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue({ status: 'queued', commandId: 'capture-1', entityId: 'capture-1', data: null }) })

  it('preserves an Inbox-only suggested entity kind and retry id', async () => {
    const candidate: QuickCaptureCandidate = {
      kind: 'note', confidence: 'ambiguous', missingFields: [], suggestedKind: 'habit',
      evidence: ['显式习惯前缀'],
      draft: { title: null, body: '每天喝水', tags: [], pinned: false, layout: 'default', image_url: null }
    }
    await submitQuickCapture('user-1', candidate, 'capture-1', '习惯：每天喝水', [candidate])
    expect(mocks.create).toHaveBeenCalledWith(expect.anything(), 'user-1', 'inbox', expect.objectContaining({
      raw_text: '习惯：每天喝水', suggested_kind: 'habit', status: 'pending'
    }), { commandId: 'capture-1', entityId: 'capture-1' })
  })
})
