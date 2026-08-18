-- Phase 1: sensitive-operation authentication, immutable ledger base currency,
-- and a server-side evidence trail for legacy RPC retirement.

create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function private.require_sensitive_auth(p_max_age_seconds integer default 300)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_claims jsonb := '{}'::jsonb; v_iat bigint;
  v_aal text; v_has_verified_factor boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  begin
    v_claims := coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  exception when others then v_claims := '{}'::jsonb; end;
  begin
    v_iat := coalesce(nullif(v_claims->>'iat', '')::bigint,
      nullif(pg_catalog.current_setting('request.jwt.claim.iat', true), '')::bigint);
  exception when others then v_iat := null; end;
  v_aal := coalesce(nullif(v_claims->>'aal', ''),
    nullif(pg_catalog.current_setting('request.jwt.claim.aal', true), ''), 'aal1');
  select exists(select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified')
    into v_has_verified_factor;
  if v_has_verified_factor then
    if v_aal <> 'aal2' then raise exception 'aal2 required'; end if;
  elsif v_iat is null
    or pg_catalog.to_timestamp(v_iat) < pg_catalog.now() - pg_catalog.make_interval(secs => p_max_age_seconds)
    or pg_catalog.to_timestamp(v_iat) > pg_catalog.now() + interval '1 minute' then
    raise exception 'recent authentication required';
  end if;
end;
$$;

create or replace function private.guard_restore_job_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_sensitive_auth(300);
  return new;
end;
$$;

drop trigger if exists workbench_restore_recent_auth on private.workbench_restore_jobs;
create trigger workbench_restore_recent_auth before insert on private.workbench_restore_jobs
for each row execute function private.guard_restore_job_insert();

revoke all on function private.require_sensitive_auth(integer) from public, anon, authenticated;
revoke all on function private.guard_restore_job_insert() from public, anon, authenticated;

create or replace function private.enforce_ledger_entry_currency()
returns trigger language plpgsql set search_path = '' as $$
declare v_currency text;
begin
  if pg_catalog.current_setting('workbench.restore_mode', true) = 'on' then return new; end if;
  select currency_code into v_currency from public.user_preferences where user_id = new.user_id;
  v_currency := coalesce(v_currency, 'CNY');
  if new.currency_code <> v_currency then raise exception 'ledger currency must match base currency'; end if;
  return new;
end;
$$;

drop trigger if exists ledger_entries_base_currency_guard on public.ledger_entries;
create trigger ledger_entries_base_currency_guard
before insert or update of currency_code, user_id on public.ledger_entries
for each row execute function private.enforce_ledger_entry_currency();

create or replace function private.enforce_preference_currency()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.ledger_entries where user_id = new.user_id and currency_code <> new.currency_code) then
    raise exception 'ledger base currency cannot relabel existing entries';
  end if;
  return new;
end;
$$;

drop trigger if exists preferences_base_currency_guard on public.user_preferences;
create trigger preferences_base_currency_guard after insert or update of currency_code on public.user_preferences
for each row execute function private.enforce_preference_currency();

revoke all on function private.enforce_ledger_entry_currency() from public, anon, authenticated;
revoke all on function private.enforce_preference_currency() from public, anon, authenticated;

create or replace function public.set_ledger_base_currency_v2(
  p_command_id uuid, p_restore_epoch bigint, p_currency text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_epoch bigint; v_current text;
  v_previous private.workbench_operation_receipts%rowtype; v_response jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_currency not in ('CNY','USD','EUR','HKD','GBP') then raise exception 'unsupported currency'; end if;
  perform public.lock_user_data_revision(v_uid);
  select restore_epoch into v_epoch from public.user_data_revisions where user_id = v_uid;
  if v_epoch <> p_restore_epoch then
    return public.command_result('stale_restore', p_command_id, v_uid, null, null, array[]::text[], 'restore epoch changed');
  end if;
  select * into v_previous from private.workbench_operation_receipts
    where user_id = v_uid and operation_id = p_command_id;
  if found then
    if v_previous.operation_kind <> 'ledger.currency' or v_previous.restore_epoch <> p_restore_epoch then
      raise exception 'command id reused';
    end if;
    return pg_catalog.jsonb_set(v_previous.response, '{status}', '"duplicate"'::jsonb, true);
  end if;
  select currency_code into v_current from public.user_preferences where user_id = v_uid;
  v_current := coalesce(v_current, 'CNY');
  if v_current <> p_currency and exists(select 1 from public.ledger_entries where user_id = v_uid) then
    raise exception 'ledger base currency is immutable after the first entry';
  end if;
  insert into public.user_preferences(user_id, currency_code) values(v_uid, p_currency)
  on conflict(user_id) do update set currency_code = excluded.currency_code, updated_at = pg_catalog.now();
  v_response := public.command_result('applied', p_command_id, v_uid,
    pg_catalog.jsonb_build_object('currency_code', p_currency, 'updated_entries', 0));
  insert into private.workbench_operation_receipts(user_id, operation_id, restore_epoch, operation_kind, response)
  values(v_uid, p_command_id, p_restore_epoch, 'ledger.currency', v_response);
  return v_response;
end;
$$;

create or replace function public.switch_ledger_currency(
  p_command_id uuid, p_restore_epoch bigint, p_currency text
)
returns jsonb language sql security definer set search_path = '' as $$
  select public.set_ledger_base_currency_v2(p_command_id, p_restore_epoch, p_currency);
$$;

revoke all on function public.set_ledger_base_currency_v2(uuid,bigint,text) from public, anon;
revoke all on function public.switch_ledger_currency(uuid,bigint,text) from public, anon;
grant execute on function public.set_ledger_base_currency_v2(uuid,bigint,text) to authenticated;
grant execute on function public.switch_ledger_currency(uuid,bigint,text) to authenticated;

create table if not exists private.legacy_rpc_usage_daily (
  observed_on date not null, rpc_name text not null,
  cumulative_calls bigint not null check(cumulative_calls >= 0),
  daily_delta bigint not null check(daily_delta >= 0), stats_reset timestamptz,
  coverage_valid boolean not null, captured_at timestamptz not null default pg_catalog.now(),
  primary key(observed_on, rpc_name)
);

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
    where query ~* ('(^|[^a-z0-9_])' || v_name || '[[:space:]]*\\(');
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

revoke all on table private.legacy_rpc_usage_daily from public, anon, authenticated;
revoke all on function private.snapshot_legacy_rpc_usage(date) from public, anon, authenticated;
select private.snapshot_legacy_rpc_usage();

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'workbench-legacy-rpc-usage-daily';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('workbench-legacy-rpc-usage-daily','17 0 * * *',
    'select private.snapshot_legacy_rpc_usage();');
end;
$$;
