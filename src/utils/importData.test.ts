import { describe, expect, test } from 'vitest'
import { collectIdMap, remapColumn, stripMeta } from './importData'

describe('stripMeta', () => {
  test('去除 id / user_id / 时间戳，保留业务字段', () => {
    const rows = [{ id: 'a', user_id: 'u', created_at: 'c', updated_at: 'u2', name: 'x', done: false }]
    expect(stripMeta(rows)).toEqual([{ name: 'x', done: false }])
  })

  test('空数组原样返回', () => {
    expect(stripMeta([])).toEqual([])
  })
})

describe('remapColumn', () => {
  test('按映射表重写外键列', () => {
    const map = new Map([['old-1', 'new-1']])
    expect(remapColumn([{ habit_id: 'old-1', log_date: '2026-08-01' }], map, 'habit_id')).toEqual([
      { habit_id: 'new-1', log_date: '2026-08-01' }
    ])
  })

  test('映射表中不存在的值保持不变', () => {
    const map = new Map([['old-1', 'new-1']])
    expect(remapColumn([{ session_id: 'x', name: '卧推' }], map, 'session_id')).toEqual([
      { session_id: 'x', name: '卧推' }
    ])
  })
})

describe('collectIdMap', () => {
  test('按顺序建立旧 id → 新 id 映射', () => {
    const oldRows = [{ id: 'a' }, { id: 'b' }]
    const newRows = [{ id: 'x' }, { id: 'y' }]
    expect(collectIdMap(oldRows, newRows)).toEqual(
      new Map([
        ['a', 'x'],
        ['b', 'y']
      ])
    )
  })

  test('数量不一致时只映射前 n 条', () => {
    const oldRows = [{ id: 'a' }, { id: 'b' }]
    const newRows = [{ id: 'x' }]
    expect(collectIdMap(oldRows, newRows)).toEqual(new Map([['a', 'x']]))
  })
})
