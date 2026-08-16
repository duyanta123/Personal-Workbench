-- V2 命令协议覆盖 pomodoro 与 avatar（V1 enqueue 路径退役前的服务端准备）：
-- 1. 为 pomodoro_sessions / user_avatars 补齐 row_version 与递增触发器；
-- 2. apply_workbench_command_v2 实体枚举扩展 pomodoro / avatar：
--    - pomodoro.create 保持 V1 pomodoro.complete 的按 (user_id, date) 增量合并语义；
--    - avatar.create 复用 public.upsert_avatar（设为当前头像 + 超额淘汰），行为与 V1 一致。
-- 幂等仍由 private.workbench_operation_receipts 保证：同 commandId 重放返回 duplicate，不重复累计。

alter table public.pomodoro_sessions add column if not exists row_version bigint not null default 1;
alter table public.user_avatars add column if not exists row_version bigint not null default 1;

drop trigger if exists pomodoro_sessions_row_version on public.pomodoro_sessions;
create trigger pomodoro_sessions_row_version before update on public.pomodoro_sessions
  for each row execute function public.bump_row_version();

drop trigger if exists user_avatars_row_version on public.user_avatars;
create trigger user_avatars_row_version before update on public.user_avatars
  for each row execute function public.bump_row_version();

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
    when 'pomodoro' then
      v_table := 'pomodoro_sessions';
      v_allowed := array['date','count','minutes'];
    when 'avatar' then
      v_table := 'user_avatars';
      v_allowed := array['storage_path','is_active'];
    else
      raise exception 'unsupported command kind';
  end case;

  if v_action not in ('create','update','delete') then raise exception 'unsupported command action'; end if;
  if not public.jsonb_keys_allowed(p_payload, v_allowed) or not public.jsonb_keys_allowed(p_expected, v_allowed) then
    raise exception 'command contains fields outside allow-list';
  end if;

  if v_entity = 'pomodoro' then
    -- 增量合并语义（与 V1 pomodoro.complete 一致）；仅支持 create。
    if v_action <> 'create' then raise exception 'pomodoro commands only support create (merge)'; end if;
    if pg_catalog.coalesce((p_payload->>'minutes')::int, 0) <= 0
      or pg_catalog.coalesce((p_payload->>'minutes')::int, 0) > 240 then
      raise exception 'invalid minutes';
    end if;
    insert into public.pomodoro_sessions (id, user_id, date, count, minutes)
    values (
      p_entity_id, v_uid, (p_payload->>'date')::date,
      pg_catalog.greatest(pg_catalog.coalesce((p_payload->>'count')::int, 1), 1),
      (p_payload->>'minutes')::int
    )
    on conflict (user_id, date) do update
      set count = public.pomodoro_sessions.count + excluded.count,
          minutes = public.pomodoro_sessions.minutes + excluded.minutes
    returning pg_catalog.to_jsonb(public.pomodoro_sessions.*) into v_data;
    v_response := public.command_result('applied', p_command_id, p_entity_id, v_data);
  elsif v_entity = 'avatar' and v_action = 'create' then
    -- 与 V1 avatar.register 一致：设为当前头像并按上限淘汰最旧（data 含 avatar_id 与 evicted_paths）。
    -- 注意 V2 客户端 payload 字段名为 storage_path（与上方 allow-list 一致），不是 V1 的 path。
    v_response := public.command_result('applied', p_command_id, p_entity_id, public.upsert_avatar(p_payload->>'storage_path'));
  else
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
  end if;

  insert into private.workbench_operation_receipts(user_id, operation_id, restore_epoch, operation_kind, response)
  values (v_uid, p_command_id, p_restore_epoch, 'v2:' || p_kind, v_response);
  return v_response;
end;
$$;

revoke all on function public.apply_workbench_command_v2(uuid, uuid, bigint, text, jsonb, jsonb, bigint, uuid[]) from public, anon;
grant execute on function public.apply_workbench_command_v2(uuid, uuid, bigint, text, jsonb, jsonb, bigint, uuid[]) to authenticated;
