-- Keep the append-only V7 restore protocol in sync with the post-V7 table set.
-- todo_status_history was added after the original helper was created; omitting it
-- from this allow-list silently dropped history during staged and V8 restores.
create or replace function private.workbench_backup_tables_v7()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'todos','habits','habit_logs','ledger_entries','goals','notes','practice_problems',
    'workout_sessions','workout_exercises','body_metrics','pomodoro_sessions','user_preferences',
    'inbox_items','recurrence_rules','ledger_accounts','ledger_payees','ledger_rules',
    'ledger_splits','ledger_reconciliations','entity_links','workbench_templates','saved_views',
    'todo_status_history'
  ]::text[];
$$;

revoke all on function private.workbench_backup_tables_v7() from public, anon, authenticated;
