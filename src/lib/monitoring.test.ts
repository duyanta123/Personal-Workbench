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
})
