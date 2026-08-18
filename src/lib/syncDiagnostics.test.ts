import { describe, expect, it } from 'vitest'
import { buildSyncDiagnostics } from './syncDiagnostics'

describe('sync diagnostics', () => {
  it('contains counts but no entity IDs or command payloads', () => {
    const value = buildSyncDiagnostics({
      online: true,
      commands: [{ status: 'failed', entityId: 'secret-id', payload: { text: 'secret' } } as never],
      metadata: { lastAttemptAt: null, lastSuccessAt: '2026-08-18T00:00:00Z' },
      syncState: { revision: 4, restore_epoch: 2 },
      generatedAt: '2026-08-18T01:00:00Z'
    })
    expect(value.queue.statuses.failed).toBe(1)
    expect(JSON.stringify(value)).not.toContain('secret')
  })
})
