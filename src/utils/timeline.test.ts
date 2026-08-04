import { describe, expect, it } from 'vitest'
import { aggregateTimeline } from './timeline'
import type { Habit, HabitLog, LedgerEntry, Todo } from '../types'

const todo = (id: string, text: string, done: boolean, updated_at: string): Todo => ({
  id,
  user_id: 'u1',
  text,
  level: 'mid',
  done,
  sort_order: 0,
  due_date: null,
  pinned: false,
  created_at: updated_at,
  updated_at
})

const log = (id: string, habit_id: string, created_at: string): HabitLog => ({
  id,
  habit_id,
  user_id: 'u1',
  log_date: created_at.slice(0, 10),
  created_at
})

const entry = (id: string, kind: LedgerEntry['kind'], amount: number, created_at: string): LedgerEntry => ({
  id,
  user_id: 'u1',
  kind,
  category: '餐饮',
  amount,
  note: null,
  entry_date: created_at.slice(0, 10),
  created_at
})

const habit = (id: string, name: string): Habit => ({
  id,
  user_id: 'u1',
  name,
  emoji: 'flame',
  pinned: false,
  created_at: ''
})

describe('aggregateTimeline', () => {
  it('只收录已完成待办', () => {
    const ev = aggregateTimeline({
      todos: [todo('t1', '写周报', true, '2026-08-04T09:00:00Z'), todo('t2', '未完成', false, '2026-08-04T10:00:00Z')],
      habits: [],
      logs: [],
      entries: [],
      notes: []
    })
    expect(ev.length).toBe(1)
    expect(ev[0].text).toBe('写周报')
  })

  it('按时间倒序排序', () => {
    const ev = aggregateTimeline({
      todos: [todo('t1', '早任务', true, '2026-08-04T09:00:00Z')],
      habits: [habit('h1', '喝水')],
      logs: [log('l1', 'h1', '2026-08-04T11:00:00Z')],
      entries: [entry('e1', 'expense', 30, '2026-08-04T10:00:00Z')],
      notes: []
    })
    expect(ev.map((e) => e.ts)).toEqual([
      '2026-08-04T11:00:00Z',
      '2026-08-04T10:00:00Z',
      '2026-08-04T09:00:00Z'
    ])
  })

  it('最多返回 12 条', () => {
    const todos = Array.from({ length: 20 }, (_, i) => todo(`t${i}`, `任务${i}`, true, `2026-08-04T0${0}:${String(i).padStart(2, '0')}:00Z`))
    const ev = aggregateTimeline({ todos, habits: [], logs: [], entries: [], notes: [] })
    expect(ev.length).toBe(12)
  })

  it('习惯名称从 habits 映射', () => {
    const ev = aggregateTimeline({
      todos: [],
      habits: [habit('h1', '晨跑')],
      logs: [log('l1', 'h1', '2026-08-04T08:00:00Z')],
      entries: [],
      notes: []
    })
    expect(ev[0].text).toBe('晨跑')
  })
})
