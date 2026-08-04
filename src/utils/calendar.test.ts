import { describe, expect, it } from 'vitest'
import { buildMonthGrid, monthCompletion } from './calendar'

describe('buildMonthGrid', () => {
  it('2026-08-01 是周六，前导空位 5 个（周一起始）', () => {
    const grid = buildMonthGrid(2026, 8)
    const firstNullRun = grid.findIndex((c) => c !== null)
    expect(firstNullRun).toBe(5)
    expect(grid[5]).toBe('2026-08-01')
    expect(grid).toContain('2026-08-31')
    expect(grid.length % 7).toBe(0)
  })

  it('网格不含上个月日期，总数是 7 的倍数', () => {
    const grid = buildMonthGrid(2026, 7)
    expect(grid).toContain('2026-07-01')
    expect(grid).toContain('2026-07-31')
    expect(grid.length % 7).toBe(0)
  })
})

describe('monthCompletion', () => {
  it('当月：按已过天数为分母', () => {
    const logged = new Set(['2026-08-01', '2026-08-02'])
    // 今天 8 月 4 日，已过 4 天，打卡 2 天 → 50%
    expect(monthCompletion(logged, 2026, 8, '2026-08-04')).toBe(50)
  })

  it('过去月份：按整月天数为分母', () => {
    const logged = new Set(['2026-07-01', '2026-07-02'])
    // 7 月 31 天，打卡 2 天 → 6%
    expect(monthCompletion(logged, 2026, 7, '2026-08-04')).toBe(6)
  })

  it('未来月份：完成率 0', () => {
    expect(monthCompletion(new Set(), 2026, 9, '2026-08-04')).toBe(0)
  })

  it('当月尚未到期的未来日期不计入已打卡', () => {
    // 今天 8 月 4 日，8 月 10 日的打卡不应计入分母为 4 的统计
    const logged = new Set(['2026-08-10', '2026-08-01'])
    expect(monthCompletion(logged, 2026, 8, '2026-08-04')).toBe(25)
  })
})
