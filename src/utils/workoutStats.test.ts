import { describe, expect, it } from 'vitest'
import {
  bodyPartFrequency,
  computeExercisePR,
  sessionsPerWeek,
  weightDelta,
  weeklyVolume
} from './workoutStats'
import type { BodyMetric, WorkoutExercise, WorkoutSession } from '../types'

const session = (over: Partial<WorkoutSession>): WorkoutSession => ({
  id: 's1',
  user_id: 'u',
  date: '2026-08-04',
  body_part: 'chest',
  duration_min: 60,
  note: null,
  created_at: '2026-08-04T00:00:00Z',
  ...over
})

const exercise = (over: Partial<WorkoutExercise>): WorkoutExercise => ({
  id: 'e1',
  session_id: 's1',
  name: '卧推',
  sets: 4,
  reps: 8,
  weight: 60,
  note: null,
  created_at: '2026-08-04T00:00:00Z',
  ...over
})

describe('sessionsPerWeek', () => {
  it('统计最近 N 周每周训练次数', () => {
    const sessions = [
      session({ id: 'a', date: '2026-08-04' }), // 本周（周二）
      session({ id: 'b', date: '2026-08-02' }), // 上周日
      session({ id: 'c', date: '2026-07-30' }), // 上周四
      session({ id: 'd', date: '2026-07-27' }) // 上周一
    ]
    const weeks = sessionsPerWeek(sessions, '2026-08-04', 4)
    expect(weeks.length).toBe(4)
    expect(weeks[0].count).toBe(1) // 本周（周一 08-03 起）
    expect(weeks[1].count).toBe(3) // 上周（周一 07-27 起）
    expect(weeks[2].count).toBe(0)
    expect(weeks[3].count).toBe(0)
  })

  it('忽略超出范围的会话', () => {
    const sessions = [session({ id: 'a', date: '2026-08-04' }), session({ id: 'b', date: '2026-06-01' })]
    const weeks = sessionsPerWeek(sessions, '2026-08-04', 2)
    expect(weeks[0].count).toBe(1)
    expect(weeks[1].count).toBe(0)
  })
})

describe('bodyPartFrequency', () => {
  it('统计各部位训练次数', () => {
    const sessions = [
      session({ body_part: 'chest' }),
      session({ body_part: 'chest' }),
      session({ body_part: 'leg' })
    ]
    expect(bodyPartFrequency(sessions)).toEqual({ chest: 2, leg: 1 })
  })
})

describe('computeExercisePR', () => {
  it('返回该动作历史最大重量', () => {
    const exercises = [
      exercise({ name: '卧推', weight: 50 }),
      exercise({ name: '卧推', weight: 80 }),
      exercise({ name: '深蹲', weight: 120 })
    ]
    expect(computeExercisePR(exercises, '卧推')).toBe(80)
  })

  it('无该动作时返回 0', () => {
    expect(computeExercisePR([exercise({ name: '卧推', weight: 50 })], '硬拉')).toBe(0)
  })
})

describe('weeklyVolume', () => {
  it('按周计算总容量（重量×次数×组数）', () => {
    const sessions = [
      session({ id: 's1', date: '2026-08-04' }),
      session({ id: 's2', date: '2026-08-05' }),
      session({ id: 's3', date: '2026-07-30' })
    ]
    const exercises = [
      exercise({ session_id: 's1', weight: 60, reps: 8, sets: 4 }), // 1920
      exercise({ session_id: 's2', weight: 100, reps: 5, sets: 3 }), // 1500
      exercise({ session_id: 's3', weight: 50, reps: 10, sets: 4 }) // 不在本周
    ]
    expect(weeklyVolume(exercises, sessions, '2026-08-04')).toBe(3420)
  })

  it('无数据返回 0', () => {
    expect(weeklyVolume([], [], '2026-08-04')).toBe(0)
  })
})

describe('weightDelta', () => {
  it('返回最新体重与相对上一次的变化', () => {
    const metrics: BodyMetric[] = [
      { id: '1', user_id: 'u', date: '2026-08-01', weight: 70, body_fat: null, note: null, created_at: '' },
      { id: '2', user_id: 'u', date: '2026-08-04', weight: 69.2, body_fat: null, note: null, created_at: '' }
    ]
    expect(weightDelta(metrics)).toEqual({ latest: 69.2, delta: -0.8 })
  })

  it('仅一条记录时 delta 为 0', () => {
    const metrics: BodyMetric[] = [
      { id: '1', user_id: 'u', date: '2026-08-04', weight: 70, body_fat: null, note: null, created_at: '' }
    ]
    expect(weightDelta(metrics)).toEqual({ latest: 70, delta: 0 })
  })

  it('空数据返回 null', () => {
    expect(weightDelta([])).toEqual({ latest: null, delta: null })
  })
})
