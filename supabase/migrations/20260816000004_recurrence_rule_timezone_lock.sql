-- Recurrence hardening:
-- 1. The occurrence-matching algorithm is extracted into an immutable function
--    so month-end clamping, leap years, weekday filters and interval math can
--    be unit-tested for arbitrary dates (the materialization window itself is
--    bound to "now" and cannot reach historical/future dates in tests).
-- 2. The materialization window is now computed in the rule's own IANA
--    timezone (previously the caller-supplied timezone was only validated and
--    matching ran on timezone-less dates).
-- 3. Per-rule row locks prevent concurrent tabs from double-counting
--    skipped_before_window.
-- local_time stays a display-only field (see ADR 0005).

create or replace function public.recurrence_occurrence_matches(
  p_frequency text,
  p_interval_count int,
  p_weekdays smallint[],
  p_month_day smallint,
  p_start_date date,
  p_date date
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_frequency
    when 'daily' then (p_date - p_start_date) % p_interval_count = 0
    when 'weekly' then ((p_date - p_start_date) / 7) % p_interval_count = 0
      and (pg_catalog.cardinality(p_weekdays) = 0
        or extract(dow from p_date)::int = any(p_weekdays))
    when 'monthly' then (
        (extract(year from p_date)::int * 12 + extract(month from p_date)::int)
        - (extract(year from p_start_date)::int * 12 + extract(month from p_start_date)::int)
      ) % p_interval_count = 0
      and extract(day from p_date)::int = least(
        coalesce(p_month_day, extract(day from p_start_date)::int),
        extract(day from (pg_catalog.date_trunc('month', p_date) + interval '1 month - 1 day'))::int)
    when 'yearly' then (extract(year from p_date)::int - extract(year from p_start_date)::int) % p_interval_count = 0
      and extract(month from p_date) = extract(month from p_start_date)
      and extract(day from p_date)::int = least(
        coalesce(p_month_day, extract(day from p_start_date)::int),
        extract(day from (pg_catalog.date_trunc('month', p_date) + interval '1 month - 1 day'))::int)
    else false
  end;
$$;

revoke all on function public.recurrence_occurrence_matches(text,int,smallint[],smallint,date,date) from public, anon, authenticated;

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
    update public.recurrence_rules set materialized_through=greatest(coalesce(materialized_through,start_date),v_to),
      skipped_before_window=skipped_before_window+v_skipped where id=v_rule.id and user_id=v_uid;
  end loop;
  perform pg_catalog.set_config('workbench.recurrence_apply','off',true);
  return pg_catalog.jsonb_build_object('todos',v_todos,'ledger_entries',v_ledger,'through',v_to);
end;
$$;

revoke all on function public.materialize_recurrences(date,text) from public,anon;
grant execute on function public.materialize_recurrences(date,text) to authenticated;
