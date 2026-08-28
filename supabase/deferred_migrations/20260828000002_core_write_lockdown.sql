-- Deploy after the V2 command client (including pomodoro/avatar and preferences
-- migration) has completed one release cycle. All client writes now go through security-definer
-- RPCs (apply_workbench_command_v2 / move_todo_v2 / route_inbox_item /
-- materialize_recurrences / restore_workbench_backup_v7), so direct table
-- writes are revoked in full: row_version bumping and field-level conflict
-- detection can no longer be bypassed.

-- 核心 8 表：INSERT 已由 20260811000002 撤销，这里补齐 UPDATE/DELETE。
-- Preferences are deliberately not a direct-write exception: preference.update
-- is part of the V2 command protocol and must be locked with the core tables.
revoke insert, update, delete on table public.user_preferences from authenticated;

revoke update, delete on table
  public.todos,
  public.habits,
  public.ledger_entries,
  public.goals,
  public.notes,
  public.practice_problems,
  public.workout_sessions,
  public.workout_exercises
from authenticated;

-- V7 新表：写入路径已全部走 V2 命令或 RPC，撤销全部直接写权限（保留 select）。
revoke insert, update, delete on table
  public.inbox_items,
  public.recurrence_rules,
  public.ledger_accounts,
  public.ledger_payees,
  public.ledger_rules,
  public.ledger_splits,
  public.ledger_reconciliations,
  public.workbench_templates,
  public.saved_views,
  public.entity_links
from authenticated;

-- body_metrics：前端写路径（useUpsertBodyMetric/useDeleteBodyMetric）已走 V2 命令，
-- 但此前不在任何 revoke 清单中（INSERT/UPDATE/DELETE 均保留），是唯一遗漏的收口表。
revoke insert, update, delete on table public.body_metrics
from authenticated;
