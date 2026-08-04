import { describe, expect, it } from 'vitest'
import { searchAll, searchBy } from './search'
import type { LedgerEntry, Note, Todo } from '../types'

const NOTES = [
  { id: 'n1', title: '买咖啡豆', body: '手冲水温 92 度', tags: ['咖啡', '日常'] },
  { id: 'n2', title: '跑步计划', body: '每周三次，配速 6 分', tags: ['运动'] }
]

describe('searchBy', () => {
  it('按任一字段命中即返回', () => {
    const r = searchBy(NOTES, '咖啡', (n) => [n.title, n.body, ...n.tags])
    expect(r.map((n) => n.id)).toEqual(['n1'])
  })

  it('大小写不敏感', () => {
    const r = searchBy(NOTES, 'JAVA', (n) => [n.body])
    expect(r).toEqual([])
    const r2 = searchBy([{ t: 'Hello World' }], 'hello', (x) => [x.t])
    expect(r2.length).toBe(1)
  })

  it('空查询返回全部', () => {
    expect(searchBy(NOTES, '  ', (n) => [n.title])).toEqual(NOTES)
  })
})

describe('searchAll', () => {
  it('跨模块命中分组返回', () => {
    const r = searchAll(
      {
        todos: [{ id: 't1', text: '买咖啡豆' }] as Todo[],
        notes: NOTES as Note[],
        ledger: [{ id: 'l1', category: '咖啡', note: '星巴克' }] as LedgerEntry[]
      },
      '咖啡'
    )
    expect(r.todos.map((t) => t.id)).toEqual(['t1'])
    expect(r.notes.map((n) => n.id)).toEqual(['n1'])
    expect(r.ledger.map((l) => l.id)).toEqual(['l1'])
  })

  it('无命中返回空分组', () => {
    const r = searchAll(
      { todos: [] as Todo[], notes: NOTES as Note[], ledger: [] as LedgerEntry[] },
      '不存在的词'
    )
    expect(r.todos).toEqual([])
    expect(r.notes).toEqual([])
    expect(r.ledger).toEqual([])
  })
})
