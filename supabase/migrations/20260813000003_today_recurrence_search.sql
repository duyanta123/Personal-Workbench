-- Today workspace, recurrence materialization, Inbox routing, and unified search.

create or replace function public.get_today_workspace(p_date date, p_timezone text default 'Asia/Shanghai')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_date is null then raise exception 'date required'; end if;
  perform p_date::timestamp at time zone p_timezone;
  return pg_catalog.jsonb_build_object(
    'inbox', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) order by i.created_at desc)
      from (select * from public.inbox_items where user_id=v_uid and status='pending' order by created_at desc limit 20) i), '[]'::jsonb),
    'todos', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by t.due_date nulls last, t.pinned desc, t.sort_order)
      from (select * from public.todos where user_id=v_uid and status='open' and (due_date is null or due_date <= p_date)
        order by due_date nulls last, pinned desc, sort_order limit 50) t), '[]'::jsonb),
    'habits', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(h) order by h.pinned desc, h.created_at)
      from (select * from public.habits where user_id=v_uid order by pinned desc, created_at limit 50) h), '[]'::jsonb),
    'habit_logs', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) order by l.created_at)
      from public.habit_logs l where l.user_id=v_uid and l.log_date=p_date), '[]'::jsonb),
    'planned_ledger', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) order by e.entry_date, e.created_at)
      from (select * from public.ledger_entries where user_id=v_uid and status='planned' and entry_date <= p_date order by entry_date, created_at limit 50) e), '[]'::jsonb)
  );
end;
$$;

create or replace function public.route_inbox_item(
  p_command_id uuid,
  p_item_id uuid,
  p_kind text,
  p_payload jsonb,
  p_target_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.inbox_items;
  v_data jsonb;
  v_previous private.workbench_operation_receipts%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_command_id is null or p_item_id is null or p_target_id is null then raise exception 'ids required'; end if;
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid payload'; end if;
  perform public.lock_user_data_revision(v_uid);
  select * into v_previous from private.workbench_operation_receipts where user_id=v_uid and operation_id=p_command_id;
  if found then return pg_catalog.jsonb_set(v_previous.response, '{status}', '"duplicate"'::jsonb, true); end if;
  select * into v_item from public.inbox_items where id=p_item_id and user_id=v_uid for update;
  if not found then return public.command_result('not_found', p_command_id, p_target_id, null, null, array[]::text[], 'inbox item not found'); end if;
  if v_item.status='routed' then
    return public.command_result('duplicate', p_command_id, coalesce(v_item.routed_id,p_target_id), pg_catalog.to_jsonb(v_item));
  end if;
  case p_kind
    when 'todo' then
      insert into public.todos(id,user_id,text,level,due_date,pinned,done,status)
      values(p_target_id,v_uid,p_payload->>'text',coalesce(p_payload->>'level','mid'),nullif(p_payload->>'due_date','')::date,
        coalesce((p_payload->>'pinned')::boolean,false),coalesce((p_payload->>'done')::boolean,false),
        case when coalesce((p_payload->>'done')::boolean,false) then 'done' else 'open' end) returning pg_catalog.to_jsonb(public.todos.*) into v_data;
    when 'ledger' then
      insert into public.ledger_entries(id,user_id,kind,category,amount,amount_minor,currency_code,note,entry_date,status)
      values(p_target_id,v_uid,p_payload->>'kind',p_payload->>'category',coalesce((p_payload->>'amount')::numeric,(p_payload->>'amount_minor')::numeric/100),
        coalesce((p_payload->>'amount_minor')::bigint,pg_catalog.round((p_payload->>'amount')::numeric*100)::bigint),coalesce(p_payload->>'currency_code','CNY'),
        p_payload->>'note',(p_payload->>'entry_date')::date,coalesce(p_payload->>'status','posted')) returning pg_catalog.to_jsonb(public.ledger_entries.*) into v_data;
    when 'note' then
      insert into public.notes(id,user_id,title,body,tags,pinned,layout,image_url)
      values(p_target_id,v_uid,p_payload->>'title',p_payload->>'body',array(select pg_catalog.jsonb_array_elements_text(coalesce(p_payload->'tags','[]'::jsonb))),
        coalesce((p_payload->>'pinned')::boolean,false),coalesce(p_payload->>'layout','default'),p_payload->>'image_url') returning pg_catalog.to_jsonb(public.notes.*) into v_data;
    when 'habit' then
      insert into public.habits(id,user_id,name,emoji,pinned,tracking_type,period_days,target_count,target_value,target_mode,reminder_time)
      values(p_target_id,v_uid,p_payload->>'name',coalesce(p_payload->>'emoji','flame'),coalesce((p_payload->>'pinned')::boolean,false),
        coalesce(p_payload->>'tracking_type','boolean'),coalesce((p_payload->>'period_days')::int,1),coalesce((p_payload->>'target_count')::int,1),
        nullif(p_payload->>'target_value','')::numeric,coalesce(p_payload->>'target_mode','at_least'),nullif(p_payload->>'reminder_time','')::time)
      returning pg_catalog.to_jsonb(public.habits.*) into v_data;
    when 'goal' then
      insert into public.goals(id,user_id,name,emoji,current,target,unit,note,pinned)
      values(p_target_id,v_uid,p_payload->>'name',coalesce(p_payload->>'emoji','target'),coalesce((p_payload->>'current')::numeric,0),
        (p_payload->>'target')::numeric,p_payload->>'unit',p_payload->>'note',coalesce((p_payload->>'pinned')::boolean,false)) returning pg_catalog.to_jsonb(public.goals.*) into v_data;
    when 'practice' then
      insert into public.practice_problems(id,user_id,title,platform,difficulty,status,tags,url,note,solved_at)
      values(p_target_id,v_uid,p_payload->>'title',coalesce(p_payload->>'platform','leetcode'),coalesce(p_payload->>'difficulty','medium'),
        coalesce(p_payload->>'status','todo'),array(select pg_catalog.jsonb_array_elements_text(coalesce(p_payload->'tags','[]'::jsonb))),
        p_payload->>'url',p_payload->>'note',nullif(p_payload->>'solved_at','')::date) returning pg_catalog.to_jsonb(public.practice_problems.*) into v_data;
    when 'workout' then
      insert into public.workout_sessions(id,user_id,date,body_part,duration_min,note)
      values(p_target_id,v_uid,(p_payload->>'date')::date,coalesce(p_payload->>'body_part','full'),nullif(p_payload->>'duration_min','')::int,p_payload->>'note')
      returning pg_catalog.to_jsonb(public.workout_sessions.*) into v_data;
    else raise exception 'unsupported inbox route';
  end case;
  update public.inbox_items set status='routed',routed_kind=p_kind,routed_id=p_target_id,updated_at=pg_catalog.now()
  where id=p_item_id and user_id=v_uid;
  v_data := pg_catalog.jsonb_build_object('target',v_data,'inbox_item',pg_catalog.to_jsonb(v_item));
  insert into private.workbench_operation_receipts(user_id,operation_id,restore_epoch,operation_kind,response)
  select v_uid,p_command_id,restore_epoch,'inbox.route',public.command_result('applied',p_command_id,p_target_id,v_data)
  from public.user_data_revisions where user_id=v_uid;
  return public.command_result('applied',p_command_id,p_target_id,v_data);
end;
$$;

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
  v_from date := p_today - 7;
  v_to date := p_today + 30;
  v_matches boolean;
  v_todos int := 0;
  v_ledger int := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_today is null then raise exception 'today required'; end if;
  perform p_today::timestamp at time zone p_timezone;
  for v_rule in select * from public.recurrence_rules where user_id=v_uid and enabled order by id loop
    for v_date in select d::date from pg_catalog.generate_series(
      pg_catalog.greatest(v_rule.start_date,v_from)::timestamp,
      pg_catalog.least(coalesce(v_rule.end_date,v_to),v_to)::timestamp,
      interval '1 day') d
    loop
      v_matches := case v_rule.frequency
        when 'daily' then (v_date-v_rule.start_date) % v_rule.interval_count = 0
        when 'weekly' then ((v_date-v_rule.start_date)/7) % v_rule.interval_count = 0
          and (pg_catalog.cardinality(v_rule.weekdays)=0 or extract(dow from v_date)::int = any(v_rule.weekdays))
        when 'monthly' then ((extract(year from v_date)::int*12+extract(month from v_date)::int)
          -(extract(year from v_rule.start_date)::int*12+extract(month from v_rule.start_date)::int)) % v_rule.interval_count = 0
          and extract(day from v_date)::int = pg_catalog.least(coalesce(v_rule.month_day,extract(day from v_rule.start_date)::int),extract(day from (pg_catalog.date_trunc('month',v_date)+interval '1 month-1 day'))::int)
        when 'yearly' then (extract(year from v_date)::int-extract(year from v_rule.start_date)::int) % v_rule.interval_count = 0
          and extract(month from v_date)=extract(month from v_rule.start_date)
          and extract(day from v_date)::int=pg_catalog.least(coalesce(v_rule.month_day,extract(day from v_rule.start_date)::int),extract(day from (pg_catalog.date_trunc('month',v_date)+interval '1 month-1 day'))::int)
        else false end;
      if v_matches and v_rule.entity_type='todo' then
        insert into public.todos(user_id,text,level,done,status,pinned,due_date,recurrence_rule_id,occurrence_date)
        values(v_uid,v_rule.template->>'text',coalesce(v_rule.template->>'level','mid'),false,'open',coalesce((v_rule.template->>'pinned')::boolean,false),v_date,v_rule.id,v_date)
        on conflict (user_id,recurrence_rule_id,occurrence_date) where recurrence_rule_id is not null do nothing;
        if found then v_todos:=v_todos+1; end if;
      elsif v_matches and v_rule.entity_type='ledger' then
        insert into public.ledger_entries(user_id,kind,category,amount,amount_minor,currency_code,note,entry_date,status,recurrence_rule_id,occurrence_date)
        values(v_uid,v_rule.template->>'kind',v_rule.template->>'category',coalesce((v_rule.template->>'amount')::numeric,(v_rule.template->>'amount_minor')::numeric/100),
          coalesce((v_rule.template->>'amount_minor')::bigint,pg_catalog.round((v_rule.template->>'amount')::numeric*100)::bigint),coalesce(v_rule.template->>'currency_code','CNY'),
          v_rule.template->>'note',v_date,case when v_rule.generation_mode='automatic' then 'posted' else 'planned' end,v_rule.id,v_date)
        on conflict (user_id,recurrence_rule_id,occurrence_date) where recurrence_rule_id is not null do nothing;
        if found then v_ledger:=v_ledger+1; end if;
      end if;
    end loop;
    update public.recurrence_rules set
      skipped_before_window=skipped_before_window+case when materialized_through is null then 0 else pg_catalog.greatest(0,v_from-materialized_through-1) end,
      materialized_through=pg_catalog.greatest(coalesce(materialized_through,v_to),v_to)
    where id=v_rule.id;
  end loop;
  return pg_catalog.jsonb_build_object('todos',v_todos,'ledger',v_ledger,'from',v_from,'through',v_to);
end;
$$;

create or replace function public.search_workbench_v2(p_query text, p_limit int default 8)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_q text := pg_catalog.trim(p_query); v_limit int := pg_catalog.least(pg_catalog.greatest(p_limit,1),25);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_q='' then return '[]'::jsonb; end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'kind',kind,'id',id,'title',title,'subtitle',subtitle,'route',route,'matchField',match_field,'updatedAt',updated_at
    ) order by rank desc,updated_at desc,id) from (
      select * from (
        select 'todo' kind,id,text title,due_date::text subtitle,'/todos?focus='||id route,'text' match_field,updated_at,extensions.similarity(text,v_q) rank from public.todos where user_id=v_uid and text ilike '%'||v_q||'%'
        union all select 'habit',id,name,null,'/checkins?focus='||id,'name',created_at,extensions.similarity(name,v_q) from public.habits where user_id=v_uid and name ilike '%'||v_q||'%'
        union all select 'ledger',id,coalesce(note,category),category,'/ledger?focus='||id,'note',created_at,extensions.similarity(coalesce(note,category),v_q) from public.ledger_entries where user_id=v_uid and (note ilike '%'||v_q||'%' or category ilike '%'||v_q||'%')
        union all select 'goal',id,name,unit,'/goals?focus='||id,'name',updated_at,extensions.similarity(name,v_q) from public.goals where user_id=v_uid and name ilike '%'||v_q||'%'
        union all select 'note',id,coalesce(title,pg_catalog.left(body,80)),pg_catalog.left(body,120),'/notes?focus='||id,case when title ilike '%'||v_q||'%' then 'title' else 'body' end,updated_at,pg_catalog.greatest(extensions.similarity(coalesce(title,''),v_q),extensions.similarity(body,v_q)) from public.notes where user_id=v_uid and (title ilike '%'||v_q||'%' or body ilike '%'||v_q||'%')
        union all select 'practice',id,title,platform,'/practice?focus='||id,'title',updated_at,extensions.similarity(title,v_q) from public.practice_problems where user_id=v_uid and (title ilike '%'||v_q||'%' or note ilike '%'||v_q||'%')
        union all select 'workout',id,body_part,note,'/workout?focus='||id,'body_part',created_at,extensions.similarity(body_part,v_q) from public.workout_sessions where user_id=v_uid and (body_part ilike '%'||v_q||'%' or note ilike '%'||v_q||'%')
        union all select 'inbox',id,pg_catalog.left(raw_text,100),null,'/?focus='||id,'raw_text',updated_at,extensions.similarity(raw_text,v_q) from public.inbox_items where user_id=v_uid and raw_text ilike '%'||v_q||'%'
      ) matches order by rank desc,updated_at desc limit v_limit
    ) limited
  ),'[]'::jsonb);
end;
$$;

create or replace function public.validate_entity_link_ownership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_source_table text; v_target_table text;
begin
  if new.user_id<>auth.uid() then raise exception 'link owner mismatch'; end if;
  v_source_table:=case new.source_kind when 'todo' then 'todos' when 'habit' then 'habits' when 'ledger' then 'ledger_entries' when 'goal' then 'goals' when 'note' then 'notes' when 'practice' then 'practice_problems' when 'workout' then 'workout_sessions' end;
  v_target_table:=case new.target_kind when 'todo' then 'todos' when 'habit' then 'habits' when 'ledger' then 'ledger_entries' when 'goal' then 'goals' when 'note' then 'notes' when 'practice' then 'practice_problems' when 'workout' then 'workout_sessions' end;
  if v_source_table is null or v_target_table is null then raise exception 'invalid link kind'; end if;
  if not exists(select 1 from public.entity_owned(v_source_table,new.source_id,new.user_id))
    or not exists(select 1 from public.entity_owned(v_target_table,new.target_id,new.user_id)) then raise exception 'linked entity not owned'; end if;
  return new;
end; $$;

create or replace function public.entity_owned(p_table text,p_id uuid,p_user uuid)
returns table(ok boolean) language plpgsql security definer set search_path = '' as $$
begin return query execute pg_catalog.format('select true from public.%I where id=$1 and user_id=$2',p_table) using p_id,p_user; end; $$;
drop trigger if exists entity_links_ownership on public.entity_links;
create trigger entity_links_ownership before insert or update on public.entity_links for each row execute function public.validate_entity_link_ownership();

revoke all on function public.get_today_workspace(date,text) from public,anon;
revoke all on function public.route_inbox_item(uuid,uuid,text,jsonb,uuid) from public,anon;
revoke all on function public.materialize_recurrences(date,text) from public,anon;
revoke all on function public.search_workbench_v2(text,int) from public,anon;
revoke all on function public.entity_owned(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.validate_entity_link_ownership() from public,anon,authenticated;
grant execute on function public.get_today_workspace(date,text) to authenticated;
grant execute on function public.route_inbox_item(uuid,uuid,text,jsonb,uuid) to authenticated;
grant execute on function public.materialize_recurrences(date,text) to authenticated;
grant execute on function public.search_workbench_v2(text,int) to authenticated;
