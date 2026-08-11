import type {
  BodyMetric,
  Goal,
  Habit,
  HabitLog,
  LedgerEntry,
  Note,
  PomodoroSession,
  PracticeProblem,
  Todo,
  UserAvatar,
  UserPreferences,
  WorkoutExercise,
  WorkoutSession
} from '../types'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type DbRow<Row> = { [Key in keyof Row]: Row[Key] } & Record<string, unknown>

type Table<Row> = {
  Row: DbRow<Row>
  Insert: Partial<DbRow<Row>>
  Update: Partial<DbRow<Row>>
  Relationships: []
}

type Rpc<Args extends Record<string, unknown> | never = never, Returns = Json> = { Args: Args; Returns: Returns }

export interface Database {
  public: {
    Tables: {
      todos: Table<Todo>
      habits: Table<Habit>
      habit_logs: Table<HabitLog>
      ledger_entries: Table<LedgerEntry>
      goals: Table<Goal>
      notes: Table<Note>
      practice_problems: Table<PracticeProblem>
      workout_sessions: Table<WorkoutSession>
      workout_exercises: Table<WorkoutExercise>
      body_metrics: Table<BodyMetric>
      pomodoro_sessions: Table<PomodoroSession>
      user_preferences: Table<UserPreferences>
      user_avatars: Table<UserAvatar>
    }
    Views: Record<string, never>
    Functions: {
      abort_restore: Rpc<{ p_restore_id: string }, null>
      apply_workbench_operation: Rpc<{ p_operation_id: string; p_restore_epoch: number; p_kind: string; p_payload: Json }>
      begin_restore: Rpc<{ p_expected_revision: number; p_source_version: number; p_manifest: Json }, string>
      delete_avatar: Rpc<{ p_avatar_id: string }, string | null>
      finalize_restore: Rpc<{ p_restore_id: string; p_avatar_paths?: Json }>
      get_dashboard_summary: Rpc<{ p_date: string; p_month: string }>
      get_focus_items: Rpc<{ p_date: string; p_limit: number }>
      get_habit_stats: Rpc<{ p_date: string }>
      get_ledger_summary: Rpc<{ p_month: string }>
      get_note_stats_range: Rpc<{ p_start: string; p_end: string }>
      get_practice_page: Rpc<{ p_page: number; p_page_size: number; p_query: string; p_platform: string | null; p_difficulty: string | null; p_tag: string | null }>
      get_practice_page_cursor: Rpc<{
        p_page_size: number
        p_query: string
        p_platform: string | null
        p_difficulty: string | null
        p_tag: string | null
        p_has_cursor: boolean
        p_after_solved_at: string | null
        p_after_created_at: string | null
        p_after_id: string | null
      }>
      get_practice_stats: Rpc<{ p_date: string; p_month: string }>
      get_today_todos: Rpc<{ p_date: string; p_limit: number }>
      get_user_data_revision: Rpc<never, number>
      get_user_sync_state: Rpc
      get_workbench_insights: Rpc<{ p_date: string; p_month: string }>
      get_workout_stats: Rpc<{ p_date: string; p_month: string }>
      move_todo: Rpc<{ p_todo_id: string; p_anchor_id: string; p_position: string }>
      search_workbench: Rpc<{ p_query: string; p_limit: number }>
      set_active_avatar: Rpc<{ p_avatar_id: string }>
      set_habit_log: Rpc<{ p_habit_id: string; p_log_date: string; p_done: boolean }>
      stage_restore_chunk: Rpc<{ p_restore_id: string; p_table: string; p_chunk_index: number; p_rows: Json }, null>
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
