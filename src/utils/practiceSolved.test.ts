import { describe, expect, test } from 'vitest'
import { resolveSolvedAt } from './practiceSolved'

const TODAY = '2026-08-05'

describe('resolveSolvedAt', () => {
  test('进入 AC 状态（之前非 AC）时置为今天', () => {
    expect(resolveSolvedAt({ status: 'todo', solved_at: null }, 'ac_solo', TODAY)).toBe(TODAY)
  })

  test('AC → AC 切换保留原 solved_at，不重置为今天', () => {
    expect(resolveSolvedAt({ status: 'ac_solo', solved_at: '2026-07-01' }, 'ac_hint', TODAY)).toBe('2026-07-01')
  })

  test('离开 AC 状态时清空 solved_at', () => {
    expect(resolveSolvedAt({ status: 'ac_solo', solved_at: '2026-07-01' }, 'failed', TODAY)).toBeNull()
  })

  test('非 AC → 非 AC 保持 null', () => {
    expect(resolveSolvedAt({ status: 'todo', solved_at: null }, 'doing', TODAY)).toBeNull()
  })

  test('无历史记录（新增）进入 AC 时置为今天', () => {
    expect(resolveSolvedAt(null, 'ac_hint', TODAY)).toBe(TODAY)
  })

  test('AC → AC 且原 solved_at 为空时置为今天（数据兜底）', () => {
    expect(resolveSolvedAt({ status: 'ac_solo', solved_at: null }, 'ac_hint', TODAY)).toBe(TODAY)
  })
})
