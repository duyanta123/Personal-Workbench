export type Priority = 'high' | 'mid' | 'low'
export type TodoStatus = 'open' | 'done' | 'skipped'
export type HabitTrackingType = 'boolean' | 'numeric'
export type HabitTargetMode = 'at_least' | 'at_most'
export type HabitLogState = 'done' | 'skipped'
export type LedgerStatus = 'planned' | 'posted'
export type CurrencyCode = 'CNY' | 'USD' | 'EUR' | 'HKD' | 'GBP'

export interface VersionedRow {
  /** 旧备份/迁移前缓存可能暂时缺失，命令层按 1 处理。 */
  row_version?: number
}

export interface Todo extends VersionedRow {
  id: string
  user_id: string
  text: string
  level: Priority
  done: boolean
  status?: TodoStatus
  sort_order: number
  due_date: string | null
  pinned: boolean
  recurrence_rule_id?: string | null
  occurrence_date?: string | null
  recurrence_detached?: boolean
  created_at: string
  updated_at: string
}

export interface Habit extends VersionedRow {
  id: string
  user_id: string
  name: string
  emoji: string
  pinned: boolean
  tracking_type?: HabitTrackingType
  period_days?: number
  target_count?: number
  target_value?: number | null
  target_mode?: HabitTargetMode
  reminder_time?: string | null
  created_at: string
}

export interface HabitLog extends VersionedRow {
  id: string
  habit_id: string
  user_id: string
  log_date: string
  state?: HabitLogState
  value?: number | null
  created_at: string
}

export interface LedgerEntry extends VersionedRow {
  id: string
  user_id: string
  kind: 'income' | 'expense'
  category: string
  amount: number
  amount_minor?: number
  currency_code?: CurrencyCode
  status?: LedgerStatus
  account_id?: string | null
  payee_id?: string | null
  recurrence_rule_id?: string | null
  occurrence_date?: string | null
  reconciled_at?: string | null
  note: string | null
  entry_date: string
  created_at: string
}

export interface Goal extends VersionedRow {
  id: string
  user_id: string
  name: string
  emoji: string
  current: number
  target: number
  unit: string | null
  note: string | null
  pinned: boolean
  created_at: string
  updated_at: string
}

export type NoteLayout = 'default' | 'feature' | 'quote'

export interface Note extends VersionedRow {
  id: string
  user_id: string
  title: string | null
  body: string
  tags: string[]
  pinned: boolean
  layout: NoteLayout
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface PomodoroSession {
  id: string
  user_id: string
  date: string
  count: number
  minutes: number
  created_at: string
}

/** 番茄钟偏好（分钟） */
export interface PomodoroPrefs {
  focus: number
  break: number
  long_break: number
  /** 连续专注多少轮后进入长休息 */
  rounds_per_cycle: number
}

export interface UserPreferences {
  user_id: string
  row_version: number
  categories: { expense: string[]; income: string[] }
  monthly_budget: number | null
  monthly_budget_minor?: number | null
  currency_code?: CurrencyCode
  pomodoro: PomodoroPrefs
  timezone?: string
  todo_digest_time?: string
  push_preview_mode?: 'summary' | 'content'
  updated_at: string
}

export interface UserAvatar {
  id: string
  user_id?: string
  storage_path: string
  is_active: boolean
  created_at: string
}

export type PracticeStatus = 'todo' | 'doing' | 'ac_solo' | 'ac_hint' | 'failed'
export type PracticeDifficulty = 'easy' | 'medium' | 'hard'

export interface PracticeProblem extends VersionedRow {
  id: string
  user_id: string
  title: string
  platform: string
  difficulty: PracticeDifficulty
  status: PracticeStatus
  tags: string[]
  url: string | null
  note: string | null
  solved_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkoutSession extends VersionedRow {
  id: string
  user_id: string
  date: string
  body_part: string
  duration_min: number | null
  note: string | null
  created_at: string
}

export interface WorkoutExercise extends VersionedRow {
  id: string
  user_id?: string
  session_id: string
  name: string
  sets: number
  reps: number
  weight: number
  note: string | null
  created_at: string
}

export interface BodyMetric extends VersionedRow {
  id: string
  user_id: string
  date: string
  weight: number | null
  body_fat: number | null
  note: string | null
  created_at: string
}

export type InboxStatus = 'pending' | 'routed' | 'archived'
export type InboxSource = 'quick_capture' | 'share_target' | 'manual'

export interface InboxItem extends VersionedRow {
  id: string
  user_id: string
  raw_text: string
  source: InboxSource
  parsed_candidates: unknown[]
  suggested_kind: string | null
  status: InboxStatus
  routed_kind: string | null
  routed_id: string | null
  created_at: string
  updated_at: string
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type RecurrenceEntityType = 'todo' | 'ledger'
export type RecurrenceGenerationMode = 'manual' | 'automatic'

export interface RecurrenceRule extends VersionedRow {
  id: string
  user_id: string
  entity_type: RecurrenceEntityType
  frequency: RecurrenceFrequency
  interval_count: number
  weekdays: number[]
  month_day: number | null
  start_date: string
  end_date: string | null
  timezone: string
  local_time: string | null
  enabled: boolean
  generation_mode: RecurrenceGenerationMode
  template: Record<string, unknown>
  materialized_through: string | null
  skipped_before_window: number
  created_at: string
  updated_at: string
}

export type LedgerAccountType = 'cash' | 'bank' | 'credit' | 'asset' | 'liability'

export interface LedgerAccount extends VersionedRow {
  id: string
  user_id: string
  name: string
  type: LedgerAccountType
  opening_balance_minor: number
  archived: boolean
  created_at: string
  updated_at: string
}

export interface LedgerPayee extends VersionedRow {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
}

export type LedgerRuleStage = 'pre' | 'default' | 'post'

export interface LedgerRule extends VersionedRow {
  id: string
  user_id: string
  name: string
  stage: LedgerRuleStage
  sort_order: number
  enabled: boolean
  conditions: Record<string, unknown>
  actions: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface LedgerSplit extends VersionedRow {
  id: string
  user_id: string
  ledger_entry_id: string
  category: string
  amount_minor: number
  note: string | null
  created_at: string
}

export interface LedgerReconciliation extends VersionedRow {
  id: string
  user_id: string
  account_id: string
  statement_date: string
  balance_minor: number
  created_at: string
}

export type SearchResultKind = 'todo' | 'habit' | 'ledger' | 'goal' | 'note' | 'practice' | 'workout' | 'inbox'

export interface SearchResultItem {
  kind: SearchResultKind
  id: string
  title: string
  subtitle: string | null
  route: string
  matchField: string
  updatedAt: string
}

export type TodoStatusHistoryAction = 'done' | 'skipped' | 'reopened' | 'postponed'

export interface TodoStatusHistory {
  id: string
  user_id: string
  todo_id: string
  action: TodoStatusHistoryAction
  from_value: string | null
  to_value: string | null
  created_at: string
}

export interface EntityLink extends VersionedRow {
  id: string
  user_id: string
  source_kind: string
  source_id: string
  target_kind: string
  target_id: string
  created_at: string
}

export type TemplateKind = 'todo' | 'habit' | 'goal' | 'workout'

export interface WorkbenchTemplate extends VersionedRow {
  id: string
  user_id: string
  kind: TemplateKind
  name: string
  payload: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SavedView extends VersionedRow {
  id: string
  user_id: string
  entity_kind: 'todo' | 'ledger'
  name: string
  filters: Record<string, unknown>
  sort: Record<string, unknown>[]
  is_default: boolean
  created_at: string
  updated_at: string
}
