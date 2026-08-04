import { describe, expect, it } from 'vitest'
import { computeStreak } from './streak'

const S = (...xs: string[]) => new Set(xs)

describe('computeStreak', () => {
  it('今天已打卡：从今天往前连续计数', () => {
    const dates = S('2026-08-04', '2026-08-03', '2026-08-02')
    expect(computeStreak(dates, '2026-08-04')).toBe(3)
  })

  it('今天未打卡：从昨天往前计数，天数不清零', () => {
    const dates = S('2026-08-03', '2026-08-02', '2026-08-01')
    expect(computeStreak(dates, '2026-08-04')).toBe(3)
  })

  it('中间断档：只数最近连续段', () => {
    const dates = S('2026-08-04', '2026-08-03', '2026-08-01', '2026-07-31')
    expect(computeStreak(dates, '2026-08-04')).toBe(2)
  })

  it('今天与昨天都没打卡：连续天数为 0', () => {
    const dates = S('2026-07-30')
    expect(computeStreak(dates, '2026-08-04')).toBe(0)
  })

  it('没有任何记录：0', () => {
    expect(computeStreak(S(), '2026-08-04')).toBe(0)
  })
})
