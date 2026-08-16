-- Backup V7: preserve identifiers for linked entities and extend staged restore
-- while retaining the V1-V3 restore functions for deployed clients.

alter table private.workbench_restore_jobs
  drop constraint if exists workbench_restore_jobs_source_version_check;
alter table private.workbench_restore_jobs
  add constraint workbench_restore_jobs_source_version_check check (source_version between 1 and 7);

create or replace function private.workbench_backup_tables_v7()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'todos','habits','habit_logs','ledger_entries','goals','notes','practice_problems',
    'workout_sessions','workout_exercises','body_metrics','pomodoro_sessions','user_preferences',
    'inbox_items','recurrence_rules','ledger_accounts','ledger_payees','ledger_rules',
    'ledger_splits','ledger_reconciliations','entity_links','workbench_templates','saved_views'
  ]::text[];
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
      coalesce((v_row->>'enabled')::boolean,true),coalesce(v_row->>'generation_mode','manual'),coalesce(v_row->'template','{}'::jsonb),
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
    values ((v_row->>'id')::uuid,v_uid,v_row->>'kind',v_row->>'name',coalesce(v_row->'payload','{}'::jsonb),
      greatest(coalesce((v_row->>'row_version')::bigint,1),1),coalesce((v_row->>'created_at')::timestamptz,pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz,pg_catalog.now()));
  end loop;
  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'saved_views', '[]'::jsonb)) loop
    insert into public.saved_views (id,user_id,entity_kind,name,filters,sort,is_default,row_version,created_at,updated_at)
    values ((v_row->>'id')::uuid,v_uid,v_row->>'entity_kind',v_row->>'name',coalesce(v_row->'filters','{}'::jsonb),
      coalesce(v_row->'sort','[]'::jsonb),coalesce((v_row->>'is_default')::boolean,false),
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

create or replace function public.begin_restore(
  p_expected_revision bigint,
  p_source_version int,
  p_manifest jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid(); v_revision bigint; v_epoch bigint; v_id uuid;
  v_table text; v_expected bigint; v_total bigint := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'expected revision required'; end if;
  if p_source_version not between 1 and 7 then raise exception 'unsupported source backup version'; end if;
  if pg_catalog.jsonb_typeof(p_manifest) <> 'object' then raise exception 'invalid manifest'; end if;
  foreach v_table in array private.workbench_backup_tables_v7() loop
    begin v_expected := coalesce((p_manifest->>v_table)::bigint,0);
    exception when others then raise exception 'invalid manifest count for %',v_table; end;
    if v_expected < 0 or v_expected > 50000 then raise exception 'table row limit exceeded: %',v_table; end if;
    v_total := v_total + v_expected;
  end loop;
  if v_total > 200000 then raise exception 'total row limit exceeded'; end if;
  perform public.lock_user_data_revision(v_uid);
  select revision,restore_epoch into v_revision,v_epoch from public.user_data_revisions where user_id = v_uid;
  if v_revision <> p_expected_revision then raise exception 'revision conflict'; end if;
  delete from private.workbench_restore_jobs where user_id = v_uid and created_at < pg_catalog.now() - interval '24 hours';
  insert into private.workbench_restore_jobs (user_id,expected_revision,expected_epoch,source_version,manifest)
  values (v_uid,v_revision,v_epoch,p_source_version,p_manifest) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.stage_restore_chunk(
  p_restore_id uuid,p_table text,p_chunk_index int,p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid(); v_count int; v_bytes int; v_checksum text; v_existing text;
  v_total_rows bigint; v_total_bytes bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not (p_table = any(private.workbench_backup_tables_v7())) then raise exception 'unsupported restore table'; end if;
  if p_chunk_index is null or p_chunk_index < 0 then raise exception 'invalid chunk index'; end if;
  if pg_catalog.jsonb_typeof(p_rows) <> 'array' then raise exception 'chunk rows must be an array'; end if;
  if not exists (select 1 from private.workbench_restore_jobs where id=p_restore_id and user_id=v_uid and status='staging') then
    raise exception 'restore job not found';
  end if;
  v_count := pg_catalog.jsonb_array_length(p_rows); v_bytes := pg_catalog.octet_length(p_rows::text);
  if v_count > 500 then raise exception 'chunk row limit exceeded'; end if;
  if v_bytes > 1048576 then raise exception 'chunk byte limit exceeded'; end if;
  v_checksum := pg_catalog.md5(p_rows::text);
  select checksum into v_existing from private.workbench_restore_chunks
    where restore_id=p_restore_id and table_name=p_table and chunk_index=p_chunk_index;
  if found then if v_existing <> v_checksum then raise exception 'chunk checksum mismatch'; end if; return; end if;
  select coalesce(pg_catalog.sum(row_count),0),coalesce(pg_catalog.sum(byte_count),0) into v_total_rows,v_total_bytes
    from private.workbench_restore_chunks where restore_id=p_restore_id;
  if v_total_rows+v_count > 200000 then raise exception 'total row limit exceeded'; end if;
  if v_total_bytes+v_bytes > 41943040 then raise exception 'restore byte limit exceeded'; end if;
  insert into private.workbench_restore_chunks (restore_id,table_name,chunk_index,row_count,byte_count,checksum,rows)
    values (p_restore_id,p_table,p_chunk_index,v_count,v_bytes,v_checksum,p_rows);
end;
$$;

create or replace function public.finalize_restore(p_restore_id uuid,p_avatar_paths jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid(); v_job private.workbench_restore_jobs%rowtype; v_table text;
  v_expected bigint; v_actual bigint; v_chunk_count bigint; v_min_chunk int; v_max_chunk int;
  v_rows jsonb; v_tables jsonb := '{}'::jsonb; v_payload jsonb; v_result jsonb; v_epoch bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_job from private.workbench_restore_jobs where id=p_restore_id and user_id=v_uid for update;
  if not found or v_job.status <> 'staging' then raise exception 'restore job not found'; end if;
  if v_job.created_at < pg_catalog.now()-interval '24 hours' then raise exception 'restore job expired'; end if;
  if pg_catalog.jsonb_typeof(p_avatar_paths) <> 'array' or pg_catalog.jsonb_array_length(p_avatar_paths)>5 then raise exception 'invalid avatar paths'; end if;
  update private.workbench_restore_jobs set status='finalizing' where id=p_restore_id;
  foreach v_table in array private.workbench_backup_tables_v7() loop
    v_expected := coalesce((v_job.manifest->>v_table)::bigint,0);
    select coalesce(pg_catalog.sum(row_count),0),pg_catalog.count(*),pg_catalog.min(chunk_index),pg_catalog.max(chunk_index)
      into v_actual,v_chunk_count,v_min_chunk,v_max_chunk from private.workbench_restore_chunks
      where restore_id=p_restore_id and table_name=v_table;
    if v_actual <> v_expected then raise exception 'restore manifest mismatch: %',v_table; end if;
    if v_expected=0 and v_chunk_count<>0 then raise exception 'unexpected empty-table chunks: %',v_table; end if;
    if v_expected>0 and (v_min_chunk<>0 or v_max_chunk+1<>v_chunk_count) then raise exception 'missing restore chunks: %',v_table; end if;
    select coalesce(pg_catalog.jsonb_agg(item.value order by c.chunk_index,item.ordinality),'[]'::jsonb) into v_rows
      from private.workbench_restore_chunks c
      cross join lateral pg_catalog.jsonb_array_elements(c.rows) with ordinality as item(value,ordinality)
      where c.restore_id=p_restore_id and c.table_name=v_table;
    v_tables := pg_catalog.jsonb_set(v_tables,array[v_table],v_rows,true);
  end loop;
  select restore_epoch into v_epoch from public.user_data_revisions where user_id=v_uid for update;
  if v_epoch<>v_job.expected_epoch then raise exception 'restore epoch conflict'; end if;
  v_payload := pg_catalog.jsonb_build_object('metadata',pg_catalog.jsonb_build_object(
    'version',7,'source_version',v_job.source_version,'source_revision',v_job.expected_revision),'tables',v_tables);
  v_result := public.restore_workbench_backup_v7(v_payload,p_avatar_paths,v_job.expected_revision);
  update public.user_data_revisions set restore_epoch=restore_epoch+1,updated_at=pg_catalog.now()
    where user_id=v_uid returning restore_epoch into v_epoch;
  delete from private.workbench_restore_jobs where id=p_restore_id;
  return v_result || pg_catalog.jsonb_build_object('restore_epoch',v_epoch);
end;
$$;

revoke all on function private.workbench_backup_tables_v7() from public,anon,authenticated;
revoke all on function public.restore_workbench_backup_v7(jsonb,jsonb,bigint) from public,anon,authenticated;
revoke all on function public.begin_restore(bigint,int,jsonb) from public,anon;
revoke all on function public.stage_restore_chunk(uuid,text,int,jsonb) from public,anon;
revoke all on function public.finalize_restore(uuid,jsonb) from public,anon;
grant execute on function public.begin_restore(bigint,int,jsonb) to authenticated;
grant execute on function public.stage_restore_chunk(uuid,text,int,jsonb) to authenticated;
grant execute on function public.finalize_restore(uuid,jsonb) to authenticated;
