import { describe, expect, it } from 'vitest'
import type { Habit, HabitLog } from '../types'
import { calculateHabitStrength, calculateHabitStrengths, habitStrengthInsightText, summarizeHabitStrengths } from './habitStrength'

function habit(id: string, createdAt = '2026-07-01T08:00:00'): Habit {
  return { id, user_id: 'u1', name: `习惯 ${id}`, emoji: 'flame', pinned: false, created_at: createdAt }
}

function log(habitId: string, date: string, id = `${habitId}-${date}`): HabitLog {
  return { id, habit_id: habitId, user_id: 'u1', log_date: date, created_at: `${date}T08:00:00` }
}

function dateAt(offset: number) {
  const date = new Date(2026, 7, 12, 12)
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

describe('habit strength', () => {
  it('按 60/25/15 权重计算满分并限制 30 天窗口', () => {
    const logs = Array.from({ length: 30 }, (_, index) => log('h1', dateAt(index - 29)))
    logs.push(log('h1', dateAt(-40), 'old'))
    expect(calculateHabitStrength(habit('h1'), logs, '2026-08-12')).toEqual({
      score: 100,
      band: 'strong',
      completionRate: 100,
      recentRate: 100,
      currentStreak: 30,
      activeDays: 30
    })
  })

  it('今天未打卡时从昨天向前计算连续天数', () => {
    const logs = [-1, -2, -3].map((offset) => log('h1', dateAt(offset)))
    expect(calculateHabitStrength(habit('h1'), logs, '2026-08-12').currentStreak).toBe(3)
  })

  it('忽略未来、窗口外和重复记录', () => {
    const logs = [
      log('h1', '2026-08-12', 'today-1'),
      log('h1', '2026-08-12', 'today-2'),
      log('h1', '2026-08-13', 'future'),
      log('h1', '2026-07-01', 'old')
    ]
    const result = calculateHabitStrength(habit('h1'), logs, '2026-08-12')
    expect(result.completionRate).toBe(3)
    expect(result.currentStreak).toBe(1)
  })

  it('不足三个有效观察日显示积累中并跨月计算', () => {
    const collecting = calculateHabitStrength(habit('new', '2026-08-11T08:00:00'), [log('new', '2026-08-11')], '2026-08-12')
    expect(collecting).toMatchObject({ score: null, band: 'collecting', activeDays: 2 })

    const crossMonth = calculateHabitStrength(habit('month', '2026-07-30T08:00:00'), [log('month', '2026-07-31'), log('month', '2026-08-01')], '2026-08-02')
    expect(crossMonth.activeDays).toBe(4)
    expect(crossMonth.score).not.toBeNull()
  })

  it('按阈值分段并从汇总排名排除积累中', () => {
    const habits = [habit('strong'), habit('attention'), habit('new', '2026-08-12T08:00:00')]
    const logs = [
      ...Array.from({ length: 30 }, (_, index) => log('strong', dateAt(index - 29))),
      log('attention', dateAt(-20))
    ]
    const rows = calculateHabitStrengths(habits, logs, '2026-08-12')
    const summary = summarizeHabitStrengths(rows)
    expect(rows.find((row) => row.habitId === 'strong')?.band).toBe('strong')
    expect(rows.find((row) => row.habitId === 'attention')?.band).toBe('attention')
    expect(summary.eligibleCount).toBe(2)
    expect(summary.strongest?.habitId).toBe('strong')
    expect(summary.attention).toHaveLength(1)
    expect(habitStrengthInsightText(summary)).toContain('2 个习惯已形成评分')
  })

  it('没有足够数据时不生成洞察文案', () => {
    const summary = summarizeHabitStrengths([{ habitId: 'new', name: '新习惯', emoji: 'flame', score: null, band: 'collecting', completionRate: 0, recentRate: 0, currentStreak: 0, activeDays: 1 }])
    expect(summary.averageScore).toBeNull()
    expect(habitStrengthInsightText(summary)).toBeNull()
  })
})
