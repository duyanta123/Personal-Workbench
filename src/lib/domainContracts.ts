import { z } from 'zod'
import type { EntityCommandKind } from './domainCommands'

export const domainQueryKeySchema = z.array(z.unknown()).min(1)
export const conflictFieldSchema = z.array(z.string().min(1)).max(64)

export interface DomainContract {
  table: string
  queryPrefixes: readonly string[]
  conflictFields: readonly string[]
  invalidatePrefixes: readonly string[]
}

/** Stable domain boundaries. URL routes, IndexedDB keys, and V2 wire kinds are unchanged. */
export const DOMAIN_CONTRACTS: Record<EntityCommandKind, DomainContract> = {
  todo: { table: 'todos', queryPrefixes: ['todos', 'today_todos', 'dashboard_summary', 'focus_items', 'today_workspace'], conflictFields: ['text', 'done', 'status', 'due_date', 'sort_order', 'pinned'], invalidatePrefixes: ['todos', 'today_workspace'] },
  habit: { table: 'habits', queryPrefixes: ['habits', 'dashboard_summary', 'focus_items', 'today_workspace'], conflictFields: ['name', 'tracking_type', 'target_count', 'reminder_time'], invalidatePrefixes: ['habits', 'today_workspace'] },
  habit_log: { table: 'habit_logs', queryPrefixes: ['habit_logs', 'dashboard_summary', 'today_workspace'], conflictFields: ['state', 'value'], invalidatePrefixes: ['habit_logs', 'dashboard_summary'] },
  ledger: { table: 'ledger_entries', queryPrefixes: ['ledger_entries', 'dashboard_summary', 'today_workspace'], conflictFields: ['kind', 'category', 'amount_minor', 'currency_code', 'entry_date', 'status'], invalidatePrefixes: ['ledger_entries', 'dashboard_summary'] },
  goal: { table: 'goals', queryPrefixes: ['goals', 'dashboard_summary', 'focus_items'], conflictFields: ['name', 'current', 'target', 'deadline', 'status'], invalidatePrefixes: ['goals', 'dashboard_summary'] },
  note: { table: 'notes', queryPrefixes: ['notes', 'dashboard_summary'], conflictFields: ['title', 'body', 'tags', 'pinned'], invalidatePrefixes: ['notes', 'dashboard_summary'] },
  practice: { table: 'practice_problems', queryPrefixes: ['problems', 'dashboard_summary'], conflictFields: ['title', 'status', 'difficulty', 'tags'], invalidatePrefixes: ['problems', 'dashboard_summary'] },
  workout_session: { table: 'workout_sessions', queryPrefixes: ['workouts', 'dashboard_summary'], conflictFields: ['date', 'body_part', 'duration_min'], invalidatePrefixes: ['workouts', 'dashboard_summary'] },
  workout_exercise: { table: 'workout_exercises', queryPrefixes: ['workout-exercises'], conflictFields: ['name', 'sets', 'reps', 'weight'], invalidatePrefixes: ['workout-exercises', 'workouts'] },
  body_metric: { table: 'body_metrics', queryPrefixes: ['body-metrics'], conflictFields: ['date', 'weight', 'body_fat'], invalidatePrefixes: ['body-metrics'] },
  inbox: { table: 'inbox_items', queryPrefixes: ['inbox', 'today_workspace'], conflictFields: ['content', 'kind', 'status'], invalidatePrefixes: ['inbox', 'today_workspace'] },
  recurrence: { table: 'recurrence_rules', queryPrefixes: ['recurrence_rules'], conflictFields: ['frequency', 'interval_count', 'template', 'timezone', 'enabled'], invalidatePrefixes: ['recurrence_rules', 'todos', 'ledger_entries'] },
  ledger_account: { table: 'ledger_accounts', queryPrefixes: ['ledger_accounts'], conflictFields: ['name', 'type', 'opening_balance_minor', 'archived'], invalidatePrefixes: ['ledger_accounts', 'ledger_entries'] },
  ledger_payee: { table: 'ledger_payees', queryPrefixes: ['ledger_payees'], conflictFields: ['name'], invalidatePrefixes: ['ledger_payees', 'ledger_entries'] },
  ledger_rule: { table: 'ledger_rules', queryPrefixes: ['ledger_rules'], conflictFields: ['name', 'conditions', 'actions', 'enabled'], invalidatePrefixes: ['ledger_rules'] },
  ledger_split: { table: 'ledger_splits', queryPrefixes: ['ledger_splits'], conflictFields: ['category', 'amount_minor', 'note'], invalidatePrefixes: ['ledger_splits', 'ledger_entries'] },
  ledger_reconciliation: { table: 'ledger_reconciliations', queryPrefixes: ['ledger_reconciliations'], conflictFields: ['statement_date', 'balance_minor', 'entry_ids'], invalidatePrefixes: ['ledger_reconciliations', 'ledger_entries'] },
  entity_link: { table: 'entity_links', queryPrefixes: ['workbench_artifact'], conflictFields: ['source_kind', 'source_id', 'target_kind', 'target_id'], invalidatePrefixes: ['workbench_artifact'] },
  template: { table: 'workbench_templates', queryPrefixes: ['workbench_artifact'], conflictFields: ['name', 'template'], invalidatePrefixes: ['workbench_artifact'] },
  saved_view: { table: 'saved_views', queryPrefixes: ['workbench_artifact'], conflictFields: ['name', 'config'], invalidatePrefixes: ['workbench_artifact'] }
}

export function parseDomainQueryKey(value: unknown) {
  return domainQueryKeySchema.parse(value)
}
