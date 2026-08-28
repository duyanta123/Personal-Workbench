-- Hotfix the legacy RPC usage snapshot matcher.
--
-- The phase-one migration is also corrected in-tree so fresh database resets
-- do not fail. This replacement keeps already-applied databases safe: they
-- receive the corrected function without replaying the original migration.

create or replace function private.snapshot_legacy_rpc_usage(p_observed_on date default current_date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_reset timestamptz; v_name text; v_calls bigint;
  v_previous private.legacy_rpc_usage_daily%rowtype;
begin
  select stats_reset into v_reset from extensions.pg_stat_statements_info;
  foreach v_name in array array[
    'apply_workbench_operation','restore_workbench_backup_v2','restore_workbench_backup_v3',
    'complete_pomodoro','create_todo','increment_goal','adjust_goal','move_todo','set_habit_log'
  ] loop
    select coalesce(pg_catalog.sum(calls), 0)::bigint into v_calls
    from extensions.pg_stat_statements
    where query ~* ('(^|[^a-z0-9_])' || v_name || '[[:space:]]*[(]');
    select * into v_previous from private.legacy_rpc_usage_daily
      where rpc_name = v_name and observed_on < p_observed_on order by observed_on desc limit 1;
    insert into private.legacy_rpc_usage_daily(
      observed_on,rpc_name,cumulative_calls,daily_delta,stats_reset,coverage_valid
    ) values (
      p_observed_on,v_name,v_calls,
      case when not found or v_previous.stats_reset is distinct from v_reset then 0
        else greatest(v_calls - v_previous.cumulative_calls, 0) end,
      v_reset,case when not found then true else v_previous.stats_reset is not distinct from v_reset end
    ) on conflict(observed_on,rpc_name) do update set
      cumulative_calls=excluded.cumulative_calls,daily_delta=excluded.daily_delta,
      stats_reset=excluded.stats_reset,coverage_valid=excluded.coverage_valid,captured_at=pg_catalog.now();
  end loop;
end;
$$;

revoke all on function private.snapshot_legacy_rpc_usage(date) from public, anon, authenticated;
select private.snapshot_legacy_rpc_usage();
