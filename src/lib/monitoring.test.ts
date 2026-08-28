import { describe, expect, it } from 'vitest'
import { redactMonitoringValue } from './monitoring'

describe('monitoring redaction', () => {
  it('removes business content and credentials', () => {
    expect(redactMonitoringValue({
      token: 'jwt', payload: { title: 'secret note' }, amount_minor: 500, rpc: 'begin_restore'
    })).toEqual({ token: '[Filtered]', payload: '[Filtered]', amount_minor: '[Filtered]', rpc: 'begin_restore' })
  })

  it('strips query strings from URLs', () => {
    expect(redactMonitoringValue('https://example.test/path?token=secret#x', 'requestUrl'))
      .toBe('https://example.test/path')
  })

  it('filters JWT-shaped values and endpoint query parameters', () => {
    expect(redactMonitoringValue('eyJhbGciOiJIUzI1NiJ9.payload.signature', 'accessToken')).toBe('[Filtered]')
    expect(redactMonitoringValue('https://push.test/notify?secret=hidden', 'endpoint')).toBe('https://push.test/notify')
  })

  it('filters free-form message and command fields', () => {
    expect(redactMonitoringValue({ message: 'private body', command: { note: 'secret' }, rpc: 'safe' }))
      .toEqual({ message: '[Filtered]', command: '[Filtered]', rpc: 'safe' })
  })

  it('keeps non-sensitive sync telemetry fields', () => {
    expect(redactMonitoringValue({
      rpc: 'finalize_restore', error_category: 'rpc', recovery_stage: 'finalize_restore',
      restore_epoch: 3, queue_count: 2
    })).toEqual({
      rpc: 'finalize_restore', error_category: 'rpc', recovery_stage: 'finalize_restore',
      restore_epoch: 3, queue_count: 2
    })
  })
})
