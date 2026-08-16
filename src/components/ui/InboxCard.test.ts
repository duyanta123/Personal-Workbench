import { describe, expect, it } from 'vitest'
import type { InboxItem } from '../../types'
import { initialInboxDraft } from './InboxCard'

const item: InboxItem = {
  id: 'inbox-1', user_id: 'user-1', raw_text: '习惯：每天喝水', source: 'quick_capture',
  parsed_candidates: [{
    kind: 'note', confidence: 'ambiguous', missingFields: [], evidence: ['显式习惯前缀'], suggestedKind: 'habit',
    draft: { title: null, body: '每天喝水', tags: [], pinned: false, layout: 'default', image_url: null }
  }],
  suggested_kind: 'habit', status: 'pending', routed_kind: null, routed_id: null,
  created_at: '2026-08-16T00:00:00Z', updated_at: '2026-08-16T00:00:00Z'
}

describe('Inbox draft routing', () => {
  it('uses the parsed body instead of copying the explicit prefix into the target name', () => {
    expect(initialInboxDraft(item, 'habit', '2026-08-16')).toMatchObject({
      name: '每天喝水', tracking_type: 'boolean', period_days: 1, target_count: 1
    })
  })
})
