-- Keep existing dashboard payloads stable while sourcing all financial values from
-- posted integer-minor-unit entries. Planned entries remain visible only in Upcoming.

create or replace function public.get_dashboard_summary_v2(p_date date,p_month text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_start date:=public.workbench_month_start(p_month); v_end date:=(v_start+interval '1 month')::date;
  v_base jsonb; v_overview jsonb; v_categories jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_base:=public.get_dashboard_summary(p_date,p_month);
  v_overview:=v_base->'overview'||pg_catalog.jsonb_build_object(
    'ledger_total',(select pg_catalog.count(*) from public.ledger_entries where user_id=v_uid and status='posted'),
    'month_income',coalesce((select pg_catalog.sum(amount_minor)::numeric/100 from public.ledger_entries where user_id=v_uid and status='posted' and kind='income' and entry_date>=v_start and entry_date<v_end),0),
    'month_expense',coalesce((select pg_catalog.sum(amount_minor)::numeric/100 from public.ledger_entries where user_id=v_uid and status='posted' and kind='expense' and entry_date>=v_start and entry_date<v_end),0)
  );
  v_categories:=coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(category,total_minor::numeric/100) order by total_minor desc,category)
    from (select category,pg_catalog.sum(amount_minor) total_minor from public.ledger_entries
      where user_id=v_uid and status='posted' and kind='expense' and entry_date>=v_start and entry_date<v_end group by category)x),'[]'::jsonb);
  return pg_catalog.jsonb_set(pg_catalog.jsonb_set(v_base,'{overview}',v_overview,true),'{expense_categories}',v_categories,true);
end;
$$;

create or replace function public.get_workbench_insights_v2(p_date date,p_month text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_start date:=public.workbench_month_start(p_month); v_end date:=(v_start+interval '1 month')::date; v_base jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_base:=public.get_workbench_insights(p_date,p_month);
  return pg_catalog.jsonb_set(v_base,'{ledger}',pg_catalog.jsonb_build_object(
    'income',coalesce((select pg_catalog.sum(amount_minor)::numeric/100 from public.ledger_entries where user_id=v_uid and status='posted' and kind='income' and entry_date>=v_start and entry_date<v_end),0),
    'expense',coalesce((select pg_catalog.sum(amount_minor)::numeric/100 from public.ledger_entries where user_id=v_uid and status='posted' and kind='expense' and entry_date>=v_start and entry_date<v_end),0)
  ),true);
end;
$$;

revoke all on function public.get_dashboard_summary_v2(date,text) from public,anon;
revoke all on function public.get_workbench_insights_v2(date,text) from public,anon;
grant execute on function public.get_dashboard_summary_v2(date,text) to authenticated;
grant execute on function public.get_workbench_insights_v2(date,text) to authenticated;
