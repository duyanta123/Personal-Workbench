import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Habit, HabitLog, Todo } from '../types'
import { useAuth } from './useAuth'
import { rpcArray, rpcRecord } from '../lib/rpcSchemas'

export interface WorkoutStatsSummary {
  total: number
  month_sessions: number
  month_minutes: number
  week_sessions: number
  week_volume: number
  body_parts: [string, number][]
  month_body_parts: [string, number][]
}

export interface DashboardOverview {
  todo_total: number
  todo_done: number
  habit_total: number
  habit_done: number
  goal_total: number
  goal_percent: number
  week_workouts: number
  ledger_total: number
  note_total: number
  problem_total: number
  workout_total: number
  total_records: number
  pinned_total: number
  month_income: number
  month_expense: number
}

export interface DashboardSummary {
  today_todos: Todo[]
  habits: Habit[]
  habit_logs: HabitLog[]
  weekly_habits: { date: string; value: number }[]
  overview: DashboardOverview
  expense_categories: [string, number][]
  fitness: WorkoutStatsSummary
}

export interface WorkbenchInsights {
  todos: { total: number; done: number }
  habits: { total: number; done_today: number; top_streaks: { name: string; streak: number }[] }
  ledger: { income: number; expense: number }
  goals: { total: number; done: number; percent: number }
  practice: { total: number; ac_count: number; today_solved: number }
  workout: WorkoutStatsSummary
  notes: { total: number; tag_count: number }
}

export function useDashboardSummary(date: string, month: string) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: ['dashboard_summary', userId, date, month] as const,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_dashboard_summary', { p_date: date, p_month: month })
      if (error) throw error
      const value = rpcRecord(data, 'dashboard summary')
      rpcArray(value.today_todos, 'dashboard summary.today_todos')
      rpcArray(value.habits, 'dashboard summary.habits')
      rpcArray(value.habit_logs, 'dashboard summary.habit_logs')
      rpcArray(value.weekly_habits, 'dashboard summary.weekly_habits')
      rpcRecord(value.overview, 'dashboard summary.overview')
      return value as unknown as DashboardSummary
    },
    enabled: !!supabase && !!userId
  })
}

export function useWorkbenchInsights(date: string, month: string) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: ['workbench_insights', userId, date, month] as const,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_workbench_insights', { p_date: date, p_month: month })
      if (error) throw error
      const value = rpcRecord(data, 'workbench insights')
      rpcRecord(value.todos, 'workbench insights.todos')
      rpcRecord(value.habits, 'workbench insights.habits')
      rpcRecord(value.ledger, 'workbench insights.ledger')
      rpcRecord(value.goals, 'workbench insights.goals')
      return value as unknown as WorkbenchInsights
    },
    enabled: !!supabase && !!userId
  })
}
