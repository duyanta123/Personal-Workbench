import type { PomodoroPrefs, UserPreferences } from '../types'

export interface PreferencesPatch {
  categories?: UserPreferences['categories']
  monthly_budget?: number | null
  monthly_budget_minor?: number | null
  currency_code?: UserPreferences['currency_code']
  pomodoro?: PomodoroPrefs
}

export function buildPreferencesUpsert(userId: string, patch: PreferencesPatch) {
  return { user_id: userId, ...patch }
}

export interface BodyMetricPatch {
  date: string
  weight?: number | null
  body_fat?: number | null
  note?: string | null
}

export function buildBodyMetricUpsert(input: BodyMetricPatch): Record<string, unknown> {
  const payload: Record<string, unknown> = { date: input.date }
  if (input.weight !== undefined) payload.weight = input.weight
  if (input.body_fat !== undefined) payload.body_fat = input.body_fat
  if (input.note !== undefined) payload.note = input.note
  return payload
}

export function isGoalProgressValid(current: number, target: number) {
  return Number.isFinite(current) && Number.isFinite(target) && target > 0 && current >= 0 && current <= target
}
