-- Suggestions only: no rule is created until the user confirms it in the client.

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
        pg_catalog.coalesce(pg_catalog.bool_and(gap_days between 6 and 8) filter(where gap_days is not null),false) weekly,
        pg_catalog.coalesce(pg_catalog.bool_and(gap_days between 25 and 34) filter(where gap_days is not null),false) monthly
      from ordered group by kind,category,currency_code,account_id,payee_id having pg_catalog.count(*)>=3
    ), eligible as (
      select *,case when weekly then 'weekly' else 'monthly' end frequency from candidates
      where (weekly or monthly) and amount_spread<=pg_catalog.greatest(pg_catalog.round(amount_minor*0.05)::bigint,100)
    )
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key',kind||':'||category||':'||currency_code||':'||pg_catalog.coalesce(account_id::text,'')||':'||pg_catalog.coalesce(payee_id::text,''),
      'frequency',frequency,'occurrences',occurrences,'start_date',first_date,
      'weekdays',case when frequency='weekly' then pg_catalog.jsonb_build_array(extract(dow from first_date)::int) else '[]'::jsonb end,
      'month_day',case when frequency='monthly' then extract(day from first_date)::int else null end,
      'template',pg_catalog.jsonb_build_object('kind',kind,'category',category,'amount_minor',amount_minor,'currency_code',currency_code,'note',null)
    ) order by occurrences desc,last_date desc)
    from eligible c where not exists(
      select 1 from public.recurrence_rules r where r.user_id=v_uid and r.entity_type='ledger' and r.frequency=c.frequency
        and r.template->>'kind'=c.kind and r.template->>'category'=c.category
        and pg_catalog.abs((r.template->>'amount_minor')::bigint-c.amount_minor)<=pg_catalog.greatest(pg_catalog.round(c.amount_minor*0.05)::bigint,100)
    )
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.suggest_ledger_recurrences(date) from public,anon;
grant execute on function public.suggest_ledger_recurrences(date) to authenticated;
