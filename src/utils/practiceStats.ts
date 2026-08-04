import type { PracticeDifficulty, PracticeProblem } from '../types'

/** 当月每日完成题数（含当日为 0 的占位），供热力图渲染 */
export function buildHeatmap(
  problems: PracticeProblem[],
  year: number,
  month: number
): { date: string; count: number }[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const counts = new Map<string, number>()
  for (const p of problems) {
    if (p.solved_at && p.solved_at.startsWith(prefix)) {
      counts.set(p.solved_at, (counts.get(p.solved_at) ?? 0) + 1)
    }
  }
  const out: { date: string; count: number }[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${prefix}-${String(d).padStart(2, '0')}`
    out.push({ date, count: counts.get(date) ?? 0 })
  }
  return out
}

/** 连续完成天数（按 solved_at 去重，从今天向前，中断即止） */
export function computeSolvedStreak(problems: PracticeProblem[], today: string): number {
  const days = new Set(
    problems.map((p) => p.solved_at).filter((d): d is string => !!d)
  )
  let streak = 0
  const cursor = new Date(`${today}T00:00:00`)
  while (true) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    if (!days.has(key)) break
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** 各难度数量 */
export function countByDifficulty(
  problems: PracticeProblem[]
): Record<PracticeDifficulty, number> {
  const out: Record<PracticeDifficulty, number> = { easy: 0, medium: 0, hard: 0 }
  for (const p of problems) out[p.difficulty]++
  return out
}

/** 各平台数量 */
export function countByPlatform(problems: PracticeProblem[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of problems) out[p.platform] = (out[p.platform] ?? 0) + 1
  return out
}

/** 去重排序的标签列表 */
export function uniqueTags(problems: PracticeProblem[]): string[] {
  const set = new Set<string>()
  for (const p of problems) for (const t of p.tags) set.add(t)
  return [...set].sort()
}
