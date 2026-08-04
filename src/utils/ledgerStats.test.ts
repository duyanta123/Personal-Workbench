import { describe, expect, it } from 'vitest'
import { calcMoM, dailyBars, donutStops } from './ledgerStats'

describe('donutStops', () => {
  it('按占比累计出渐变停靠点', () => {
    const segs = donutStops([
      ['餐饮', 50],
      ['交通', 30],
      ['娱乐', 20]
    ])
    expect(segs.length).toBe(3)
    expect(segs[0].pct).toBe(50)
    expect(segs[0].stop).toBe(50)
    expect(segs[1].pct).toBe(30)
    expect(segs[1].stop).toBe(80)
    expect(segs[2].pct).toBe(20)
    expect(segs[2].stop).toBe(100)
  })

  it('总额为 0 时占比为 0，不除零', () => {
    expect(donutStops([])).toEqual([])
  })
})

describe('dailyBars', () => {
  it('生成整月每日数据，未记账日补 0', () => {
    const bars = dailyBars(
      [
        { entry_date: '2026-08-01', amount: 10 },
        { entry_date: '2026-08-03', amount: 5 }
      ],
      2026,
      8
    )
    expect(bars.length).toBe(31)
    expect(bars[0]).toEqual({ day: 1, date: '2026-08-01', total: 10 })
    expect(bars[1].total).toBe(0)
    expect(bars[2].total).toBe(5)
  })

  it('其他月份的数据被忽略', () => {
    const bars = dailyBars([{ entry_date: '2026-07-01', amount: 99 }], 2026, 8)
    expect(bars.every((b) => b.total === 0)).toBe(true)
  })
})

describe('calcMoM', () => {
  it('环比计算百分比与涨跌方向', () => {
    expect(calcMoM(120, 100)).toEqual({ pct: 20, up: true })
    expect(calcMoM(80, 100)).toEqual({ pct: -20, up: false })
    expect(calcMoM(100, 100)).toEqual({ pct: 0, up: true })
  })

  it('上月为 0 时返回 null（无法比较）', () => {
    expect(calcMoM(50, 0)).toEqual({ pct: null, up: true })
  })
})
