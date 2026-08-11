import { describe, expect, test } from 'vitest'
import { isTodayTodo } from './todos'

describe('isTodayTodo', () => {
  test('无日期和今天日期属于今日待办', () => {
    expect(isTodayTodo({ due_date: null }, '2026-08-06')).toBe(true)
    expect(isTodayTodo({ due_date: '2026-08-06' }, '2026-08-06')).toBe(true)
  })

  test('未来和逾期日期不属于今日待办', () => {
    expect(isTodayTodo({ due_date: '2026-08-05' }, '2026-08-06')).toBe(false)
    expect(isTodayTodo({ due_date: '2026-08-07' }, '2026-08-06')).toBe(false)
  })
})
