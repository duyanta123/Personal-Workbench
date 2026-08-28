-- PostgREST 只写 request.jwt.claims（完整 JSON），不写 request.jwt.claim.role 单值 GUC。
-- 证据函数原先只读单值 GUC，导致真实 service_role JWT 经 API 调用时被误判为
-- 'service role required'（集成测试暴露）。改为优先读 JSON claims，回退单值 GUC
-- 以兼容 pgTAP 测试中手工设置的 claim。

create or replace function public.get_legacy_rpc_retirement_evidence(
  p_as_of date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing bigint := 0;
  v_invalid bigint := 0;
  v_positive bigint := 0;
  v_reset bigint := 0;
  v_zero_days bigint := 0;
  v_required_days constant integer := 30;
  v_rpc_count constant integer := 9;
  v_claims jsonb := '{}'::jsonb;
  v_role text;
begin
  begin
    v_claims := coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_claims := '{}'::jsonb;
  end;
  v_role := coalesce(
    nullif(v_claims->>'role', ''),
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '')
  );
  if v_role <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_as_of is null then raise exception 'as_of date required'; end if;

  with names(rpc_name) as (
    select * from pg_catalog.unnest(array[
      'apply_workbench_operation','restore_workbench_backup_v2',
      'restore_workbench_backup_v3','complete_pomodoro','create_todo',
      'increment_goal','adjust_goal','move_todo','set_habit_log'
    ]::text[])
  ), days(observed_on) as (
    select (p_as_of - i)::date from pg_catalog.generate_series(0, v_required_days - 1) i
  ), grid as (
    select d.observed_on, n.rpc_name, u.cumulative_calls, u.daily_delta,
      u.coverage_valid, u.stats_reset
    from days d cross join names n
    left join private.legacy_rpc_usage_daily u
      on u.observed_on = d.observed_on and u.rpc_name = n.rpc_name
  )
  select
    count(*) filter (where cumulative_calls is null),
    count(*) filter (where cumulative_calls is not null and not coverage_valid),
    coalesce(sum(greatest(daily_delta, 0)), 0),
    count(*) filter (where stats_reset is null),
    count(distinct observed_on) filter (
      where cumulative_calls is not null and coverage_valid and daily_delta = 0 and stats_reset is not null
    )
  into v_missing, v_invalid, v_positive, v_reset, v_zero_days
  from grid;

  return pg_catalog.jsonb_build_object(
    'eligible', v_missing = 0 and v_invalid = 0 and v_positive = 0 and v_reset = 0
      and v_zero_days = v_required_days,
    'as_of', p_as_of,
    'required_days', v_required_days,
    'rpc_count', v_rpc_count,
    'zero_days', v_zero_days,
    'missing_rows', v_missing,
    'invalid_rows', v_invalid,
    'positive_daily_delta', v_positive,
    'stats_reset_rows', v_reset
  );
end;
$$;

revoke all on function public.get_legacy_rpc_retirement_evidence(date) from public, anon, authenticated;
grant execute on function public.get_legacy_rpc_retirement_evidence(date) to service_role;
