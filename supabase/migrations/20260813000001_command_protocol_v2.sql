-- Command protocol V2: optimistic row versions, field-aware conflict detection,
-- and an explicit allow-list for offline CRUD. Existing V1 RPCs remain intact.

alter table public.todos add column if not exists row_version bigint not null default 1;
alter table public.habits add column if not exists row_version bigint not null default 1;
alter table public.habit_logs add column if not exists row_version bigint not null default 1;
alter table public.ledger_entries add column if not exists row_version bigint not null default 1;
alter table public.goals add column if not exists row_version bigint not null default 1;
alter table public.notes add column if not exists row_version bigint not null default 1;
alter table public.practice_problems add column if not exists row_version bigint not null default 1;
alter table public.workout_sessions add column if not exists row_version bigint not null default 1;
alter table public.workout_exercises add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.workout_exercises e set user_id = s.user_id
from public.workout_sessions s where e.session_id = s.id and e.user_id is null;
alter table public.workout_exercises alter column user_id set not null;
alter table public.workout_exercises alter column user_id set default auth.uid();
alter table public.workout_exercises add column if not exists row_version bigint not null default 1;
alter table public.body_metrics add column if not exists row_version bigint not null default 1;

create or replace function public.bump_row_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.row_version = old.row_version + 1;
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'todos','habits','habit_logs','ledger_entries','goals','notes','practice_problems',
    'workout_sessions','workout_exercises','body_metrics'
  ] loop
    execute pg_catalog.format('drop trigger if exists %I_row_version on public.%I', v_table, v_table);
    execute pg_catalog.format(
      'create trigger %I_row_version before update on public.%I for each row execute function public.bump_row_version()',
      v_table, v_table
    );
  end loop;
end;
$$;

create or replace function public.jsonb_keys_allowed(p_value jsonb, p_allowed text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_typeof(p_value) = 'object'
    and not exists (
      select 1 from pg_catalog.jsonb_object_keys(p_value) key where not (key = any(p_allowed))
    );
$$;

create or replace function public.command_conflicting_fields(
  p_current jsonb,
  p_expected jsonb,
  p_payload jsonb
)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(key order by key), array[]::text[])
  from pg_catalog.jsonb_object_keys(p_payload) key
  where not (p_expected ? key) or p_current->key is distinct from p_expected->key;
$$;

create or replace function public.command_result(
  p_status text,
  p_command_id uuid,
  p_entity_id uuid,
  p_data jsonb default null,
  p_current jsonb default null,
  p_conflicting_fields text[] default array[]::text[],
  p_message text default null
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'status', p_status,
    'command_id', p_command_id,
    'entity_id', p_entity_id,
    'data', p_data,
    'current', p_current,
    'conflicting_fields', pg_catalog.to_jsonb(p_conflicting_fields),
    'message', p_message
  );
$$;

create or replace function public.apply_workbench_command_v2(
  p_command_id uuid,
  p_entity_id uuid,
  p_restore_epoch bigint,
  p_kind text,
  p_payload jsonb default '{}'::jsonb,
  p_expected jsonb default '{}'::jsonb,
  p_base_version bigint default null,
  p_depends_on uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_epoch bigint;
  v_previous private.workbench_operation_receipts%rowtype;
  v_response jsonb;
  v_current jsonb;
  v_data jsonb;
  v_conflicts text[];
  v_table text;
  v_columns text;
  v_column_values text;
  v_set_list text;
  v_allowed text[];
  v_action text;
  v_entity text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_command_id is null or p_entity_id is null then raise exception 'command and entity id required'; end if;
  if p_restore_epoch is null or p_restore_epoch < 0 then raise exception 'restore epoch required'; end if;
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' or pg_catalog.jsonb_typeof(p_expected) <> 'object' then
    raise exception 'invalid command payload';
  end if;
  if pg_catalog.cardinality(p_depends_on) > 50 then raise exception 'too many dependencies'; end if;

  perform public.lock_user_data_revision(v_uid);
  select restore_epoch into v_epoch from public.user_data_revisions where user_id = v_uid;
  if v_epoch <> p_restore_epoch then
    return public.command_result('stale_restore', p_command_id, p_entity_id, null, null, array[]::text[], 'restore epoch changed');
  end if;

  select * into v_previous from private.workbench_operation_receipts
  where user_id = v_uid and operation_id = p_command_id;
  if found then
    if v_previous.operation_kind <> 'v2:' || p_kind or v_previous.restore_epoch <> p_restore_epoch then
      raise exception 'command id reused';
    end if;
    return pg_catalog.jsonb_set(v_previous.response, '{status}', '"duplicate"'::jsonb, true);
  end if;

  if exists (
    select 1 from pg_catalog.unnest(p_depends_on) dependency
    where not exists (
      select 1 from private.workbench_operation_receipts receipt
      where receipt.user_id = v_uid and receipt.operation_id = dependency
        and receipt.response->>'status' in ('applied','duplicate')
    )
  ) then
    return public.command_result('failed', p_command_id, p_entity_id, null, null, array[]::text[], 'dependency not applied');
  end if;

  v_entity := pg_catalog.split_part(p_kind, '.', 1);
  v_action := pg_catalog.split_part(p_kind, '.', 2);

  case v_entity
    when 'todo' then
      v_table := 'todos';
      v_allowed := array['text','level','done','pinned','due_date','sort_order','status','recurrence_rule_id','occurrence_date','recurrence_detached'];
    when 'habit' then
      v_table := 'habits';
      v_allowed := array['name','emoji','pinned','tracking_type','period_days','target_count','target_value','target_mode','reminder_time'];
    when 'habit_log' then
      v_table := 'habit_logs';
      v_allowed := array['habit_id','log_date','state','value'];
    when 'ledger' then
      v_table := 'ledger_entries';
      v_allowed := array['kind','category','amount','amount_minor','currency_code','note','entry_date','status','account_id','payee_id','recurrence_rule_id','occurrence_date','reconciled_at'];
    when 'goal' then
      v_table := 'goals';
      v_allowed := array['name','emoji','current','target','unit','note','pinned'];
    when 'note' then
      v_table := 'notes';
      v_allowed := array['title','body','tags','pinned','layout','image_url'];
    when 'practice' then
      v_table := 'practice_problems';
      v_allowed := array['title','platform','difficulty','status','tags','url','note','solved_at'];
    when 'workout_session' then
      v_table := 'workout_sessions';
      v_allowed := array['date','body_part','duration_min','note'];
    when 'workout_exercise' then
      v_table := 'workout_exercises';
      v_allowed := array['session_id','name','sets','reps','weight','note'];
    when 'body_metric' then
      v_table := 'body_metrics';
      v_allowed := array['date','weight','body_fat','note'];
    when 'inbox' then
      v_table := 'inbox_items';
      v_allowed := array['raw_text','source','parsed_candidates','suggested_kind','status','routed_kind','routed_id'];
    when 'recurrence' then
      v_table := 'recurrence_rules';
      v_allowed := array['entity_type','frequency','interval_count','weekdays','month_day','start_date','end_date','timezone','local_time','enabled','generation_mode','template','materialized_through','skipped_before_window'];
    when 'ledger_account' then
      v_table := 'ledger_accounts';
      v_allowed := array['name','type','opening_balance_minor','archived'];
    when 'ledger_payee' then
      v_table := 'ledger_payees';
      v_allowed := array['name'];
    when 'ledger_rule' then
      v_table := 'ledger_rules';
      v_allowed := array['name','stage','sort_order','enabled','conditions','actions'];
    when 'ledger_split' then
      v_table := 'ledger_splits';
      v_allowed := array['ledger_entry_id','category','amount_minor','note'];
    when 'ledger_reconciliation' then
      v_table := 'ledger_reconciliations';
      v_allowed := array['account_id','statement_date','balance_minor'];
    when 'entity_link' then
      v_table := 'entity_links';
      v_allowed := array['source_kind','source_id','target_kind','target_id'];
    when 'template' then
      v_table := 'workbench_templates';
      v_allowed := array['kind','name','payload'];
    when 'saved_view' then
      v_table := 'saved_views';
      v_allowed := array['entity_kind','name','filters','sort','is_default'];
    else
      raise exception 'unsupported command kind';
  end case;

  if v_action not in ('create','update','delete') then raise exception 'unsupported command action'; end if;
  if not public.jsonb_keys_allowed(p_payload, v_allowed) or not public.jsonb_keys_allowed(p_expected, v_allowed) then
    raise exception 'command contains fields outside allow-list';
  end if;

  execute pg_catalog.format('select pg_catalog.to_jsonb(t) from public.%I t where id = $1 and user_id = $2', v_table)
    into v_current using p_entity_id, v_uid;

  if v_action = 'create' then
    if v_current is not null then
      v_response := public.command_result('conflict', p_command_id, p_entity_id, null, v_current, array['id'], 'entity already exists');
    else
      select pg_catalog.string_agg(pg_catalog.format('%I', key), ', ' order by ord),
             pg_catalog.string_agg(pg_catalog.format('x.%I', key), ', ' order by ord)
      into v_columns, v_column_values
      from pg_catalog.unnest(v_allowed) with ordinality a(key, ord) where p_payload ? key;
      if v_columns is null then raise exception 'empty create payload'; end if;
      execute pg_catalog.format(
        'insert into public.%I (id, user_id, %s) select $2, $3, %s from pg_catalog.jsonb_populate_record(null::public.%I, $1) x returning pg_catalog.to_jsonb(%I.*)',
        v_table, v_columns, v_column_values, v_table, v_table
      ) into v_data using p_payload, p_entity_id, v_uid;
      v_response := public.command_result('applied', p_command_id, p_entity_id, v_data);
    end if;
  elsif v_current is null then
    v_response := public.command_result('not_found', p_command_id, p_entity_id, null, null, array[]::text[], 'entity not found');
  elsif p_base_version is null then
    raise exception 'base version required';
  elsif v_action = 'delete' then
    if (v_current->>'row_version')::bigint <> p_base_version then
      v_response := public.command_result('conflict', p_command_id, p_entity_id, null, v_current, array['row_version'], 'entity changed before delete');
    else
      execute pg_catalog.format('delete from public.%I where id = $1 and user_id = $2 returning pg_catalog.to_jsonb(%I.*)', v_table, v_table)
        into v_data using p_entity_id, v_uid;
      v_response := public.command_result('applied', p_command_id, p_entity_id, v_data);
    end if;
  else
    if (v_current->>'row_version')::bigint <> p_base_version then
      v_conflicts := public.command_conflicting_fields(v_current, p_expected, p_payload);
    else
      v_conflicts := array[]::text[];
    end if;
    if pg_catalog.cardinality(v_conflicts) > 0 then
      v_response := public.command_result('conflict', p_command_id, p_entity_id, null, v_current, v_conflicts, 'same fields changed on another device');
    else
      select pg_catalog.string_agg(pg_catalog.format('%1$I = x.%1$I', key), ', ' order by ord)
      into v_set_list from pg_catalog.unnest(v_allowed) with ordinality a(key, ord) where p_payload ? key;
      if v_set_list is null then raise exception 'empty update payload'; end if;
      execute pg_catalog.format(
        'update public.%I t set %s from pg_catalog.jsonb_populate_record(null::public.%I, $1 || $2) x where t.id = $3 and t.user_id = $4 returning pg_catalog.to_jsonb(t.*)',
        v_table, v_set_list, v_table
      ) into v_data using v_current, p_payload, p_entity_id, v_uid;
      v_response := public.command_result('applied', p_command_id, p_entity_id, v_data);
    end if;
  end if;

  insert into private.workbench_operation_receipts(user_id, operation_id, restore_epoch, operation_kind, response)
  values (v_uid, p_command_id, p_restore_epoch, 'v2:' || p_kind, v_response);
  return v_response;
end;
$$;

revoke all on function public.bump_row_version() from public, anon, authenticated;
revoke all on function public.jsonb_keys_allowed(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.command_conflicting_fields(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.command_result(text, uuid, uuid, jsonb, jsonb, text[], text) from public, anon, authenticated;
revoke all on function public.apply_workbench_command_v2(uuid, uuid, bigint, text, jsonb, jsonb, bigint, uuid[]) from public, anon;
grant execute on function public.apply_workbench_command_v2(uuid, uuid, bigint, text, jsonb, jsonb, bigint, uuid[]) to authenticated;
