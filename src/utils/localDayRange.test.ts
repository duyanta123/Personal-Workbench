import { describe, expect, test } from 'vitest'
import { localDayRange } from './localDayRange'

describe('localDayRange', () => {
  test('returns an explicit UTC half-open range for a local day', () => {
    const range = localDayRange('2026-08-09')
    expect(new Date(range.end).getTime() - new Date(range.start).getTime()).toBe(24 * 60 * 60 * 1000)
  })

  test('rejects malformed dates', () => {
    expect(() => localDayRange('2026-8-9')).toThrow('invalid local date')
    expect(() => localDayRange('2026-02-30')).toThrow('invalid local date')
  })
})
