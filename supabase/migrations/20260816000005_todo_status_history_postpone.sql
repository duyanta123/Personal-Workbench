-- Todo lifecycle history & postpone:
-- 1. todo_status_history 记录 done/skipped/reopened/postponed 状态流转（物化路径豁免）；
-- 2. 延期 = 标准 V2 update 修改 occurrence_date/due_date，由触发器记 postponed 并 detached；
-- 3. mark_recurrence_todo_detached 触发器扩展到全部用户可改字段（text/level/due_date/pinned/
--    sort_order/status/occurrence_date）；
-- 4. todo_status_history 纳入 V7 备份（可选表，缺失默认空数组，不升版本号）。

create table if not exists public.todo_status_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  todo_id uuid not null references public.todos(id) on delete cascade,
  action text not null check (action in ('done','skipped','reopened','postponed')),
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);

create index if not exists todo_status_history_todo_idx
  on public.todo_status_history (user_id, todo_id, created_at desc);

alter table public.todo_status_history enable row level security;

drop policy if exists "own todo history" on public.todo_status_history;
create policy "own todo history" on public.todo_status_history
  for select using (auth.uid() = user_id);

-- 历史只由触发器（security definer）写入，客户端仅可读。
grant select on table public.todo_status_history to authenticated;

alter table public.todo_status_history add column if not exists row_version bigint not null default 1;
drop trigger if exists todo_status_history_row_version on public.todo_status_history;
create trigger todo_status_history_row_version before update on public.todo_status_history
  for each row execute function public.bump_row_version();

create or replace function public.record_todo_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 物化/恢复路径的批量变更不记历史。
  if current_setting('workbench.recurrence_apply', true) = 'on'
    or current_setting('workbench.restore_mode', true) = 'on' then
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.todo_status_history (user_id, todo_id, action, from_value, to_value)
    values (new.user_id, new.id,
      case new.status when 'done' then 'done' when 'skipped' then 'skipped' else 'reopened' end,
      old.status, new.status);
  end if;
  if new.occurrence_date is distinct from old.occurrence_date then
    insert into public.todo_status_history (user_id, todo_id, action, from_value, to_value)
    values (new.user_id, new.id, 'postponed', old.occurrence_date::text, new.occurrence_date::text);
  end if;
  return new;
end;
$$;

drop trigger if exists todos_record_status_history on public.todos;
create trigger todos_record_status_history
after update on public.todos
for each row execute function public.record_todo_status_history();

revoke all on function public.record_todo_status_history() from public, anon, authenticated;

-- detached 触发器扩展：任何用户手动修改（含完成/跳过/排序/延期）都使周期实例独立。
create or replace function public.mark_recurrence_todo_detached()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- current_setting(..., true) 在 GUC 未设置时返回 NULL，NULL <> 'on' 结果为 NULL（假），
  -- 会导致普通用户手动修改不标记 detached —— 必须 coalesce 成空串再比较。
  if new.recurrence_rule_id is not null
    and coalesce(current_setting('workbench.recurrence_apply', true), '') <> 'on'
    and (new.text,new.level,new.due_date,new.pinned,new.sort_order,new.status,new.occurrence_date)
      is distinct from
     (old.text,old.level,old.due_date,old.pinned,old.sort_order,old.status,old.occurrence_date)
  then new.recurrence_detached := true; end if;
  return new;
end;
$$;

drop trigger if exists todos_mark_recurrence_detached on public.todos;
create trigger todos_mark_recurrence_detached
before update of text,level,due_date,pinned,sort_order,status,occurrence_date on public.todos
for each row execute function public.mark_recurrence_todo_detached();

-- ---- 备份纳入 todo_status_history（V7 可选表）----

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
    'ledger_splits','ledger_reconciliations','entity_links','workbench_templates','saved_views',
    'todo_status_history'
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

  perform pg_catalog.pg_advisory_xct_lock(pg_catalog.hashtextextended('avatar:' || v_uid::text, 0));
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

revoke all on function public.restore_workbench_backup_v7(jsonb,jsonb,bigint) from public,anon,authenticated;
