-- Deploy after the operation/outbox client has completed one release cycle.
-- Desired-state updates/deletes remain direct and idempotent; non-idempotent
-- inserts and counters are RPC-only.

revoke insert on table
  public.todos,
  public.habits,
  public.ledger_entries,
  public.goals,
  public.notes,
  public.practice_problems,
  public.workout_sessions,
  public.workout_exercises,
  public.pomodoro_sessions,
  public.user_avatars,
  public.habit_logs
from authenticated;

revoke update, delete on table public.pomodoro_sessions, public.user_avatars, public.habit_logs
from authenticated;
grant select on table public.pomodoro_sessions, public.user_avatars, public.habit_logs
to authenticated;

revoke all on function public.restore_workbench_backup_v2(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.restore_workbench_backup_v3(jsonb, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.complete_pomodoro(date, int) from public, anon, authenticated;
revoke all on function public.create_todo(text, text, date, boolean, boolean) from public, anon, authenticated;
revoke all on function public.increment_goal(uuid) from public, anon, authenticated;
revoke all on function public.adjust_goal(uuid, numeric) from public, anon, authenticated;
