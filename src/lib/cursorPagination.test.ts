import { beforeEach, describe, expect, test } from 'vitest'
import { afterCursor, clearCursorScopes, cursorToken, cursorScope, getPageCursor, rememberPageCursor } from './cursorPagination'

describe('cursorPagination', () => {
  beforeEach(() => clearCursorScopes())

  test('builds a composite PostgREST predicate in sort order', () => {
    expect(afterCursor(
      { pinned: true, sort_order: 12, id: 'abc' },
      [
        { column: 'pinned', direction: 'desc' },
        { column: 'sort_order', direction: 'asc' },
        { column: 'id', direction: 'asc' }
      ]
    )).toBe('pinned.lt.true,and(pinned.eq.true,sort_order.gt.12),and(pinned.eq.true,sort_order.eq.12,id.gt."abc")')
  })

  test('stores cursors per filter scope and page', () => {
    const scope = cursorScope(['todos', 'user-1', 'query'])
    expect(getPageCursor(scope, 1)).toBeNull()
    rememberPageCursor(scope, 1, { id: 'row-1' })
    expect(getPageCursor(scope, 1)).toEqual({ id: 'row-1' })
    expect(cursorToken(getPageCursor(scope, 1))).toBe('{"id":"row-1"}')
  })

  test('combines literal search and cursor groups without duplicate OR parameters', () => {
    const filter = afterCursor(
      { updated_at: '2026-08-10T10:00:00+00:00', id: 'row-2' },
      [
        { column: 'updated_at', direction: 'desc' },
        { column: 'id', direction: 'desc' }
      ],
      'title.ilike."%a,b%",body.ilike."%a,b%"'
    )
    expect(filter).toBe(
      'and(or(title.ilike."%a,b%",body.ilike."%a,b%"),updated_at.lt."2026-08-10T10:00:00+00:00"),' +
      'and(or(title.ilike."%a,b%",body.ilike."%a,b%"),and(updated_at.eq."2026-08-10T10:00:00+00:00",id.lt."row-2"))'
    )
  })
})
