import type { BodyMetric, WorkoutExercise, WorkoutSession } from '../types'

/** 返回 weekStart 所在周的周一日期 */
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface WeekCount {
  label: string // 周一日期，作为周标识
  count: number
}

/** 最近 N 周每周训练次数（weekStart 所在周为第 0 周，向前 N-1 周） */
export function sessionsPerWeek(
  sessions: WorkoutSession[],
  weekStart: string,
  weeks = 4
): WeekCount[] {
  const startMonday = mondayOf(weekStart)
  const buckets: WeekCount[] = []
  for (let i = 0; i < weeks; i++) {
    buckets.push({ label: startMonday, count: 0 })
  }
  const indexByMonday = new Map<string, number>()
  buckets.forEach((b, i) => {
    indexByMonday.set(b.label, i)
    // 为下一周生成上一周的周一
  })
  // 计算各周一的归属：从 startMonday 往前推
  const mondayIndex = new Map<string, number>()
  for (let i = 0; i < weeks; i++) {
    const d = new Date(`${startMonday}T00:00:00`)
    d.setDate(d.getDate() - i * 7)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    mondayIndex.set(key, i)
  }
  for (const s of sessions) {
    const m = mondayOf(s.date)
    const idx = mondayIndex.get(m)
    if (idx !== undefined) buckets[idx].count++
  }
  return buckets
}

/** 各部位训练次数 */
export function bodyPartFrequency(sessions: WorkoutSession[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of sessions) out[s.body_part] = (out[s.body_part] ?? 0) + 1
  return out
}

/** 某动作历史最大重量（PR），无记录返回 0 */
export function computeExercisePR(exercises: WorkoutExercise[], name: string): number {
  let pr = 0
  for (const e of exercises) {
    if (e.name === name && e.weight > pr) pr = e.weight
  }
  return pr
}

/** 某周内训练总容量（重量 × 次数 × 组数 求和） */
export function weeklyVolume(
  exercises: WorkoutExercise[],
  sessions: WorkoutSession[],
  weekStart: string
): number {
  const startMonday = mondayOf(weekStart)
  const inWeek = new Set(
    sessions.filter((s) => mondayOf(s.date) === startMonday).map((s) => s.id)
  )
  let total = 0
  for (const e of exercises) {
    if (!inWeek.has(e.session_id)) continue
    total += e.weight * e.reps * e.sets
  }
  return Math.round(total)
}

/** 最新体重与相对上一次的变化（按日期升序取最后两条） */
export function weightDelta(metrics: BodyMetric[]): {
  latest: number | null
  delta: number | null
} {
  const withWeight = metrics
    .filter((m) => m.weight !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (withWeight.length === 0) return { latest: null, delta: null }
  const latest = withWeight[withWeight.length - 1].weight as number
  const prev = withWeight.length >= 2 ? (withWeight[withWeight.length - 2].weight as number) : latest
  return { latest, delta: Math.round((latest - prev) * 100) / 100 }
}
