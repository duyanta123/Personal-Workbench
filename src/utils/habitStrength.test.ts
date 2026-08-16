import { describe, expect, it } from 'vitest'
import type { Habit, HabitLog } from '../types'
import { calculateHabitStrength, calculateHabitStrengths, habitStrengthInsightText, summarizeHabitStrengths } from './habitStrength'

function habit(id: string, patch: Partial<Habit> = {}): Habit {
  return { id, user_id: 'u1', name: `习惯 ${id}`, emoji: 'flame', pinned: false, created_at: '2026-07-01T08:00:00', ...patch }
}

function log(habitId: string, date: string, patch: Partial<HabitLog> = {}): HabitLog {
  return { id: `${habitId}-${date}-${patch.state ?? 'done'}`, habit_id: habitId, user_id: 'u1', log_date: date, created_at: `${date}T08:00:00`, state: 'done', value: null, ...patch }
}

function dateAt(offset: number) {
  const date = new Date(2026, 7, 12, 12)
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

describe('habit strength', () => {
  it('连续完成每日机会得到满分，窗口外记录不影响结果', () => {
    const logs = Array.from({ length: 43 }, (_, index) => log('h1', dateAt(index - 42)))
    logs.push(log('h1', dateAt(-200)))
    expect(calculateHabitStrength(habit('h1'), logs, '2026-08-12')).toMatchObject({
      score: 100, band: 'strong', completionRate: 100, recentRate: 100, currentStreak: 43
    })
  })

  it('近期机会的权重大于远期机会', () => {
    const oldWins = Array.from({ length: 28 }, (_, index) => log('old', dateAt(index - 55)))
    const recentWins = Array.from({ length: 28 }, (_, index) => log('recent', dateAt(index - 27)))
    const oldScore = calculateHabitStrength(habit('old'), oldWins, '2026-08-12').score ?? 0
    const recentScore = calculateHabitStrength(habit('recent'), recentWins, '2026-08-12').score ?? 0
    expect(recentScore).toBeGreaterThan(oldScore)
  })

  it('主动跳过为中性，不计入完成率分母并保持连续机会', () => {
    const logs = [log('h1', dateAt(-2)), log('h1', dateAt(-1), { state: 'skipped' }), log('h1', dateAt(0))]
    const result = calculateHabitStrength(habit('h1', { created_at: `${dateAt(-2)}T08:00:00` }), logs, '2026-08-12')
    expect(result).toMatchObject({ completionRate: 100, currentStreak: 2, score: null, activeDays: 3 })
  })

  it('数值习惯按周期聚合并支持至少与至多', () => {
    const atLeast = habit('water', { created_at: '2026-08-07T08:00:00', tracking_type: 'numeric', period_days: 2, target_value: 8, target_mode: 'at_least' })
    const waterLogs = [log('water', '2026-08-07', { value: 3 }), log('water', '2026-08-08', { value: 5 }), log('water', '2026-08-09', { value: 7 }), log('water', '2026-08-11', { value: 8 })]
    expect(calculateHabitStrength(atLeast, waterLogs, '2026-08-12')).toMatchObject({ completionRate: 67, score: expect.any(Number) })

    const atMost = habit('screen', { created_at: '2026-08-10T08:00:00', tracking_type: 'numeric', target_value: 2, target_mode: 'at_most' })
    expect(calculateHabitStrength(atMost, [log('screen', '2026-08-10', { value: 1 }), log('screen', '2026-08-11', { value: 3 }), log('screen', '2026-08-12', { value: 2 })], '2026-08-12')).toMatchObject({ completionRate: 67 })
  })

  it('按阈值分段并从汇总排名排除积累中', () => {
    const habits = [habit('strong'), habit('attention'), habit('new', { created_at: '2026-08-12T08:00:00' })]
    const logs = Array.from({ length: 43 }, (_, index) => log('strong', dateAt(index - 42)))
    const rows = calculateHabitStrengths(habits, logs, '2026-08-12')
    const summary = summarizeHabitStrengths(rows)
    expect(rows.find((row) => row.habitId === 'strong')?.band).toBe('strong')
    expect(rows.find((row) => row.habitId === 'attention')?.band).toBe('attention')
    expect(summary.eligibleCount).toBe(2)
    expect(summary.strongest?.habitId).toBe('strong')
    expect(habitStrengthInsightText(summary)).toContain('2 个习惯已形成评分')
  })

  it('没有足够机会时不生成洞察文案', () => {
    const summary = summarizeHabitStrengths([{ habitId: 'new', name: '新习惯', emoji: 'flame', score: null, band: 'collecting', completionRate: 0, recentRate: 0, currentStreak: 0, activeDays: 1 }])
    expect(summary.averageScore).toBeNull()
    expect(habitStrengthInsightText(summary)).toBeNull()
  })
})
