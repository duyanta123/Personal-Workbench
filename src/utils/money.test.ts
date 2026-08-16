import { describe, expect, it } from 'vitest'
import { formatMinor, parseMoneyToMinor, sumMinor } from './money'

describe('money minor units', () => {
  it('parses decimal input without floating point arithmetic', () => {
    expect(parseMoneyToMinor('12.34')).toBe(1234)
    expect(parseMoneyToMinor('0.1')).toBe(10)
    expect(parseMoneyToMinor(8)).toBe(800)
  })

  it('rejects unsupported precision and signs', () => {
    expect(() => parseMoneyToMinor('1.234')).toThrow('两位小数')
    expect(() => parseMoneyToMinor('-1')).toThrow('两位小数')
  })

  it('sums and formats integer minor values', () => {
    expect(sumMinor([10, 25, 65])).toBe(100)
    expect(formatMinor(1234, 'CNY')).toContain('12.34')
    expect(() => sumMinor([1.5])).toThrow('整数最小单位')
  })
})
