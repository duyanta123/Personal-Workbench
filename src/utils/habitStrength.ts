import type { Habit, HabitLog } from '../types'

export type HabitStrengthBand = 'strong' | 'stable' | 'attention' | 'collecting'

export interface HabitStrength {
  score: number | null
  band: HabitStrengthBand
  completionRate: number
  recentRate: number
  currentStreak: number
  activeDays: number
}

export interface HabitStrengthRow extends HabitStrength {
  habitId: string
  name: string
  emoji: string
}

export interface HabitStrengthSummary {
  averageScore: number | null
  counts: Record<'strong' | 'stable' | 'attention', number>
  strongest: HabitStrengthRow | null
  attention: HabitStrengthRow[]
  eligibleCount: number
}

const HALF_LIFE_OPPORTUNITIES = 28
const MAX_OPPORTUNITIES = HALF_LIFE_OPPORTUNITIES * 8

function parseDay(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function dayString(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function addDays(value: string, days: number) {
  const date = parseDay(value)
  date.setDate(date.getDate() + days)
  return dayString(date)
}

function daysBetween(start: string, end: string) {
  return Math.round((parseDay(end).getTime() - parseDay(start).getTime()) / 86_400_000)
}

function localCreatedDay(createdAt: string) {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? null : dayString(date)
}

type OpportunityState = 1 | 0 | null

function opportunityState(habit: Habit, logs: HabitLog[]): OpportunityState {
  const done = logs.filter((log) => (log.state ?? 'done') === 'done')
  if (done.length === 0 && logs.some((log) => log.state === 'skipped')) return null
  if ((habit.tracking_type ?? 'boolean') === 'numeric') {
    const total = done.reduce((sum, log) => sum + Number(log.value ?? 0), 0)
    const target = Number(habit.target_value ?? 0)
    return (habit.target_mode ?? 'at_least') === 'at_most' ? (total <= target ? 1 : 0) : (total >= target ? 1 : 0)
  }
  return done.length >= Math.max(1, habit.target_count ?? 1) ? 1 : 0
}

function opportunities(habit: Habit, logs: HabitLog[], today: string) {
  const created = localCreatedDay(habit.created_at) ?? today
  if (created > today) return []
  const periodDays = Math.max(1, Math.floor(habit.period_days ?? 1))
  const total = Math.floor(daysBetween(created, today) / periodDays) + 1
  const first = Math.max(0, total - MAX_OPPORTUNITIES)
  const relevant = logs.filter((log) => log.habit_id === habit.id && log.log_date >= created && log.log_date <= today)
  const result: Array<{ state: OpportunityState; index: number }> = []
  for (let index = first; index < total; index++) {
    const start = addDays(created, index * periodDays)
    const end = [addDays(start, periodDays - 1), today].sort()[0]
    result.push({ state: opportunityState(habit, relevant.filter((log) => log.log_date >= start && log.log_date <= end)), index })
  }
  return result
}

export function calculateHabitStrength(habit: Habit, logs: HabitLog[], today: string): HabitStrength {
  const rows = opportunities(habit, logs, today)
  const scored = rows.filter((row): row is { state: 0 | 1; index: number } => row.state !== null)
  const completed = scored.filter((row) => row.state === 1).length
  const completionRate = scored.length ? Math.round(completed / scored.length * 100) : 0
  const recent = scored.slice(-7)
  const recentRate = recent.length ? Math.round(recent.filter((row) => row.state === 1).length / recent.length * 100) : 0

  let currentStreak = 0
  for (let index = rows.length - 1; index >= 0; index--) {
    if (rows[index].state === null) continue
    if (rows[index].state !== 1) break
    currentStreak++
  }
  if (scored.length < 3) {
    return { score: null, band: 'collecting', completionRate, recentRate, currentStreak, activeDays: rows.length }
  }

  const newestIndex = rows.at(-1)?.index ?? 0
  let weighted = 0
  let weightTotal = 0
  for (const row of scored) {
    const age = newestIndex - row.index
    const weight = Math.pow(0.5, age / HALF_LIFE_OPPORTUNITIES)
    weighted += row.state * weight
    weightTotal += weight
  }
  const score = Math.max(0, Math.min(100, Math.round(weighted / weightTotal * 100)))
  const band: HabitStrengthBand = score >= 80 ? 'strong' : score >= 50 ? 'stable' : 'attention'
  return { score, band, completionRate, recentRate, currentStreak, activeDays: rows.length }
}

export function habitStrengthInsightText(summary: HabitStrengthSummary) {
  if (summary.averageScore === null || summary.eligibleCount === 0) return null
  const strongest = summary.strongest ? `最高为「${summary.strongest.name}」${summary.strongest.score} 分` : ''
  const attention = summary.attention.length ? `；需关注：${summary.attention.map((row) => `「${row.name}」${row.score} 分`).join('、')}` : ''
  return `${summary.eligibleCount} 个习惯已形成评分，平均 ${summary.averageScore} 分，${strongest}${attention}。`
}

export function calculateHabitStrengths(habits: Habit[], logs: HabitLog[], today: string): HabitStrengthRow[] {
  return habits.map((habit) => ({ habitId: habit.id, name: habit.name, emoji: habit.emoji, ...calculateHabitStrength(habit, logs, today) }))
}

export function summarizeHabitStrengths(rows: HabitStrengthRow[]): HabitStrengthSummary {
  const eligible = rows.filter((row) => row.score !== null)
  const sorted = [...eligible].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name) || a.habitId.localeCompare(b.habitId))
  return {
    averageScore: eligible.length ? Math.round(eligible.reduce((sum, row) => sum + (row.score ?? 0), 0) / eligible.length) : null,
    counts: {
      strong: eligible.filter((row) => row.band === 'strong').length,
      stable: eligible.filter((row) => row.band === 'stable').length,
      attention: eligible.filter((row) => row.band === 'attention').length
    },
    strongest: sorted[0] ?? null,
    attention: eligible.filter((row) => row.band === 'attention')
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || a.name.localeCompare(b.name) || a.habitId.localeCompare(b.habitId)).slice(0, 3),
    eligibleCount: eligible.length
  }
}
