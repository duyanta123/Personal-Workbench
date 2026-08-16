-- 修复：least()/greatest()/coalesce()/trim() 是 PostgreSQL 语法层特殊表达式，
-- 并非 pg_catalog 中的真实函数。带 pg_catalog. 前缀调用它们在 PL/pgSQL 函数体里
-- 创建时不报错，但运行时抛 42883（function pg_catalog.xxx does not exist）。
-- 涉及的历史迁移已应用到云端，遵循 append-only 约束：以最终版本重建受影响函数。
-- 受影响对象（均为各自最新定义）：
--   1. search_workbench_v2        （20260816000002 版本体内 trim/least/greatest）
--   2. suggest_ledger_recurrences （20260815000004 版本体内 coalesce/greatest）
--   3. apply_workbench_command_v2 （20260816000003 pomodoro 分支 coalesce/greatest）
-- 函数签名不变，仅修正函数体，不产生类型漂移。

create or replace function public.search_workbench_v2(p_query text, p_limit int default 8)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_q text := trim(coalesce(p_query, ''));
  v_pattern text;
  v_limit int := least(greatest(coalesce(p_limit, 8), 1), 25);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_q = '' then return '[]'::jsonb; end if;
  v_pattern := '%' || replace(replace(replace(v_q, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'kind',kind,'id',id,'title',title,'subtitle',subtitle,'route',route,'matchField',match_field,'updatedAt',updated_at
    ) order by rank desc,updated_at desc,id) from (
      select * from (
        select 'todo' kind,id,text title,due_date::text subtitle,'/todos?focus='||id route,'text' match_field,updated_at,extensions.similarity(text,v_q) rank from public.todos where user_id=v_uid and text ilike v_pattern escape chr(92)
        union all select 'habit',id,name,null,'/checkins?focus='||id,'name',created_at,extensions.similarity(name,v_q) from public.habits where user_id=v_uid and name ilike v_pattern escape chr(92)
        union all select 'ledger',id,coalesce(note,category),category,'/ledger?focus='||id,'note',created_at,extensions.similarity(coalesce(note,category),v_q) from public.ledger_entries where user_id=v_uid and (note ilike v_pattern escape chr(92) or category ilike v_pattern escape chr(92))
        union all select 'goal',id,name,unit,'/goals?focus='||id,'name',updated_at,extensions.similarity(name,v_q) from public.goals where user_id=v_uid and name ilike v_pattern escape chr(92)
        union all select 'note',id,coalesce(title,pg_catalog.left(body,80)),pg_catalog.left(body,120),'/notes?focus='||id,case when title ilike v_pattern escape chr(92) then 'title' else 'body' end,updated_at,greatest(extensions.similarity(coalesce(title,''),v_q),extensions.similarity(body,v_q)) from public.notes where user_id=v_uid and (title ilike v_pattern escape chr(92) or body ilike v_pattern escape chr(92))
        union all select 'practice',id,title,platform,'/practice?focus='||id,'title',updated_at,extensions.similarity(title,v_q) from public.practice_problems where user_id=v_uid and (title ilike v_pattern escape chr(92) or note ilike v_pattern escape chr(92))
        union all select 'workout',id,body_part,note,'/workout?focus='||id,'body_part',created_at,extensions.similarity(body_part,v_q) from public.workout_sessions where user_id=v_uid and (body_part ilike v_pattern escape chr(92) or note ilike v_pattern escape chr(92))
        union all select 'inbox',id,pg_catalog.left(raw_text,100),null,'/?focus='||id,'raw_text',updated_at,extensions.similarity(raw_text,v_q) from public.inbox_items where user_id=v_uid and raw_text ilike v_pattern escape chr(92)
      ) matches order by rank desc,updated_at desc limit v_limit
    ) limited
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.search_workbench_v2(text,int) from public,anon;
grant execute on function public.search_workbench_v2(text,int) to authenticated;

create or replace function public.suggest_ledger_recurrences(p_today date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_today is null then raise exception 'date required'; end if;
  return coalesce((
    with ordered as (
      select e.*,
        e.entry_date-pg_catalog.lag(e.entry_date) over(partition by e.kind,e.category,e.currency_code,e.account_id,e.payee_id order by e.entry_date,e.id) gap_days
      from public.ledger_entries e
      where e.user_id=v_uid and e.status='posted' and e.entry_date between p_today-179 and p_today
    ), candidates as (
      select kind,category,currency_code,account_id,payee_id,pg_catalog.count(*) occurrences,
        pg_catalog.min(entry_date) first_date,pg_catalog.max(entry_date) last_date,
        pg_catalog.round(pg_catalog.avg(amount_minor))::bigint amount_minor,
        pg_catalog.max(amount_minor)-pg_catalog.min(amount_minor) amount_spread,
        coalesce(pg_catalog.bool_and(gap_days between 6 and 8) filter(where gap_days is not null),false) weekly,
        coalesce(pg_catalog.bool_and(gap_days between 25 and 34) filter(where gap_days is not null),false) monthly
      from ordered group by kind,category,currency_code,account_id,payee_id having pg_catalog.count(*)>=3
    ), eligible as (
      select *,case when weekly then 'weekly' else 'monthly' end frequency from candidates
      where (weekly or monthly) and amount_spread<=greatest(pg_catalog.round(amount_minor*0.05)::bigint,100)
    )
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key',kind||':'||category||':'||currency_code||':'||coalesce(account_id::text,'')||':'||coalesce(payee_id::text,''),
      'frequency',frequency,'occurrences',occurrences,'start_date',first_date,
      'weekdays',case when frequency='weekly' then pg_catalog.jsonb_build_array(extract(dow from first_date)::int) else '[]'::jsonb end,
      'month_day',case when frequency='monthly' then extract(day from first_date)::int else null end,
      'template',pg_catalog.jsonb_build_object('kind',kind,'category',category,'amount_minor',amount_minor,'currency_code',currency_code,'note',null)
    ) order by occurrences desc,last_date desc)
    from eligible c where not exists(
      select 1 from public.recurrence_rules r where r.user_id=v_uid and r.entity_type='ledger' and r.frequency=c.frequency
        and r.template->>'kind'=c.kind and r.template->>'category'=c.category
        and pg_catalog.abs((r.template->>'amount_minor')::bigint-c.amount_minor)<=greatest(pg_catalog.round(c.amount_minor*0.05)::bigint,100)
    )
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.suggest_ledger_recurrences(date) from public,anon;
grant execute on function public.suggest_ledger_recurrences(date) to authenticated;

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
    if coalesce((p_payload->>'minutes')::int, 0) <= 0
      or coalesce((p_payload->>'minutes')::int, 0) > 240 then
      raise exception 'invalid minutes';
    end if;
    insert into public.pomodoro_sessions (id, user_id, date, count, minutes)
    values (
      p_entity_id, v_uid, (p_payload->>'date')::date,
      greatest(coalesce((p_payload->>'count')::int, 1), 1),
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
