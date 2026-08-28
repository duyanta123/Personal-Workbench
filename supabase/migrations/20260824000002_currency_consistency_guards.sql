-- A restore runs with trigger enforcement suspended while it replaces the
-- user's rows. Validate the currency invariant before that trusted path, and
-- fail the migration if production already contains ambiguous ledger data.

do $$
declare
  v_mismatch boolean;
  v_multiple boolean;
begin
  select exists(
    select 1
    from public.ledger_entries e
    left join public.user_preferences p on p.user_id = e.user_id
    where coalesce(e.currency_code, 'CNY') <> coalesce(p.currency_code, 'CNY')
  ) into v_mismatch;
  if v_mismatch then
    raise exception 'ledger data is inconsistent with user base currency';
  end if;

  select exists(
    select 1
    from public.ledger_entries
    group by user_id
    having count(distinct coalesce(currency_code, 'CNY')) > 1
  ) into v_multiple;
  if v_multiple then
    raise exception 'ledger data contains multiple currencies for a user';
  end if;
end;
$$;

create or replace function private.validate_restore_currency(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tables jsonb;
  v_entries jsonb;
  v_preferences jsonb;
  v_preference_count bigint;
  v_base text;
  v_entry_currencies bigint;
begin
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' then return; end if;
  v_tables := p_payload->'tables';
  if pg_catalog.jsonb_typeof(v_tables) <> 'object' then return; end if;
  v_entries := coalesce(v_tables->'ledger_entries', '[]'::jsonb);
  v_preferences := coalesce(v_tables->'user_preferences', '[]'::jsonb);
  if pg_catalog.jsonb_typeof(v_entries) <> 'array'
    or pg_catalog.jsonb_typeof(v_preferences) <> 'array' then
    return;
  end if;

  select pg_catalog.count(*) into v_preference_count
  from pg_catalog.jsonb_array_elements(v_preferences);
  if v_preference_count > 1 then
    raise exception 'restore contains multiple preference rows';
  end if;
  if v_preference_count = 1 then
    select coalesce(item.value->>'currency_code', 'CNY') into v_base
    from pg_catalog.jsonb_array_elements(v_preferences) item;
  end if;

  select pg_catalog.count(distinct coalesce(item.value->>'currency_code', 'CNY'))
    into v_entry_currencies
  from pg_catalog.jsonb_array_elements(v_entries) item;
  if v_entry_currencies > 1 then
    raise exception 'restore contains multiple ledger currencies';
  end if;
  -- Older backups may omit the singleton preferences row. Their parser
  -- defaults the base currency to CNY, so keep that compatibility only when
  -- every imported ledger row is also CNY.
  v_base := coalesce(v_base, 'CNY');
  if v_base is not null and v_base not in ('CNY','USD','EUR','HKD','GBP') then
    raise exception 'restore contains unsupported base currency';
  end if;
  if v_entry_currencies > 0 and exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_entries) item
    where coalesce(item.value->>'currency_code', 'CNY') <> v_base
  ) then
    raise exception 'restore ledger currency must match base currency';
  end if;
end;
$$;

revoke all on function private.validate_restore_currency(jsonb) from public, anon, authenticated;

create or replace function public.restore_workbench_backup_v2(
  p_payload jsonb,
  p_avatar_paths jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_sensitive_auth(300);
  perform private.validate_restore_currency(p_payload);
  return private.restore_workbench_backup_v2_unchecked(p_payload, p_avatar_paths);
end;
$$;

create or replace function public.restore_workbench_backup_v3(
  p_payload jsonb,
  p_avatar_paths jsonb default '[]'::jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_sensitive_auth(300);
  perform private.validate_restore_currency(p_payload);
  return private.restore_workbench_backup_v3_unchecked(p_payload, p_avatar_paths, p_expected_revision);
end;
$$;

create or replace function public.restore_workbench_backup_v7(
  p_payload jsonb,
  p_avatar_paths jsonb default '[]'::jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_sensitive_auth(300);
  perform private.validate_restore_currency(p_payload);
  return private.restore_workbench_backup_v7_unchecked(p_payload, p_avatar_paths, p_expected_revision);
end;
$$;

revoke all on function public.restore_workbench_backup_v2(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.restore_workbench_backup_v3(jsonb, jsonb, bigint) from public, anon;
revoke all on function public.restore_workbench_backup_v7(jsonb, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.restore_workbench_backup_v3(jsonb, jsonb, bigint) to authenticated;
