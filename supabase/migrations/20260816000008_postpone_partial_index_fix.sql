-- 延期（postpone）与恢复路径修复：
-- 1. todos_recurrence_occurrence_unique 唯一索引扩展部分条件，排除 detached 实例。
--    延期 = 标准 UPDATE 修改 occurrence_date；物化窗口（today+30）通常已在目标日期
--    创建了非 detached 实例，旧索引会把 UPDATE 直接顶爆（duplicate key）。
--    detached 实例在 BEFORE UPDATE 触发器 todos_mark_recurrence_detached 中标记
--    （20260816000005 已覆盖 occurrence_date 列），无需新增触发器。
-- 2. 新索引比旧索引更宽松（排除更多行），现有数据必然兼容；但物化函数的
--    ON CONFLICT 推断子句必须与新索引部分条件语义等价，否则运行时报
--    "no unique or exclusion constraint matching the ON CONFLICT specification"。
--    重建 materialize_recurrences：todos 分支推断追加 and not recurrence_detached
--    （ledger 分支不动，仍匹配 ledger_entries 自己的索引，该表无 detached 概念）。
-- 3. restore_workbench_backup_v7 中 pg_advisory_xct_lock 为拼写错误（少一个 a），
--    正确函数名是 pg_advisory_xact_lock；PL/pgSQL 延迟解析导致创建成功、恢复时爆炸。
--    以最终版本整体重建修正（其余 13 处调用点拼写均正确）。

-- ---------- 1. 部分唯一索引：非 detached 实例才参与唯一性 ----------
drop index if exists public.todos_recurrence_occurrence_unique;
create unique index todos_recurrence_occurrence_unique
  on public.todos(user_id, recurrence_rule_id, occurrence_date)
  where recurrence_rule_id is not null and not recurrence_detached;

-- ---------- 2. 物化函数：ON CONFLICT 推断与新索引条件对齐 ----------
create or replace function public.materialize_recurrences(
  p_today date,
  p_timezone text default 'Asia/Shanghai'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rule public.recurrence_rules;
  v_date date;
  v_rule_today date;
  v_from date;
  v_to date := p_today + 30;
  v_skip_from date;
  v_matches boolean;
  v_skipped int;
  v_todos int := 0;
  v_ledger int := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_today is null then raise exception 'today required'; end if;
  perform p_today::timestamp at time zone p_timezone;
  perform pg_catalog.set_config('workbench.recurrence_apply','on',true);

  -- for update 串行化同一用户的多标签页并发：实例由唯一索引兜底，
  -- 行锁保证 skipped_before_window 与游标推进不会被并发重复累加。
  for v_rule in select * from public.recurrence_rules where user_id=v_uid and enabled order by id for update loop
    v_skipped := 0;
    -- 窗口与游标按规则自身时区的"今天"计算；无效时区跳过该规则。
    begin
      v_rule_today := (pg_catalog.now() at time zone v_rule.timezone)::date;
    exception when others then
      continue;
    end;
    v_from := v_rule_today - 7;
    v_to := v_rule_today + 30;
    v_skip_from := greatest(v_rule.start_date,coalesce(v_rule.materialized_through+1,v_rule.start_date));
    if v_skip_from < v_from then
      for v_date in select d::date from pg_catalog.generate_series(v_skip_from::timestamp,(v_from-1)::timestamp,interval '1 day') d loop
        v_matches := public.recurrence_occurrence_matches(
          v_rule.frequency,v_rule.interval_count,v_rule.weekdays,v_rule.month_day,v_rule.start_date,v_date);
        if v_matches and (v_rule.end_date is null or v_date<=v_rule.end_date) then v_skipped:=v_skipped+1; end if;
      end loop;
    end if;

    for v_date in select d::date from pg_catalog.generate_series(
      greatest(v_rule.start_date,v_from)::timestamp,
      least(coalesce(v_rule.end_date,v_to),v_to)::timestamp,interval '1 day') d
    loop
      v_matches := public.recurrence_occurrence_matches(
        v_rule.frequency,v_rule.interval_count,v_rule.weekdays,v_rule.month_day,v_rule.start_date,v_date);
      if v_matches and v_rule.entity_type='todo' then
        insert into public.todos(user_id,text,level,done,status,pinned,due_date,recurrence_rule_id,occurrence_date)
        values(v_uid,v_rule.template->>'text',coalesce(v_rule.template->>'level','mid'),false,'open',
          coalesce((v_rule.template->>'pinned')::boolean,false),v_date,v_rule.id,v_date)
        on conflict (user_id,recurrence_rule_id,occurrence_date)
          where recurrence_rule_id is not null and not recurrence_detached do nothing;
        if found then v_todos:=v_todos+1; end if;
      elsif v_matches and v_rule.entity_type='ledger' then
        insert into public.ledger_entries(user_id,kind,category,amount,amount_minor,currency_code,note,entry_date,status,recurrence_rule_id,occurrence_date)
        values(v_uid,v_rule.template->>'kind',v_rule.template->>'category',(v_rule.template->>'amount_minor')::numeric/100,
          (v_rule.template->>'amount_minor')::bigint,coalesce(v_rule.template->>'currency_code','CNY'),v_rule.template->>'note',v_date,
          case when v_rule.generation_mode='automatic' then 'posted' else 'planned' end,v_rule.id,v_date)
        on conflict (user_id,recurrence_rule_id,occurrence_date) where recurrence_rule_id is not null do nothing;
        if found then v_ledger:=v_ledger+1; end if;
      end if;
    end loop;
    update public.recurrence_rules set materialized_through=greatest(coalesce(materialized_through,start_date),v_to),
      skipped_before_window=skipped_before_window+v_skipped where id=v_rule.id and user_id=v_uid;
  end loop;
  perform pg_catalog.set_config('workbench.recurrence_apply','off',true);
  return pg_catalog.jsonb_build_object('todos',v_todos,'ledger_entries',v_ledger,'through',v_to);
end;
$$;

revoke all on function public.materialize_recurrences(date,text) from public,anon;
grant execute on function public.materialize_recurrences(date,text) to authenticated;

-- ---------- 3. 恢复函数：advisory lock 拼写修正（xct -> xact） ----------
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
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_source_version int := coalesce((p_payload#>>'{metadata,source_version}')::int, 7);
  v_tables jsonb := coalesce(p_payload->'tables', '{}'::jsonb);
  v_row jsonb;
  v_pref jsonb;
  v_path text;
  v_old_avatar_paths jsonb;
  v_deleted_counts jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_table text;
  v_count bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce((p_payload#>>'{metadata,version}')::int, 0) <> 7 then raise exception 'unsupported backup version'; end if;
  if v_source_version not between 1 and 7 then raise exception 'unsupported source backup version'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'expected revision required'; end if;
  if pg_catalog.jsonb_typeof(v_tables) <> 'object' then raise exception 'invalid backup tables'; end if;
  foreach v_table in array private.workbench_backup_tables_v7() loop
    if pg_catalog.jsonb_typeof(coalesce(v_tables->v_table, '[]'::jsonb)) <> 'array' then
      raise exception 'backup table must be an array: %', v_table;
    end if;
  end loop;
  if pg_catalog.jsonb_typeof(p_avatar_paths) <> 'array' or pg_catalog.jsonb_array_length(p_avatar_paths) > 5 then
    raise exception 'invalid avatar paths';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_avatar_paths) x
    where pg_catalog.jsonb_typeof(x) <> 'object' or x->>'path' is null
      or pg_catalog.length(x->>'path') > 512
      or pg_catalog.left(x->>'path', pg_catalog.length(v_uid::text) + 1) <> v_uid::text || '/'
      or pg_catalog.lower(pg_catalog.right(x->>'path', 5)) <> '.webp'
  ) then raise exception 'invalid avatar path'; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(p_avatar_paths) x
      where coalesce((x->>'is_active')::boolean, false)) > 1 then raise exception 'multiple active avatars'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('avatar:' || v_uid::text, 0));
  insert into public.user_data_revisions (user_id) values (v_uid) on conflict (user_id) do nothing;
  select revision into v_revision from public.user_data_revisions where user_id = v_uid for update;
  if v_revision <> p_expected_revision then raise exception 'revision conflict'; end if;

  foreach v_table in array private.workbench_backup_tables_v7() loop
    execute pg_catalog.format('select pg_catalog.count(*) from public.%I where user_id = $1', v_table)
      into v_count using v_uid;
    v_deleted_counts := v_deleted_counts || pg_catalog.jsonb_build_object(v_table, v_count);
    v_counts := v_counts || pg_catalog.jsonb_build_object(
      v_table, pg_catalog.jsonb_array_length(coalesce(v_tables->v_table, '[]'::jsonb))
    );
  end loop;
  select coalesce(pg_catalog.jsonb_agg(storage_path), '[]'::jsonb), pg_catalog.count(*)
    into v_old_avatar_paths, v_count from public.user_avatars where user_id = v_uid;
  v_deleted_counts := v_deleted_counts || pg_catalog.jsonb_build_object('avatars', v_count);
  v_counts := v_counts || pg_catalog.jsonb_build_object('avatars', pg_catalog.jsonb_array_length(p_avatar_paths));

  perform pg_catalog.set_config('workbench.restore_mode', 'on', true);

  delete from public.todo_status_history where user_id = v_uid;
  delete from public.entity_links where user_id = v_uid;
  delete from public.ledger_splits where user_id = v_uid;
  delete from public.ledger_reconciliations where user_id = v_uid;
  delete from public.habit_logs where user_id = v_uid;
  delete from public.workout_exercises where user_id = v_uid;
  delete from public.todos where user_id = v_uid;
  delete from public.ledger_entries where user_id = v_uid;
  delete from public.recurrence_rules where user_id = v_uid;
  delete from public.ledger_rules where user_id = v_uid;
  delete from public.ledger_payees where user_id = v_uid;
  delete from public.ledger_accounts where user_id = v_uid;
  delete from public.habits where user_id = v_uid;
  delete from public.goals where user_id = v_uid;
  delete from public.notes where user_id = v_uid;
  delete from public.practice_problems where user_id = v_uid;
  delete from public.workout_sessions where user_id = v_uid;
  delete from public.body_metrics where user_id = v_uid;
  delete from public.pomodoro_sessions where user_id = v_uid;
  delete from public.user_preferences where user_id = v_uid;
  delete from public.inbox_items where user_id = v_uid;
  delete from public.workbench_templates where user_id = v_uid;
  delete from public.saved_views where user_id = v_uid;
  delete from public.user_avatars where user_id = v_uid;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'recurrence_rules', '[]'::jsonb)) loop
    insert into public.recurrence_rules
      (id,user_id,entity_type,frequency,interval_count,weekdays,month_day,start_date,end_date,timezone,local_time,
       enabled,generation_mode,template,materialized_through,skipped_before_window,row_version,created_at,updated_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'entity_type',v_row->>'frequency',coalesce((v_row->>'interval_count')::int,1),
      array(select value::smallint from pg_catalog.jsonb_array_elements_text(coalesce(v_row->'weekdays','[]'::jsonb))),
      nullif(v_row->>'month_day','')::smallint,(v_row->>'start_date')::date,nullif(v_row->>'end_date','')::date,
      coalesce(v_row->>'timezone','Asia/Shanghai'),nullif(v_row->>'local_time','')::time,
      coalesce((v_row->>'enabled')::boolean,true),coalesce((v_row->>'generation_mode'),'manual'),coalesce(v_row->'template','{}'::jsonb),
      nullif(v_row->>'materialized_through','')::date,coalesce((v_row->>'skipped_before_window')::int,0),
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz,pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'ledger_accounts', '[]'::jsonb)) loop
    insert into public.ledger_accounts
      (id,user_id,name,type,opening_balance_minor,archived,row_version,created_at,updated_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'name',coalesce(v_row->>'type','cash'),
      coalesce((v_row->>'opening_balance_minor')::bigint,0),coalesce((v_row->>'archived')::boolean,false),
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'ledger_payees', '[]'::jsonb)) loop
    insert into public.ledger_payees (id,user_id,name,row_version,created_at,updated_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'name',greatest(coalesce((v_row->>'row_version')::bigint,1),1),
      coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()),coalesce((v_row->>'updated_at')::timestamptz,pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'todos', '[]'::jsonb)) loop
    insert into public.todos
      (id,user_id,text,level,done,status,sort_order,due_date,pinned,recurrence_rule_id,occurrence_date,recurrence_detached,row_version,created_at,updated_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'text',coalesce(v_row->>'level','mid'),coalesce((v_row->>'done')::boolean,false),
      coalesce(v_row->>'status',case when coalesce((v_row->>'done')::boolean,false) then 'done' else 'open' end),
      coalesce((v_row->>'sort_order')::bigint,0),nullif(v_row->>'due_date','')::date,coalesce((v_row->>'pinned')::boolean,false),
      nullif(v_row->>'recurrence_rule_id','')::uuid,nullif(v_row->>'occurrence_date','')::date,
      coalesce((v_row->>'recurrence_detached')::boolean,false),greatest(coalesce((v_row->>'row_version')::bigint,1),1),
      coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()),coalesce((v_row->>'updated_at')::timestamptz,pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'todo_status_history', '[]'::jsonb)) loop
    insert into public.todo_status_history (id,user_id,todo_id,action,from_value,to_value,created_at)
    values ((v_row->>'id')::uuid,v_uid,(v_row->>'todo_id')::uuid,v_row->>'action',
      v_row->>'from_value',v_row->>'to_value',coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'habits', '[]'::jsonb)) loop
    insert into public.habits
      (id,user_id,name,emoji,pinned,tracking_type,period_days,target_count,target_value,target_mode,reminder_time,row_version,created_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'name',coalesce(v_row->>'emoji','flame'),coalesce((v_row->>'pinned')::boolean,false),
      coalesce(v_row->>'tracking_type','boolean'),coalesce((v_row->>'period_days')::int,1),coalesce((v_row->>'target_count')::int,1),
      nullif(v_row->>'target_value','')::numeric,coalesce(v_row->>'target_mode','at_least'),nullif(v_row->>'reminder_time','')::time,
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'habit_logs', '[]'::jsonb)) loop
    insert into public.habit_logs (id,habit_id,user_id,log_date,state,value,row_version,created_at)
    values ((v_row->>'id')::uuid,(v_row->>'habit_id')::uuid,v_uid,(v_row->>'log_date')::date,
      coalesce(v_row->>'state','done'),nullif(v_row->>'value','')::numeric,greatest(coalesce((v_row->>'row_version')::bigint,1),1),
      coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'ledger_entries', '[]'::jsonb)) loop
    insert into public.ledger_entries
      (id,user_id,kind,category,amount,amount_minor,currency_code,note,entry_date,status,account_id,payee_id,
       recurrence_rule_id,occurrence_date,reconciled_at,row_version,created_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'kind',v_row->>'category',
      coalesce((v_row->>'amount')::numeric,(v_row->>'amount_minor')::numeric/100),
      coalesce((v_row->>'amount_minor')::bigint,pg_catalog.round((v_row->>'amount')::numeric*100)::bigint),
      coalesce(v_row->>'currency_code','CNY'),v_row->>'note',(v_row->>'entry_date')::date,coalesce(v_row->>'status','posted'),
      nullif(v_row->>'account_id','')::uuid,nullif(v_row->>'payee_id','')::uuid,nullif(v_row->>'recurrence_rule_id','')::uuid,
      nullif(v_row->>'occurrence_date','')::date,nullif(v_row->>'reconciled_at','')::timestamptz,
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'ledger_rules', '[]'::jsonb)) loop
    insert into public.ledger_rules (id,user_id,name,stage,sort_order,enabled,conditions,actions,row_version,created_at,updated_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'name',coalesce(v_row->>'stage','default'),coalesce((v_row->>'sort_order')::bigint,0),
      coalesce((v_row->>'enabled')::boolean,true),coalesce(v_row->'conditions','{}'::jsonb),coalesce(v_row->'actions','{}'::jsonb),
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'ledger_splits', '[]'::jsonb)) loop
    insert into public.ledger_splits (id,user_id,ledger_entry_id,category,amount_minor,note,row_version,created_at)
    values ((v_row->>'id')::uuid,v_uid,(v_row->>'ledger_entry_id')::uuid,v_row->>'category',(v_row->>'amount_minor')::bigint,
      v_row->>'note',greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'ledger_reconciliations', '[]'::jsonb)) loop
    insert into public.ledger_reconciliations (id,user_id,account_id,statement_date,balance_minor,row_version,created_at)
    values ((v_row->>'id')::uuid,v_uid,(v_row->>'account_id')::uuid,(v_row->>'statement_date')::date,(v_row->>'balance_minor')::bigint,
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'goals', '[]'::jsonb)) loop
    insert into public.goals (id,user_id,name,emoji,current,target,unit,note,pinned,row_version,created_at,updated_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'name',coalesce(v_row->>'emoji','target'),coalesce((v_row->>'current')::numeric,0),
      greatest(coalesce((v_row->>'target')::numeric,1),1),v_row->>'unit',v_row->>'note',coalesce((v_row->>'pinned')::boolean,false),
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'notes', '[]'::jsonb)) loop
    insert into public.notes (id,user_id,title,body,tags,pinned,layout,image_url,row_version,created_at,updated_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'title',v_row->>'body',
      array(select value from pg_catalog.jsonb_array_elements_text(coalesce(v_row->'tags','[]'::jsonb))),
      coalesce((v_row->>'pinned')::boolean,false),coalesce(v_row->>'layout','default'),v_row->>'image_url',
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'practice_problems', '[]'::jsonb)) loop
    insert into public.practice_problems
      (id,user_id,title,platform,difficulty,status,tags,url,note,solved_at,row_version,created_at,updated_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'title',coalesce(v_row->>'platform','leetcode'),coalesce(v_row->>'difficulty','medium'),
      coalesce(v_row->>'status','todo'),array(select value from pg_catalog.jsonb_array_elements_text(coalesce(v_row->'tags','[]'::jsonb))),
      v_row->>'url',v_row->>'note',nullif(v_row->>'solved_at','')::date,greatest(coalesce((v_row->>'row_version')::bigint,1),1),
      coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()),coalesce((v_row->>'updated_at')::timestamptz,pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'workout_sessions', '[]'::jsonb)) loop
    insert into public.workout_sessions (id,user_id,date,body_part,duration_min,note,row_version,created_at)
    values ((v_row->>'id')::uuid,v_uid,(v_row->>'date')::date,coalesce(v_row->>'body_part','full'),nullif(v_row->>'duration_min','')::int,
      v_row->>'note',greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'workout_exercises', '[]'::jsonb)) loop
    insert into public.workout_exercises (id,session_id,user_id,name,sets,reps,weight,note,row_version,created_at)
    values ((v_row->>'id')::uuid,(v_row->>'session_id')::uuid,v_uid,v_row->>'name',coalesce((v_row->>'sets')::int,0),
      coalesce((v_row->>'reps')::int,0),coalesce((v_row->>'weight')::numeric,0),v_row->>'note',
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'body_metrics', '[]'::jsonb)) loop
    insert into public.body_metrics (id,user_id,date,weight,body_fat,note,row_version,created_at)
    values ((v_row->>'id')::uuid,v_uid,(v_row->>'date')::date,nullif(v_row->>'weight','')::numeric,nullif(v_row->>'body_fat','')::numeric,
      v_row->>'note',greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'pomodoro_sessions', '[]'::jsonb)) loop
    insert into public.pomodoro_sessions (id,user_id,date,count,minutes,created_at)
    values ((v_row->>'id')::uuid,v_uid,(v_row->>'date')::date,coalesce((v_row->>'count')::int,0),coalesce((v_row->>'minutes')::int,0),
      coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()));
  end loop;

  if pg_catalog.jsonb_array_length(coalesce(v_tables->'user_preferences', '[]'::jsonb)) > 0 then
    v_pref := v_tables->'user_preferences'->0;
    insert into public.user_preferences
      (user_id,categories,monthly_budget,monthly_budget_minor,currency_code,pomodoro,updated_at)
    values (v_uid,coalesce(v_pref->'categories','{"expense":[],"income":[]}'::jsonb),nullif(v_pref->>'monthly_budget','')::numeric,
      nullif(v_pref->>'monthly_budget_minor','')::bigint,coalesce(v_pref->>'currency_code','CNY'),
      coalesce(v_pref->'pomodoro','{"focus":25,"break":5,"long_break":15,"rounds_per_cycle":4}'::jsonb),
      coalesce((v_pref->>'updated_at')::timestamptz,pg_catalog.now()));
  end if;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'inbox_items', '[]'::jsonb)) loop
    insert into public.inbox_items
      (id,user_id,raw_text,source,parsed_candidates,suggested_kind,status,routed_kind,routed_id,row_version,created_at,updated_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'raw_text',coalesce(v_row->>'source','manual'),coalesce(v_row->'parsed_candidates','[]'::jsonb),
      v_row->>'suggested_kind',coalesce(v_row->>'status','pending'),v_row->>'routed_kind',nullif(v_row->>'routed_id','')::uuid,
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'workbench_templates', '[]'::jsonb)) loop
    insert into public.workbench_templates (id,user_id,kind,name,payload,row_version,created_at,updated_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'kind',v_row->>'name',coalesce(v_row->>'payload','{}'::jsonb),
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'saved_views', '[]'::jsonb)) loop
    insert into public.saved_views (id,user_id,entity_kind,name,filters,sort,is_default,row_version,created_at,updated_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'entity_kind',v_row->>'name',coalesce(v_row->>'filters','{}'::jsonb),
      coalesce(v_row->>'sort','[]'::jsonb),coalesce((v_row->>'is_default')::boolean,false),
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'entity_links', '[]'::jsonb)) loop
    insert into public.entity_links (id,user_id,source_kind,source_id,target_kind,target_id,row_version,created_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'source_kind',(v_row->>'source_id')::uuid,v_row->>'target_kind',(v_row->>'target_id')::uuid,
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(p_avatar_paths) loop
    v_path := v_row->>'path';
    insert into public.user_avatars (user_id,storage_path,is_active,created_at)
    values (v_uid,v_path,coalesce((v_row->>'is_active')::boolean,false),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()));
  end loop;

  perform pg_catalog.set_config('workbench.restore_mode', 'off', true);
  update public.user_data_revisions set revision = revision + 1, updated_at = pg_catalog.now() where user_id = v_uid;
  return pg_catalog.jsonb_build_object(
    'old_avatar_paths',v_old_avatar_paths,'counts',v_counts,'deleted_counts',v_deleted_counts,'revision',v_revision + 1
  );
end;
$$;

revoke all on function public.restore_workbench_backup_v7(jsonb,jsonb,bigint) from public,anon,authenticated;
