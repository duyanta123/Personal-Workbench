/**
 * 手写领域类型视图：以 src/types.ts 的业务模型为基础组装 Supabase Database 结构。
 * 权威 schema 见 supabase/generated/database.types.ts（由 `supabase gen types typescript
 * --local --schema public` 生成；CI 中的 "Fail on database type drift" 步骤要求基线已提交，
 * 并在生成结果与迁移不一致时直接失败）。
 * 修改数据库迁移后请重新生成该文件，并同步维护此处的手写映射。
 */
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
  TodoStatusHistory,
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
      inbox_items: Table<import('../types').InboxItem>
      recurrence_rules: Table<import('../types').RecurrenceRule>
      ledger_accounts: Table<import('../types').LedgerAccount>
      ledger_payees: Table<import('../types').LedgerPayee>
      ledger_rules: Table<import('../types').LedgerRule>
      ledger_splits: Table<import('../types').LedgerSplit>
      ledger_reconciliations: Table<import('../types').LedgerReconciliation>
      entity_links: Table<import('../types').EntityLink>
      workbench_templates: Table<import('../types').WorkbenchTemplate>
      saved_views: Table<import('../types').SavedView>
      todo_status_history: Table<TodoStatusHistory>
    }
    Views: Record<string, never>
    Functions: {
      abort_restore: Rpc<{ p_restore_id: string }, null>
      apply_workbench_operation: Rpc<{ p_operation_id: string; p_restore_epoch: number; p_kind: string; p_payload: Json }>
      begin_restore: Rpc<{ p_expected_revision: number; p_source_version: number; p_manifest: Json }, string>
      delete_avatar: Rpc<{ p_avatar_id: string }, string | null>
      finalize_restore: Rpc<{ p_restore_id: string; p_avatar_paths?: Json }>
      get_dashboard_summary: Rpc<{ p_date: string; p_month: string }>
      get_dashboard_summary_v2: Rpc<{ p_date: string; p_month: string }>
      get_backup_health: Rpc
      get_legacy_rpc_retirement_evidence: Rpc<{ p_as_of?: string }>
      get_focus_items: Rpc<{ p_date: string; p_limit: number }>
      get_habit_stats: Rpc<{ p_date: string }>
      get_ledger_summary: Rpc<{ p_month: string }>
      get_workbench_insights_v2: Rpc<{ p_date: string; p_month: string }>
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
      apply_workbench_command_v2: Rpc<{
        p_command_id: string; p_entity_id: string; p_restore_epoch: number; p_kind: string; p_payload: Json;
        p_expected: Json; p_base_version: number | null; p_depends_on: string[]
      }>
      get_today_workspace: Rpc<{ p_date: string; p_timezone?: string }>
      materialize_recurrences: Rpc<{ p_today: string; p_timezone?: string }>
      move_todo_v2: Rpc<{ p_command_id: string; p_restore_epoch: number; p_todo_id: string; p_base_version: number; p_anchor_id: string; p_position: string }>
      route_inbox_item: Rpc<{ p_command_id: string; p_item_id: string; p_kind: string; p_payload: Json; p_target_id: string }>
      search_workbench_v2: Rpc<{ p_query: string; p_limit?: number }>
      create_ledger_transaction: Rpc<{ p_command_id: string; p_restore_epoch: number; p_entry_id: string; p_entry: Json; p_splits?: Json }>
      reconcile_ledger_account: Rpc<{ p_command_id: string; p_restore_epoch: number; p_reconciliation_id: string; p_account_id: string; p_statement_date: string; p_balance_minor: number; p_entry_ids: string[] }>
      switch_ledger_currency: Rpc<{ p_command_id: string; p_restore_epoch: number; p_currency: string }>
      set_ledger_base_currency_v2: Rpc<{ p_command_id: string; p_restore_epoch: number; p_currency: string }>
      apply_workbench_preference_v2: Rpc<{ p_command_id: string; p_entity_id: string; p_restore_epoch: number; p_payload: Json; p_expected: Json; p_base_version: number }>
      upsert_push_subscription: Rpc<{ p_endpoint: string; p_p256dh: string; p_auth_key: string; p_user_agent?: string | null }, string>
      remove_push_subscription: Rpc<{ p_endpoint: string }, null>
      claim_notification: Rpc<{ p_receipt_key: string; p_user_id: string }, boolean>
      finish_notification: Rpc<{ p_error_code?: string | null; p_receipt_key: string; p_status: string; p_user_id: string }, null>
      report_reminder_run: Rpc<{ p_error_code?: string | null; p_run_id: string; p_sent_count?: number; p_status: string }, null>
      suggest_ledger_recurrences: Rpc<{ p_today: string }>
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
