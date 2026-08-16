import { describe, expect, it } from 'vitest'
import { normalizeSavedViewInput, normalizeTemplatePayload } from './workbenchArtifacts'

describe('workbench artifact validation', () => {
  it('normalizes a habit template and rejects unsupported fields', () => {
    expect(normalizeTemplatePayload('habit', {
      name: '  阅读  ', emoji: 'book', tracking_type: 'boolean', period_days: 1,
      target_count: 1, target_value: null, target_mode: 'at_least', reminder_time: '08:30'
    })).toMatchObject({ name: '阅读', tracking_type: 'boolean', reminder_time: '08:30' })
    expect(() => normalizeTemplatePayload('habit', {
      name: '阅读', emoji: 'book', tracking_type: 'boolean', period_days: 1,
      target_count: 1, target_value: null, target_mode: 'at_least', reminder_time: null, script: '<script>'
    })).toThrow('不支持的字段')
  })

  it('rejects invalid numeric template values', () => {
    expect(() => normalizeTemplatePayload('goal', { name: '存款', emoji: 'target', target: Number.NaN, unit: null, note: null, pinned: false })).toThrow('目标值无效')
    expect(() => normalizeTemplatePayload('workout', { body_part: 'leg', duration_min: -1, note: null, exercises: [] })).toThrow('训练时长超出范围')
  })

  it('keeps only a validated ledger view contract', () => {
    expect(normalizeSavedViewInput('ledger', { query: '  午饭 ', kind: 'expense', status: 'posted' }, [{ column: 'amount_minor', direction: 'desc' }])).toEqual({
      filters: { query: '午饭', kind: 'expense', status: 'posted' },
      sort: [{ column: 'amount_minor', direction: 'desc' }]
    })
    expect(() => normalizeSavedViewInput('ledger', { query: '', raw_sql: 'drop table' }, [])).toThrow('不支持的字段')
    expect(() => normalizeSavedViewInput('ledger', {}, [{ column: 'user_id', direction: 'asc' }])).toThrow('排序无效')
  })
})
