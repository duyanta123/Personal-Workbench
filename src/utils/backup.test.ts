import { describe, expect, test } from 'vitest'
import { collectPages, MAX_AVATAR_BYTES, MAX_BACKUP_TABLE_ROWS, normalizeBackup } from './backup'

describe('backup', () => {
  test('旧版顶层数组升级为 BackupV3 并补齐缺失表', () => {
    const backup = normalizeBackup({ todos: [{ id: 't1', text: 'task' }], notes: [] })
    expect(backup.metadata.version).toBe(3)
    expect(backup.metadata.source_version).toBe(1)
    expect(backup.tables.todos).toHaveLength(1)
    expect(backup.tables.user_preferences).toEqual([])
    expect(backup.avatars).toEqual([])
  })

  test('preserves the original backup version for revision policy', () => {
    const backup = normalizeBackup({
      metadata: { version: 2, exported_at: '2026-08-08T00:00:00.000Z' },
      tables: {},
      avatars: []
    })
    expect(backup.metadata.source_version).toBe(2)
    expect(backup.metadata.source_revision).toBe(0)
  })

  test('拒绝孤立的习惯打卡和训练动作引用', () => {
    expect(() => normalizeBackup({
      habits: [{ id: 'h1', name: '阅读' }],
      habit_logs: [{ id: 'l1', habit_id: 'missing', log_date: '2026-08-06' }]
    })).toThrow('习惯')
    expect(() => normalizeBackup({
      workout_sessions: [{ id: 's1', date: '2026-08-06', body_part: 'full' }],
      workout_exercises: [{ id: 'e1', session_id: 'missing', name: '深蹲', sets: 3, reps: 8, weight: 50 }]
    })).toThrow('训练')
  })

  test('拒绝未知版本、重复 ID 和无效头像数据', () => {
    expect(() => normalizeBackup({ metadata: { version: 4 }, tables: {} })).toThrow('版本')
    expect(() => normalizeBackup({ todos: [{ id: 'same', text: 'A' }, { id: 'same', text: 'B' }] })).toThrow('重复 ID')
    expect(() => normalizeBackup({ metadata: { version: 2 }, tables: {}, avatars: [{ mime_type: 'image/png', data_base64: 'bad' }] })).toThrow('头像')
  })

  test('分页读取直到最后一页，支持超过单页限制的数据', async () => {
    const rows = Array.from({ length: 7 }, (_, index) => index)
    const all = await collectPages(async (from, to) => rows.slice(from, to + 1), 3)
    expect(all).toEqual(rows)
  })

  test('拒绝非法嵌套偏好和负数业务值', () => {
    const pomodoro = { focus: 25, break: 5, long_break: 15, rounds_per_cycle: 4 }
    expect(() => normalizeBackup({
      user_preferences: [{ user_id: 'u1', categories: { expense: 'bad', income: [] }, pomodoro }]
    })).toThrow('user_preferences')
    expect(() => normalizeBackup({
      user_preferences: [{ user_id: 'u1', categories: { expense: [], income: [] }, pomodoro: { ...pomodoro, focus: -1 } }]
    })).toThrow('user_preferences')
    expect(() => normalizeBackup({
      workout_sessions: [{ id: 's1', date: '2026-08-08', body_part: 'full', duration_min: -1 }]
    })).toThrow('workout_sessions')
    expect(() => normalizeBackup({
      pomodoro_sessions: [{ id: 'p1', date: '2026-08-08', count: 1, minutes: -1 }]
    })).toThrow('pomodoro_sessions')
  })

  test('拒绝单表行数、头像数量和解码大小超限', () => {
    const tooManyTodos = Array.from({ length: MAX_BACKUP_TABLE_ROWS + 1 }, (_, index) => ({
      id: `todo-${index}`,
      text: 'task'
    }))
    expect(() => normalizeBackup({ todos: tooManyTodos })).toThrow('50,000')

    const avatar = { mime_type: 'image/webp', data_base64: 'AAAA', is_active: false }
    expect(() => normalizeBackup({ metadata: { version: 3 }, tables: {}, avatars: Array(6).fill(avatar) })).toThrow('5 张')

    const oversizedBase64 = 'A'.repeat(Math.ceil((MAX_AVATAR_BYTES + 1) / 3) * 4)
    expect(() => normalizeBackup({
      metadata: { version: 3 },
      tables: {},
      avatars: [{ ...avatar, data_base64: oversizedBase64 }]
    })).toThrow('5 MiB')
  })

  test('拒绝危险外链协议和超限业务数值', () => {
    expect(() => normalizeBackup({ notes: [{ id: 'n1', body: 'note', tags: [], image_url: 'javascript:alert(1)' }] })).toThrow('notes')
    expect(() => normalizeBackup({
      practice_problems: [{
        id: 'p1', title: 'problem', platform: 'local', difficulty: 'easy', status: 'todo', tags: [], url: 'data:text/html,bad'
      }]
    })).toThrow('practice_problems')
    expect(() => normalizeBackup({ body_metrics: [{ id: 'm1', date: '2026-08-10', body_fat: 101 }] })).toThrow('body_metrics')
  })
})
