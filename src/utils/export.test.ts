import { describe, expect, it } from 'vitest'
import { buildCSV, buildJSON } from './export'

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
})

describe('buildJSON', () => {
  it('格式化输出 JSON', () => {
    expect(buildJSON({ a: 1 })).toBe('{\n  "a": 1\n}')
  })
})
