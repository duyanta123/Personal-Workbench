import { describe, expect, it } from 'vitest'
import { QUOTES, dailyQuote, weekNumber } from './quotes'

describe('quotes', () => {
  it('每日一句共 7 条，非空', () => {
    expect(QUOTES).toHaveLength(7)
    for (const q of QUOTES) expect(q.trim().length).toBeGreaterThan(0)
  })

  it('dailyQuote 返回非空字符串', () => {
    expect(dailyQuote().length).toBeGreaterThan(0)
  })

  it('weekNumber 返回正整数', () => {
    expect(weekNumber()).toBeGreaterThan(0)
  })
})
