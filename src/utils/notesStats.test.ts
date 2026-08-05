import { describe, expect, test } from 'vitest'
import { createdTodayCount } from './notesStats'

/** 本地时区格式化（与业务逻辑一致） */
function localFmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('createdTodayCount', () => {
  test('刚刚创建的记录计入今日新增', () => {
    const now = new Date()
    const today = localFmt(now)
    expect(createdTodayCount([{ created_at: now.toISOString() }], today)).toBe(1)
  })

  test('25 小时前的记录不计入今日', () => {
    const now = new Date()
    const today = localFmt(now)
    const old = new Date(now.getTime() - 25 * 3600 * 1000).toISOString()
    expect(createdTodayCount([{ created_at: old }], today)).toBe(0)
  })

  test('UTC 时间戳按本地日期归属（凌晨不串日）', () => {
    // 2026-08-04T16:30:00Z 在 UTC+8 本地是 2026-08-05 00:30
    const created = '2026-08-04T16:30:00Z'
    const expectedLocal = localFmt(new Date(created))
    expect(createdTodayCount([{ created_at: created }], expectedLocal)).toBe(1)
  })
})
