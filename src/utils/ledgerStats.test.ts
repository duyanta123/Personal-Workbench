import { describe, expect, it } from 'vitest'
import { donutStops } from './ledgerStats'

describe('donutStops', () => {
  it('按占比累计出渐变停靠点', () => {
    const segments = donutStops([['餐饮', 50], ['交通', 30], ['娱乐', 20]])
    expect(segments.map((segment) => [segment.pct, segment.stop])).toEqual([[50, 50], [30, 80], [20, 100]])
  })

  it('总额为 0 时不除零', () => {
    expect(donutStops([])).toEqual([])
  })
})
