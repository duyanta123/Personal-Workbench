import { describe, expect, test } from 'vitest'
import { buildBodyMetricUpsert, buildPreferencesUpsert, isGoalProgressValid } from './dataConsistency'

describe('data consistency payloads', () => {
  test('偏好 upsert 只包含用户和本次提交字段', () => {
    expect(buildPreferencesUpsert('u1', { monthly_budget: 2000 })).toEqual({
      user_id: 'u1',
      monthly_budget: 2000
    })
  })

  test('身体指标 patch 不覆盖未填写的另一个指标', () => {
    expect(buildBodyMetricUpsert('u1', { date: '2026-08-06', weight: 65 })).toEqual({
      user_id: 'u1',
      date: '2026-08-06',
      weight: 65
    })
  })

  test('目标进度边界为 0 <= current <= target', () => {
    expect(isGoalProgressValid(0, 1)).toBe(true)
    expect(isGoalProgressValid(1, 1)).toBe(true)
    expect(isGoalProgressValid(-1, 1)).toBe(false)
    expect(isGoalProgressValid(2, 1)).toBe(false)
    expect(isGoalProgressValid(0, 0)).toBe(false)
  })
})
