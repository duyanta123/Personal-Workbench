import { describe, expect, it } from 'vitest'
import { habitSeries, todayWeekIndex, weekDates } from './weekly'
import type { HabitLog } from '../types'

function log(habit_id: string, log_date: string): HabitLog {
  return {
    id: `${habit_id}-${log_date}`,
    habit_id,
    user_id: 'u1',
    log_date,
    created_at: `${log_date}T00:00:00Z`
  }
}

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

describe('habitSeries', () => {
  it('按本周 7 天统计每日打卡次数', () => {
    const dates = weekDates()
    const logs = [
      log('a', dates[0]),
      log('b', dates[0]),
      log('a', dates[2])
    ]
    const series = habitSeries(logs)
    expect(series).toHaveLength(7)
    expect(series[0].value).toBe(2)
    expect(series[2].value).toBe(1)
    expect(series[1].value).toBe(0)
    expect(series[0].label).toBe('一')
  })

  it('空数据返回全 0', () => {
    const series = habitSeries([])
    expect(series.every((s) => s.value === 0)).toBe(true)
  })
})

describe('todayWeekIndex', () => {
  it('本周内日期返回正确索引', () => {
    const monday = weekDates()[0]
    expect(todayWeekIndex(monday)).toBe(0)
  })

  it('不在本周返回 -1', () => {
    expect(todayWeekIndex('2000-01-01')).toBe(-1)
  })
})
