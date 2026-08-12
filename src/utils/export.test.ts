import { describe, expect, it } from 'vitest'
import { buildCSV, buildICalendar, buildJSON } from './export'

describe('buildCSV', () => {
  it('生成带表头的 CSV', () => {
    const csv = buildCSV(['日期', '类型'], [['2026-08-01', '支出'], ['2026-08-02', '收入']])
    expect(csv).toBe('日期,类型\n2026-08-01,支出\n2026-08-02,收入')
  })

  it('含逗号、引号、换行的字段被转义', () => {
    const csv = buildCSV(['备注'], [['a,b'], ['say "hi"'], ['line1\nline2']])
    expect(csv).toBe('备注\n"a,b"\n"say ""hi"""\n"line1\nline2"')
  })

  it('null / undefined 输出为空', () => {
    const csv = buildCSV(['a', 'b'], [[null, undefined]])
    expect(csv).toBe('a,b\n,')
  })

  it('阻止公式注入但保留真正的数字', () => {
    const csv = buildCSV(['值'], [[' =SUM(A1:A2)'], ['\tcmd'], ['@x'], [-12, 12]])
    expect(csv).toBe("值\n' =SUM(A1:A2)\n'\tcmd\n'@x\n-12,12")
  })
})

describe('buildJSON', () => {
  it('格式化输出 JSON', () => {
    expect(buildJSON({ a: 1 })).toBe('{\n  "a": 1\n}')
  })
})

describe('buildICalendar', () => {
  const todos = [
    { id: 'b', text: '提交,报告;含附件', level: 'high', done: false, due_date: '2026-12-31', updated_at: '2026-12-01T08:09:10.000Z' },
    { id: 'a', text: '已完成事项', level: 'low', done: true, due_date: '2026-08-12' },
    { id: 'c', text: '没有日期', level: 'mid', done: false, due_date: null }
  ]

  it('默认只导出有日期的未完成待办并稳定生成全天事件', () => {
    const ics = buildICalendar(todos)
    expect(ics).toContain('UID:b@personal-workbench\r\n')
    expect(ics).toContain('DTSTAMP:20261201T080910Z')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101')
    expect(ics).toContain('SUMMARY:提交\\,报告\\;含附件')
    expect(ics).not.toContain('UID:a@personal-workbench')
    expect(ics).not.toContain('UID:c@personal-workbench')
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('可包含已完成项并按日期和 ID 稳定排序', () => {
    const first = buildICalendar(todos, { includeCompleted: true })
    const second = buildICalendar([...todos].reverse(), { includeCompleted: true })
    expect(first).toBe(second)
    expect(first.indexOf('UID:a@personal-workbench')).toBeLessThan(first.indexOf('UID:b@personal-workbench'))
    expect(first).toContain('SUMMARY:[已完成] 已完成事项')
  })

  it('按 UTF-8 字节折行且不拆分中文字符', () => {
    const ics = buildICalendar([{ id: 'long', text: '长'.repeat(60), level: 'mid', done: false, due_date: '2026-08-12' }])
    const summaryLines = ics.split('\r\n').filter((line) => line.startsWith('SUMMARY:') || line.startsWith(' '))
    expect(summaryLines.length).toBeGreaterThan(1)
    for (const line of summaryLines) expect(new TextEncoder().encode(line).byteLength).toBeLessThanOrEqual(75)
    expect(summaryLines.join('').replace(/^SUMMARY:/, '').replace(/ /g, '')).toBe('长'.repeat(60))
  })
})
