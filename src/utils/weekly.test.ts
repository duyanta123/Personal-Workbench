import { describe, expect, it } from 'vitest'
import { weekCompletionRate, weekDates } from './weekly'

describe('weekDates', () => {
  it('返回 7 个日期，且第一个是周一', () => {
    const dates = weekDates()
    expect(dates).toHaveLength(7)
    const first = new Date(`${dates[0]}T00:00:00`)
    expect(first.getDay()).toBe(1) // 周一
  })

  it('日期连续递增', () => {
    const dates = weekDates()
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(`${dates[i - 1]}T00:00:00`)
      const cur = new Date(`${dates[i]}T00:00:00`)
      expect(cur.getTime() - prev.getTime()).toBe(86400000)
    }
  })
})

describe('weekCompletionRate', () => {
  it('当前周只用已过去天数作分母', () => {
    expect(weekCompletionRate(2, 3)).toBe(67)
    expect(weekCompletionRate(2, 7)).toBe(29)
  })
})
