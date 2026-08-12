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

function localCreatedDay(createdAt: string) {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? null : dayString(date)
}

function inclusiveDays(start: string, end: string) {
  return Math.max(0, Math.round((parseDay(end).getTime() - parseDay(start).getTime()) / 86_400_000) + 1)
}

export function calculateHabitStrength(habit: Habit, logs: HabitLog[], today: string): HabitStrength {
  const windowStart = addDays(today, -29)
  const createdDay = localCreatedDay(habit.created_at) ?? today
  const activeStart = createdDay > windowStart ? createdDay : windowStart
  const activeDays = activeStart > today ? 0 : inclusiveDays(activeStart, today)
  const dates = new Set(
    logs
      .filter((log) => log.habit_id === habit.id && log.log_date >= activeStart && log.log_date <= today)
      .map((log) => log.log_date)
  )
  const completionRatio = activeDays ? dates.size / activeDays : 0
  const completionRate = Math.round(completionRatio * 100)

  const recentStart = [addDays(today, -6), activeStart].sort().at(-1)!
  const recentDays = activeDays ? inclusiveDays(recentStart, today) : 0
  let recentDone = 0
  for (let day = recentStart; recentDays > 0 && day <= today; day = addDays(day, 1)) {
    if (dates.has(day)) recentDone++
  }
  const recentRatio = recentDays ? recentDone / recentDays : 0
  const recentRate = Math.round(recentRatio * 100)

  let cursor = dates.has(today) ? today : addDays(today, -1)
  let currentStreak = 0
  while (cursor >= activeStart && dates.has(cursor)) {
    currentStreak++
    cursor = addDays(cursor, -1)
  }

  if (activeDays < 3) {
    return { score: null, band: 'collecting', completionRate, recentRate, currentStreak, activeDays }
  }
  const score = Math.max(0, Math.min(100, Math.round(
    completionRatio * 60 + Math.min(currentStreak, 7) / 7 * 25 + recentRatio * 15
  )))
  const band: HabitStrengthBand = score >= 80 ? 'strong' : score >= 50 ? 'stable' : 'attention'
  return { score, band, completionRate, recentRate, currentStreak, activeDays }
}

export function habitStrengthInsightText(summary: HabitStrengthSummary) {
  if (summary.averageScore === null || summary.eligibleCount === 0) return null
  const strongest = summary.strongest ? `最高为「${summary.strongest.name}」${summary.strongest.score} 分` : ''
  const attention = summary.attention.length ? `；需关注：${summary.attention.map((row) => `「${row.name}」${row.score} 分`).join('、')}` : ''
  return `${summary.eligibleCount} 个习惯已形成评分，平均 ${summary.averageScore} 分，${strongest}${attention}。`
}

export function calculateHabitStrengths(habits: Habit[], logs: HabitLog[], today: string): HabitStrengthRow[] {
  return habits.map((habit) => ({
    habitId: habit.id,
    name: habit.name,
    emoji: habit.emoji,
    ...calculateHabitStrength(habit, logs, today)
  }))
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
    attention: eligible
      .filter((row) => row.band === 'attention')
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || a.name.localeCompare(b.name) || a.habitId.localeCompare(b.habitId))
      .slice(0, 3),
    eligibleCount: eligible.length
  }
}
