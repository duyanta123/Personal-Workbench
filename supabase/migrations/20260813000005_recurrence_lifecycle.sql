-- Recurrence lifecycle: detach edited todo instances, retain completed/posted history,
-- and account for occurrences skipped before the materialization window.

create or replace function public.mark_recurrence_todo_detached()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recurrence_rule_id is not null
    and current_setting('workbench.recurrence_apply', true) <> 'on'
    and (new.text,new.level,new.due_date,new.pinned) is distinct from (old.text,old.level,old.due_date,old.pinned)
  then new.recurrence_detached := true; end if;
  return new;
end;
$$;

drop trigger if exists todos_mark_recurrence_detached on public.todos;
create trigger todos_mark_recurrence_detached
before update of text,level,due_date,pinned on public.todos
for each row execute function public.mark_recurrence_todo_detached();

create or replace function public.reset_future_recurrence_instances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.entity_type,new.frequency,new.interval_count,new.weekdays,new.month_day,new.start_date,new.end_date,
      new.timezone,new.generation_mode,new.template,new.enabled)
    is not distinct from
     (old.entity_type,old.frequency,old.interval_count,old.weekdays,old.month_day,old.start_date,old.end_date,
      old.timezone,old.generation_mode,old.template,old.enabled)
  then return new; end if;

  perform pg_catalog.set_config('workbench.recurrence_apply','on',true);
  delete from public.todos
    where user_id=new.user_id and recurrence_rule_id=new.id and occurrence_date>current_date
      and status='open' and not recurrence_detached;
  delete from public.ledger_entries
    where user_id=new.user_id and recurrence_rule_id=new.id and occurrence_date>current_date and status='planned';
  update public.recurrence_rules set materialized_through=current_date-1 where id=new.id;
  perform pg_catalog.set_config('workbench.recurrence_apply','off',true);
  return new;
end;
$$;

drop trigger if exists recurrence_rules_reset_future on public.recurrence_rules;
create trigger recurrence_rules_reset_future
after update on public.recurrence_rules
for each row execute function public.reset_future_recurrence_instances();

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

  for v_rule in select * from public.recurrence_rules where user_id=v_uid and enabled order by id loop
    v_skipped := 0;
    v_skip_from := pg_catalog.greatest(v_rule.start_date,coalesce(v_rule.materialized_through+1,v_rule.start_date));
    if v_skip_from < v_from then
      for v_date in select d::date from pg_catalog.generate_series(v_skip_from::timestamp,(v_from-1)::timestamp,interval '1 day') d loop
        v_matches := case v_rule.frequency
          when 'daily' then (v_date-v_rule.start_date)%v_rule.interval_count=0
          when 'weekly' then ((v_date-v_rule.start_date)/7)%v_rule.interval_count=0
            and (pg_catalog.cardinality(v_rule.weekdays)=0 or extract(dow from v_date)::int=any(v_rule.weekdays))
          when 'monthly' then ((extract(year from v_date)::int*12+extract(month from v_date)::int)
            -(extract(year from v_rule.start_date)::int*12+extract(month from v_rule.start_date)::int))%v_rule.interval_count=0
            and extract(day from v_date)::int=pg_catalog.least(coalesce(v_rule.month_day,extract(day from v_rule.start_date)::int),
              extract(day from (pg_catalog.date_trunc('month',v_date)+interval '1 month-1 day'))::int)
          when 'yearly' then (extract(year from v_date)::int-extract(year from v_rule.start_date)::int)%v_rule.interval_count=0
            and extract(month from v_date)=extract(month from v_rule.start_date)
            and extract(day from v_date)::int=pg_catalog.least(coalesce(v_rule.month_day,extract(day from v_rule.start_date)::int),
              extract(day from (pg_catalog.date_trunc('month',v_date)+interval '1 month-1 day'))::int)
          else false end;
        if v_matches and (v_rule.end_date is null or v_date<=v_rule.end_date) then v_skipped:=v_skipped+1; end if;
      end loop;
    end if;

    for v_date in select d::date from pg_catalog.generate_series(
      pg_catalog.greatest(v_rule.start_date,v_from)::timestamp,
      pg_catalog.least(coalesce(v_rule.end_date,v_to),v_to)::timestamp,interval '1 day') d
    loop
      v_matches := case v_rule.frequency
        when 'daily' then (v_date-v_rule.start_date)%v_rule.interval_count=0
        when 'weekly' then ((v_date-v_rule.start_date)/7)%v_rule.interval_count=0
          and (pg_catalog.cardinality(v_rule.weekdays)=0 or extract(dow from v_date)::int=any(v_rule.weekdays))
        when 'monthly' then ((extract(year from v_date)::int*12+extract(month from v_date)::int)
          -(extract(year from v_rule.start_date)::int*12+extract(month from v_rule.start_date)::int))%v_rule.interval_count=0
          and extract(day from v_date)::int=pg_catalog.least(coalesce(v_rule.month_day,extract(day from v_rule.start_date)::int),
            extract(day from (pg_catalog.date_trunc('month',v_date)+interval '1 month-1 day'))::int)
        when 'yearly' then (extract(year from v_date)::int-extract(year from v_rule.start_date)::int)%v_rule.interval_count=0
          and extract(month from v_date)=extract(month from v_rule.start_date)
          and extract(day from v_date)::int=pg_catalog.least(coalesce(v_rule.month_day,extract(day from v_rule.start_date)::int),
            extract(day from (pg_catalog.date_trunc('month',v_date)+interval '1 month-1 day'))::int)
        else false end;
      if v_matches and v_rule.entity_type='todo' then
        insert into public.todos(user_id,text,level,done,status,pinned,due_date,recurrence_rule_id,occurrence_date)
        values(v_uid,v_rule.template->>'text',coalesce(v_rule.template->>'level','mid'),false,'open',
          coalesce((v_rule.template->>'pinned')::boolean,false),v_date,v_rule.id,v_date)
        on conflict (user_id,recurrence_rule_id,occurrence_date) where recurrence_rule_id is not null do nothing;
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
    update public.recurrence_rules set materialized_through=pg_catalog.greatest(coalesce(materialized_through,start_date),v_to),
      skipped_before_window=skipped_before_window+v_skipped where id=v_rule.id and user_id=v_uid;
  end loop;
  perform pg_catalog.set_config('workbench.recurrence_apply','off',true);
  return pg_catalog.jsonb_build_object('todos',v_todos,'ledger_entries',v_ledger,'through',v_to);
end;
$$;

revoke all on function public.mark_recurrence_todo_detached() from public,anon,authenticated;
revoke all on function public.reset_future_recurrence_instances() from public,anon,authenticated;
revoke all on function public.materialize_recurrences(date,text) from public,anon;
grant execute on function public.materialize_recurrences(date,text) to authenticated;
