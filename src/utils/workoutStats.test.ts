import { describe, expect, it } from 'vitest'
import { weightDelta } from './workoutStats'
import type { BodyMetric } from '../types'

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
