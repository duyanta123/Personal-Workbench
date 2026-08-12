import { describe, expect, it } from 'vitest'
import type { Habit, HabitLog, WorkoutExercise, WorkoutSession } from '../types'
import { buildStructuredCSV, STRUCTURED_EXPORT_OPTIONS } from './structuredExport'

describe('structured CSV export', () => {
  it('覆盖全部十个结构化数据集', () => {
    expect(STRUCTURED_EXPORT_OPTIONS.map((option) => option.value)).toEqual([
      'todos', 'ledger_entries', 'habits', 'habit_logs', 'goals', 'practice_problems',
      'workout_sessions', 'workout_exercises', 'body_metrics', 'pomodoro_sessions'
    ])
  })

  it('待办和记账保留原有前五列并追加元数据', () => {
    const todoCsv = buildStructuredCSV('todos', [{ id: 't1', user_id: 'u1', text: '交报告', level: 'high', done: false, sort_order: 2, due_date: '2026-08-12', pinned: true, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z' }])
    expect(todoCsv.split('\n')[0]).toBe('状态,优先级,内容,截止日期,更新时间,ID,置顶,排序,创建时间')

    const ledgerCsv = buildStructuredCSV('ledger_entries', [{ id: 'l1', user_id: 'u1', kind: 'expense', category: '餐饮', amount: 45, note: '=cmd', entry_date: '2026-08-12', created_at: '2026-08-12T00:00:00Z' }])
    expect(ledgerCsv.split('\n')[0]).toBe('日期,类型,分类,金额,备注,ID,原始类型,创建时间')
    expect(ledgerCsv).toContain("'=cmd")
    expect(ledgerCsv).not.toContain('u1')
  })

  it('习惯打卡附加习惯名称', () => {
    const habit: Habit = { id: 'h1', user_id: 'u1', name: '喝水', emoji: 'flame', pinned: false, created_at: '2026-08-01T00:00:00Z' }
    const log: HabitLog = { id: 'log1', habit_id: 'h1', user_id: 'u1', log_date: '2026-08-12', created_at: '2026-08-12T00:00:00Z' }
    expect(buildStructuredCSV('habit_logs', [log], { habits: [habit] })).toContain('2026-08-12,喝水,h1,log1')
  })

  it('训练动作附加场次日期和部位', () => {
    const session: WorkoutSession = { id: 's1', user_id: 'u1', date: '2026-08-12', body_part: 'chest', duration_min: 60, note: null, created_at: '2026-08-12T00:00:00Z' }
    const exercise: WorkoutExercise = { id: 'e1', session_id: 's1', name: '卧推', sets: 5, reps: 8, weight: 60, note: null, created_at: '2026-08-12T00:00:00Z' }
    expect(buildStructuredCSV('workout_exercises', [exercise], { workout_sessions: [session] })).toContain('卧推,5,8,60,,2026-08-12,chest,s1,e1')
  })
})
