export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      body_metrics: {
        Row: {
          body_fat: number | null
          created_at: string
          date: string
          id: string
          note: string | null
          row_version: number
          user_id: string
          weight: number | null
        }
        Insert: {
          body_fat?: number | null
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          row_version?: number
          user_id?: string
          weight?: number | null
        }
        Update: {
          body_fat?: number | null
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          row_version?: number
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      entity_links: {
        Row: {
          created_at: string
          id: string
          row_version: number
          source_id: string
          source_kind: string
          target_id: string
          target_kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          row_version?: number
          source_id: string
          source_kind: string
          target_id: string
          target_kind: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          row_version?: number
          source_id?: string
          source_kind?: string
          target_id?: string
          target_kind?: string
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          current: number
          emoji: string
          id: string
          name: string
          note: string | null
          pinned: boolean
          row_version: number
          target: number
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current?: number
          emoji?: string
          id?: string
          name: string
          note?: string | null
          pinned?: boolean
          row_version?: number
          target?: number
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          current?: number
          emoji?: string
          id?: string
          name?: string
          note?: string | null
          pinned?: boolean
          row_version?: number
          target?: number
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      habit_logs: {
        Row: {
          created_at: string
          habit_id: string
          id: string
          log_date: string
          row_version: number
          state: string
          user_id: string
          value: number | null
        }
        Insert: {
          created_at?: string
          habit_id: string
          id?: string
          log_date: string
          row_version?: number
          state?: string
          user_id?: string
          value?: number | null
        }
        Update: {
          created_at?: string
          habit_id?: string
          id?: string
          log_date?: string
          row_version?: number
          state?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          created_at: string
          emoji: string
          id: string
          name: string
          period_days: number
          pinned: boolean
          reminder_time: string | null
          row_version: number
          target_count: number
          target_mode: string
          target_value: number | null
          tracking_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          name: string
          period_days?: number
          pinned?: boolean
          reminder_time?: string | null
          row_version?: number
          target_count?: number
          target_mode?: string
          target_value?: number | null
          tracking_type?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          name?: string
          period_days?: number
          pinned?: boolean
          reminder_time?: string | null
          row_version?: number
          target_count?: number
          target_mode?: string
          target_value?: number | null
          tracking_type?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_items: {
        Row: {
          created_at: string
          id: string
          parsed_candidates: Json
          raw_text: string
          routed_id: string | null
          routed_kind: string | null
          row_version: number
          source: string
          status: string
          suggested_kind: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parsed_candidates?: Json
          raw_text: string
          routed_id?: string | null
          routed_kind?: string | null
          row_version?: number
          source?: string
          status?: string
          suggested_kind?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          parsed_candidates?: Json
          raw_text?: string
          routed_id?: string | null
          routed_kind?: string | null
          row_version?: number
          source?: string
          status?: string
          suggested_kind?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ledger_accounts: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          name: string
          opening_balance_minor: number
          row_version: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          name: string
          opening_balance_minor?: number
          row_version?: number
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          name?: string
          opening_balance_minor?: number
          row_version?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_id: string | null
          amount: number
          amount_minor: number
          category: string
          created_at: string
          currency_code: string
          entry_date: string
          id: string
          kind: string
          note: string | null
          occurrence_date: string | null
          payee_id: string | null
          reconciled_at: string | null
          recurrence_rule_id: string | null
          row_version: number
          status: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          amount_minor: number
          category: string
          created_at?: string
          currency_code?: string
          entry_date?: string
          id?: string
          kind: string
          note?: string | null
          occurrence_date?: string | null
          payee_id?: string | null
          reconciled_at?: string | null
          recurrence_rule_id?: string | null
          row_version?: number
          status?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          amount_minor?: number
          category?: string
          created_at?: string
          currency_code?: string
          entry_date?: string
          id?: string
          kind?: string
          note?: string | null
          occurrence_date?: string | null
          payee_id?: string | null
          reconciled_at?: string | null
          recurrence_rule_id?: string | null
          row_version?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "ledger_payees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_recurrence_rule_id_fkey"
            columns: ["recurrence_rule_id"]
            isOneToOne: false
            referencedRelation: "recurrence_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_payees: {
        Row: {
          created_at: string
          id: string
          name: string
          row_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          row_version?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          row_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ledger_reconciliations: {
        Row: {
          account_id: string
          balance_minor: number
          created_at: string
          id: string
          row_version: number
          statement_date: string
          user_id: string
        }
        Insert: {
          account_id: string
          balance_minor: number
          created_at?: string
          id?: string
          row_version?: number
          statement_date: string
          user_id?: string
        }
        Update: {
          account_id?: string
          balance_minor?: number
          created_at?: string
          id?: string
          row_version?: number
          statement_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_reconciliations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_rules: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          enabled: boolean
          id: string
          name: string
          row_version: number
          sort_order: number
          stage: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          row_version?: number
          sort_order?: number
          stage?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          row_version?: number
          sort_order?: number
          stage?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ledger_splits: {
        Row: {
          amount_minor: number
          category: string
          created_at: string
          id: string
          ledger_entry_id: string
          note: string | null
          row_version: number
          user_id: string
        }
        Insert: {
          amount_minor: number
          category: string
          created_at?: string
          id?: string
          ledger_entry_id: string
          note?: string | null
          row_version?: number
          user_id?: string
        }
        Update: {
          amount_minor?: number
          category?: string
          created_at?: string
          id?: string
          ledger_entry_id?: string
          note?: string | null
          row_version?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_splits_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          created_at: string
          id: string
          image_url: string | null
          layout: string
          pinned: boolean
          row_version: number
          tags: string[]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          image_url?: string | null
          layout?: string
          pinned?: boolean
          row_version?: number
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          image_url?: string | null
          layout?: string
          pinned?: boolean
          row_version?: number
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pomodoro_sessions: {
        Row: {
          count: number
          created_at: string
          date: string
          id: string
          minutes: number
          row_version: number
          user_id: string
        }
        Insert: {
          count?: number
          created_at?: string
          date: string
          id?: string
          minutes?: number
          row_version?: number
          user_id?: string
        }
        Update: {
          count?: number
          created_at?: string
          date?: string
          id?: string
          minutes?: number
          row_version?: number
          user_id?: string
        }
        Relationships: []
      }
      practice_problems: {
        Row: {
          created_at: string
          difficulty: string
          id: string
          note: string | null
          platform: string
          row_version: number
          solved_at: string | null
          status: string
          tags: string[]
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: string
          id?: string
          note?: string | null
          platform?: string
          row_version?: number
          solved_at?: string | null
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          difficulty?: string
          id?: string
          note?: string | null
          platform?: string
          row_version?: number
          solved_at?: string | null
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recurrence_rules: {
        Row: {
          created_at: string
          enabled: boolean
          end_date: string | null
          entity_type: string
          frequency: string
          generation_mode: string
          id: string
          interval_count: number
          local_time: string | null
          materialized_through: string | null
          month_day: number | null
          row_version: number
          skipped_before_window: number
          start_date: string
          template: Json
          timezone: string
          updated_at: string
          user_id: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          end_date?: string | null
          entity_type: string
          frequency: string
          generation_mode?: string
          id?: string
          interval_count?: number
          local_time?: string | null
          materialized_through?: string | null
          month_day?: number | null
          row_version?: number
          skipped_before_window?: number
          start_date: string
          template?: Json
          timezone?: string
          updated_at?: string
          user_id?: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          enabled?: boolean
          end_date?: string | null
          entity_type?: string
          frequency?: string
          generation_mode?: string
          id?: string
          interval_count?: number
          local_time?: string | null
          materialized_through?: string | null
          month_day?: number | null
          row_version?: number
          skipped_before_window?: number
          start_date?: string
          template?: Json
          timezone?: string
          updated_at?: string
          user_id?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          created_at: string
          entity_kind: string
          filters: Json
          id: string
          is_default: boolean
          name: string
          row_version: number
          sort: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_kind: string
          filters?: Json
          id?: string
          is_default?: boolean
          name: string
          row_version?: number
          sort?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          entity_kind?: string
          filters?: Json
          id?: string
          is_default?: boolean
          name?: string
          row_version?: number
          sort?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      todo_status_history: {
        Row: {
          action: string
          created_at: string
          from_value: string | null
          id: string
          row_version: number
          to_value: string | null
          todo_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          from_value?: string | null
          id?: string
          row_version?: number
          to_value?: string | null
          todo_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          from_value?: string | null
          id?: string
          row_version?: number
          to_value?: string | null
          todo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_status_history_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          created_at: string
          done: boolean
          due_date: string | null
          id: string
          level: string
          occurrence_date: string | null
          pinned: boolean
          recurrence_detached: boolean
          recurrence_rule_id: string | null
          row_version: number
          sort_order: number
          status: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          level?: string
          occurrence_date?: string | null
          pinned?: boolean
          recurrence_detached?: boolean
          recurrence_rule_id?: string | null
          row_version?: number
          sort_order?: number
          status?: string
          text: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          level?: string
          occurrence_date?: string | null
          pinned?: boolean
          recurrence_detached?: boolean
          recurrence_rule_id?: string | null
          row_version?: number
          sort_order?: number
          status?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_recurrence_rule_fk"
            columns: ["recurrence_rule_id"]
            isOneToOne: false
            referencedRelation: "recurrence_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      user_avatars: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          row_version: number
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          row_version?: number
          storage_path: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          row_version?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      user_data_revisions: {
        Row: {
          restore_epoch: number
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          restore_epoch?: number
          revision?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          restore_epoch?: number
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          categories: Json
          currency_code: string
          monthly_budget: number | null
          monthly_budget_minor: number | null
          pomodoro: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          categories?: Json
          currency_code?: string
          monthly_budget?: number | null
          monthly_budget_minor?: number | null
          pomodoro?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          categories?: Json
          currency_code?: string
          monthly_budget?: number | null
          monthly_budget_minor?: number | null
          pomodoro?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workbench_templates: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          payload: Json
          row_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          payload?: Json
          row_version?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          payload?: Json
          row_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_exercises: {
        Row: {
          created_at: string
          id: string
          name: string
          note: string | null
          reps: number
          row_version: number
          session_id: string
          sets: number
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          note?: string | null
          reps?: number
          row_version?: number
          session_id: string
          sets?: number
          user_id?: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          reps?: number
          row_version?: number
          session_id?: string
          sets?: number
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          body_part: string
          created_at: string
          date: string
          duration_min: number | null
          id: string
          note: string | null
          row_version: number
          user_id: string
        }
        Insert: {
          body_part?: string
          created_at?: string
          date?: string
          duration_min?: number | null
          id?: string
          note?: string | null
          row_version?: number
          user_id?: string
        }
        Update: {
          body_part?: string
          created_at?: string
          date?: string
          duration_min?: number | null
          id?: string
          note?: string | null
          row_version?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abort_restore: { Args: { p_restore_id: string }; Returns: undefined }
      adjust_goal: {
        Args: { p_delta: number; p_goal_id: string }
        Returns: {
          created_at: string
          current: number
          emoji: string
          id: string
          name: string
          note: string | null
          pinned: boolean
          row_version: number
          target: number
          unit: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_workbench_command_v2: {
        Args: {
          p_base_version?: number
          p_command_id: string
          p_depends_on?: string[]
          p_entity_id: string
          p_expected?: Json
          p_kind: string
          p_payload?: Json
          p_restore_epoch: number
        }
        Returns: Json
      }
      apply_workbench_operation: {
        Args: {
          p_kind: string
          p_operation_id: string
          p_payload: Json
          p_restore_epoch: number
        }
        Returns: Json
      }
      begin_restore: {
        Args: {
          p_expected_revision: number
          p_manifest: Json
          p_source_version: number
        }
        Returns: string
      }
      command_conflicting_fields: {
        Args: { p_current: Json; p_expected: Json; p_payload: Json }
        Returns: string[]
      }
      command_result: {
        Args: {
          p_command_id: string
          p_conflicting_fields?: string[]
          p_current?: Json
          p_data?: Json
          p_entity_id: string
          p_message?: string
          p_status: string
        }
        Returns: Json
      }
      complete_pomodoro: {
        Args: { p_date: string; p_minutes: number }
        Returns: {
          count: number
          created_at: string
          date: string
          id: string
          minutes: number
          row_version: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pomodoro_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_ledger_transaction: {
        Args: {
          p_command_id: string
          p_entry: Json
          p_entry_id: string
          p_restore_epoch: number
          p_splits?: Json
        }
        Returns: Json
      }
      create_todo: {
        Args: {
          p_done?: boolean
          p_due_date?: string
          p_level?: string
          p_pinned?: boolean
          p_text: string
        }
        Returns: {
          created_at: string
          done: boolean
          due_date: string | null
          id: string
          level: string
          occurrence_date: string | null
          pinned: boolean
          recurrence_detached: boolean
          recurrence_rule_id: string | null
          row_version: number
          sort_order: number
          status: string
          text: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "todos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_avatar: { Args: { p_avatar_id: string }; Returns: string }
      entity_owned: {
        Args: { p_id: string; p_table: string; p_user: string }
        Returns: {
          ok: boolean
        }[]
      }
      export_workbench_backup_v3: { Args: never; Returns: Json }
      finalize_restore: {
        Args: { p_avatar_paths?: Json; p_restore_id: string }
        Returns: Json
      }
      get_dashboard_summary: {
        Args: { p_date: string; p_month: string }
        Returns: Json
      }
      get_dashboard_summary_v2: {
        Args: { p_date: string; p_month: string }
        Returns: Json
      }
      get_focus_items: {
        Args: { p_date: string; p_limit?: number }
        Returns: Json
      }
      get_habit_stats: { Args: { p_date: string }; Returns: Json }
      get_ledger_summary: { Args: { p_month: string }; Returns: Json }
      get_note_stats: { Args: { p_date: string }; Returns: Json }
      get_note_stats_range: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_practice_page: {
        Args: {
          p_difficulty?: string
          p_page?: number
          p_page_size?: number
          p_platform?: string
          p_query?: string
          p_tag?: string
        }
        Returns: Json
      }
      get_practice_page_cursor: {
        Args: {
          p_after_created_at?: string
          p_after_id?: string
          p_after_solved_at?: string
          p_difficulty?: string
          p_has_cursor?: boolean
          p_page_size?: number
          p_platform?: string
          p_query?: string
          p_tag?: string
        }
        Returns: Json
      }
      get_practice_stats: {
        Args: { p_date: string; p_month: string }
        Returns: Json
      }
      get_today_todos: {
        Args: { p_date: string; p_limit?: number }
        Returns: {
          created_at: string
          done: boolean
          due_date: string | null
          id: string
          level: string
          occurrence_date: string | null
          pinned: boolean
          recurrence_detached: boolean
          recurrence_rule_id: string | null
          row_version: number
          sort_order: number
          status: string
          text: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "todos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_today_workspace: {
        Args: { p_date: string; p_timezone?: string }
        Returns: Json
      }
      get_user_data_revision: { Args: never; Returns: number }
      get_user_sync_state: { Args: never; Returns: Json }
      get_workbench_insights: {
        Args: { p_date: string; p_month: string }
        Returns: Json
      }
      get_workbench_insights_v2: {
        Args: { p_date: string; p_month: string }
        Returns: Json
      }
      get_workout_stats: {
        Args: { p_date: string; p_month: string }
        Returns: Json
      }
      increment_goal: { Args: { goal_id: string }; Returns: undefined }
      is_bounded_text_array: {
        Args: { p_max_chars: number; p_max_items: number; p_value: string[] }
        Returns: boolean
      }
      is_jsonb_string_array: { Args: { p_value: Json }; Returns: boolean }
      is_safe_external_url: { Args: { p_value: string }; Returns: boolean }
      is_valid_pomodoro_pref: { Args: { p_value: Json }; Returns: boolean }
      jsonb_keys_allowed: {
        Args: { p_allowed: string[]; p_value: Json }
        Returns: boolean
      }
      lock_user_data_revision: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      materialize_recurrences: {
        Args: { p_timezone?: string; p_today: string }
        Returns: Json
      }
      move_todo: {
        Args: { p_anchor_id: string; p_position: string; p_todo_id: string }
        Returns: {
          created_at: string
          done: boolean
          due_date: string | null
          id: string
          level: string
          occurrence_date: string | null
          pinned: boolean
          recurrence_detached: boolean
          recurrence_rule_id: string | null
          row_version: number
          sort_order: number
          status: string
          text: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "todos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_todo_v2: {
        Args: {
          p_anchor_id: string
          p_base_version: number
          p_command_id: string
          p_position: string
          p_restore_epoch: number
          p_todo_id: string
        }
        Returns: Json
      }
      reconcile_ledger_account: {
        Args: {
          p_account_id: string
          p_balance_minor: number
          p_command_id: string
          p_entry_ids: string[]
          p_reconciliation_id: string
          p_restore_epoch: number
          p_statement_date: string
        }
        Returns: Json
      }
      recurrence_occurrence_matches: {
        Args: {
          p_date: string
          p_frequency: string
          p_interval_count: number
          p_month_day: number
          p_start_date: string
          p_weekdays: number[]
        }
        Returns: boolean
      }
      restore_workbench_backup_v2: {
        Args: { p_avatar_paths?: Json; p_payload: Json }
        Returns: Json
      }
      restore_workbench_backup_v3: {
        Args: {
          p_avatar_paths?: Json
          p_expected_revision?: number
          p_payload: Json
        }
        Returns: Json
      }
      restore_workbench_backup_v7: {
        Args: {
          p_avatar_paths?: Json
          p_expected_revision?: number
          p_payload: Json
        }
        Returns: Json
      }
      route_inbox_item: {
        Args: {
          p_command_id: string
          p_item_id: string
          p_kind: string
          p_payload: Json
          p_target_id?: string
        }
        Returns: Json
      }
      search_workbench: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      search_workbench_v2: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      set_active_avatar: { Args: { p_avatar_id: string }; Returns: undefined }
      set_habit_log: {
        Args: { p_done: boolean; p_habit_id: string; p_log_date: string }
        Returns: boolean
      }
      stage_restore_chunk: {
        Args: {
          p_chunk_index: number
          p_restore_id: string
          p_rows: Json
          p_table: string
        }
        Returns: undefined
      }
      suggest_ledger_recurrences: { Args: { p_today: string }; Returns: Json }
      switch_ledger_currency: {
        Args: {
          p_command_id: string
          p_currency: string
          p_restore_epoch: number
        }
        Returns: Json
      }
      upsert_avatar: { Args: { p_path: string }; Returns: Json }
      workbench_month_start: { Args: { p_month: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
