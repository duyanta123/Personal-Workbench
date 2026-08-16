import { describe, expect, test } from 'vitest'
import { collectPages, MAX_AVATAR_BYTES, MAX_BACKUP_TABLE_ROWS, normalizeBackup } from './backup'

describe('backup', () => {
  test('旧版顶层数组升级为 BackupV7 并补齐缺失表和安全默认值', () => {
    const backup = normalizeBackup({ todos: [{ id: 't1', text: 'task' }], notes: [] })
    expect(backup.metadata.version).toBe(7)
    expect(backup.metadata.source_version).toBe(1)
    expect(backup.tables.todos).toHaveLength(1)
    expect(backup.tables.todos[0]).toMatchObject({ done: false, status: 'open' })
    expect(backup.tables.inbox_items).toEqual([])
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
    expect(() => normalizeBackup({ metadata: { version: 8 }, tables: {} })).toThrow('版本')
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

  test('旧账目升级为整数金额并归入默认账户', () => {
    const backup = normalizeBackup({
      ledger_entries: [{ id: 'l1', kind: 'expense', category: '餐饮', amount: 12.34, entry_date: '2026-08-13' }]
    })
    expect(backup.tables.ledger_entries[0]).toMatchObject({ amount_minor: 1234, currency_code: 'CNY', status: 'posted' })
    expect(backup.tables.ledger_accounts).toHaveLength(1)
    expect(backup.tables.ledger_entries[0].account_id).toBe(backup.tables.ledger_accounts[0].id)
  })

  test('V7 保留跨实体引用并拒绝孤立链接', () => {
    const valid = normalizeBackup({
      metadata: { version: 7, source_revision: 4 }, tables: {
        todos: [{ id: '00000000-0000-4000-8000-000000000001', text: '关联任务' }],
        notes: [{ id: '00000000-0000-4000-8000-000000000002', body: '说明', tags: [] }],
        entity_links: [{
          id: '00000000-0000-4000-8000-000000000003', source_kind: 'todo',
          source_id: '00000000-0000-4000-8000-000000000001', target_kind: 'note',
          target_id: '00000000-0000-4000-8000-000000000002'
        }]
      }, avatars: []
    })
    expect(valid.tables.entity_links).toHaveLength(1)
    expect(() => normalizeBackup({ metadata: { version: 7 }, tables: {
      entity_links: [{ id: 'x', source_kind: 'todo', source_id: 'missing', target_kind: 'note', target_id: 'missing' }]
    } })).toThrow('关联')
  })

  test('V1–V6 版本矩阵：全部可导入并按版本补默认值', () => {
    // V1：裸顶层数组。
    const v1 = normalizeBackup({
      todos: [{ id: 't1', text: 'v1 task', done: true }],
      habits: [{ id: 'h1', name: '阅读' }]
    })
    expect(v1.metadata.source_version).toBe(1)
    expect(v1.tables.todos[0]).toMatchObject({ status: 'done' })
    expect(v1.tables.habits[0]).toMatchObject({ tracking_type: 'boolean', period_days: 1, target_count: 1 })
    expect(v1.tables.habit_logs).toEqual([])
    expect(v1.tables.inbox_items).toEqual([])
    expect(v1.tables.recurrence_rules).toEqual([])

    // V3：tables 包裹结构，无 inbox / 周期规则 / 新记账实体。
    const v3 = normalizeBackup({
      metadata: { version: 3, exported_at: '2026-08-12T00:00:00.000Z' },
      tables: { todos: [{ id: 't3', text: 'v3 task' }], notes: [{ id: 'n3', body: 'v3 note', tags: [] }] },
      avatars: []
    })
    expect(v3.metadata.source_version).toBe(3)
    expect(v3.tables.inbox_items).toEqual([])
    expect(v3.tables.ledger_accounts).toEqual([])

    // V5：有周期规则与习惯新字段，但无新记账实体与状态历史。
    const v5 = normalizeBackup({
      metadata: { version: 5, exported_at: '2026-08-13T00:00:00.000Z' },
      tables: {
        recurrence_rules: [{
          id: 'r5', entity_type: 'todo', frequency: 'weekly', interval_count: 1,
          weekdays: [1], start_date: '2026-08-10', timezone: 'Asia/Shanghai',
          generation_mode: 'manual', template: { text: '周会' }
        }],
        habits: [{ id: 'h5', name: '跑步', tracking_type: 'numeric', period_days: 7, target_count: 1, target_value: 10, target_mode: 'at_least' }]
      },
      avatars: []
    })
    expect(v5.metadata.source_version).toBe(5)
    expect(v5.tables.recurrence_rules).toHaveLength(1)
    expect(v5.tables.ledger_rules).toEqual([])
    expect(v5.tables.todo_status_history).toEqual([])

    // V6：有新记账实体，但无链接/模板/保存视图/状态历史。
    const v6 = normalizeBackup({
      metadata: { version: 6, exported_at: '2026-08-14T00:00:00.000Z' },
      tables: {
        ledger_entries: [{ id: 'l6', kind: 'expense', category: '餐饮', amount: 25, amount_minor: 2500, currency_code: 'CNY', status: 'posted', entry_date: '2026-08-14', account_id: 'a6' }],
        ledger_accounts: [{ id: 'a6', name: '现金', type: 'cash', opening_balance_minor: 0, archived: false }]
      },
      avatars: []
    })
    expect(v6.metadata.source_version).toBe(6)
    expect(v6.tables.entity_links).toEqual([])
    expect(v6.tables.todo_status_history).toEqual([])
    expect(v6.tables.ledger_entries[0].account_id).toBe('a6')
  })
})
