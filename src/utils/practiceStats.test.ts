import { describe, expect, it } from 'vitest'
import {
  buildHeatmap,
  computeSolvedStreak,
  countByDifficulty,
  countByPlatform,
  uniqueTags
} from './practiceStats'
import type { PracticeProblem } from '../types'

const base = (over: Partial<PracticeProblem>): PracticeProblem => ({
  id: '1',
  user_id: 'u',
  title: 't',
  platform: 'leetcode',
  difficulty: 'medium',
  status: 'ac_solo',
  tags: [],
  url: null,
  note: null,
  solved_at: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  ...over
})

describe('buildHeatmap', () => {
  it('按日期聚合当月完成数', () => {
    const problems = [
      base({ solved_at: '2026-08-03' }),
      base({ solved_at: '2026-08-03' }),
      base({ solved_at: '2026-08-05' })
    ]
    const map = new Map(buildHeatmap(problems, 2026, 8).map((d) => [d.date, d.count]))
    expect(map.get('2026-08-03')).toBe(2)
    expect(map.get('2026-08-05')).toBe(1)
    expect(map.get('2026-08-01')).toBe(0)
  })

  it('覆盖当月每一天（含首日与末日）', () => {
    const heatmap = buildHeatmap([base({ solved_at: '2026-08-15' })], 2026, 8)
    expect(heatmap.length).toBe(31)
    expect(heatmap[0].date).toBe('2026-08-01')
    expect(heatmap[30].date).toBe('2026-08-31')
  })

  it('忽略其它月份的记录', () => {
    const problems = [base({ solved_at: '2026-07-31' }), base({ solved_at: '2026-09-01' })]
    const map = new Map(buildHeatmap(problems, 2026, 8).map((d) => [d.date, d.count]))
    expect([...map.values()].reduce((a, b) => a + b, 0)).toBe(0)
  })
})

describe('computeSolvedStreak', () => {
  it('连续三天从今天向前计数', () => {
    const problems = [
      base({ solved_at: '2026-08-04' }),
      base({ solved_at: '2026-08-03' }),
      base({ solved_at: '2026-08-02' })
    ]
    expect(computeSolvedStreak(problems, '2026-08-04')).toBe(3)
  })

  it('同日多题去重，不重复计数', () => {
    const problems = [
      base({ solved_at: '2026-08-04' }),
      base({ solved_at: '2026-08-04' }),
      base({ solved_at: '2026-08-03' })
    ]
    expect(computeSolvedStreak(problems, '2026-08-04')).toBe(2)
  })

  it('中断后只计到断点', () => {
    const problems = [
      base({ solved_at: '2026-08-04' }),
      base({ solved_at: '2026-08-02' }),
      base({ solved_at: '2026-08-01' })
    ]
    expect(computeSolvedStreak(problems, '2026-08-04')).toBe(1)
  })

  it('今天没刷则为 0', () => {
    const problems = [base({ solved_at: '2026-08-03' })]
    expect(computeSolvedStreak(problems, '2026-08-04')).toBe(0)
  })

  it('空数据为 0', () => {
    expect(computeSolvedStreak([], '2026-08-04')).toBe(0)
  })
})

describe('countByDifficulty', () => {
  it('统计各难度数量', () => {
    const problems = [
      base({ difficulty: 'easy' }),
      base({ difficulty: 'easy' }),
      base({ difficulty: 'hard' })
    ]
    expect(countByDifficulty(problems)).toEqual({ easy: 2, medium: 0, hard: 1 })
  })
})

describe('countByPlatform', () => {
  it('按平台计数', () => {
    const problems = [
      base({ platform: 'leetcode' }),
      base({ platform: 'leetcode' }),
      base({ platform: 'luogu' })
    ]
    expect(countByPlatform(problems)).toEqual({ leetcode: 2, luogu: 1 })
  })
})

describe('uniqueTags', () => {
  it('返回去重排序标签', () => {
    const problems = [
      base({ tags: ['dp', 'tree'] }),
      base({ tags: ['dp', 'graph'] })
    ]
    expect(uniqueTags(problems)).toEqual(['dp', 'graph', 'tree'])
  })
})
