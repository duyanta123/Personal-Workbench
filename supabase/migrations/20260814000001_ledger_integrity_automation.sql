-- Ledger correctness and automation: default accounts, validated rules,
-- deferred split balancing, idempotent transaction creation and reconciliation.

insert into public.ledger_accounts (id,user_id,name,type,opening_balance_minor)
select gen_random_uuid(),users.user_id,'默认账户','cash',0
from (select distinct user_id from public.ledger_entries where account_id is null) users
where not exists (select 1 from public.ledger_accounts a where a.user_id=users.user_id and a.name='默认账户');

update public.ledger_entries e set account_id=a.id
from public.ledger_accounts a
where e.account_id is null and a.user_id=e.user_id and a.name='默认账户';

create or replace function public.validate_ledger_rule_payload()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.jsonb_keys_allowed(new.conditions,array[
    'kind','account_id','payee_id','category','note_contains','amount_min_minor','amount_max_minor'
  ]) then raise exception 'unsupported ledger rule condition'; end if;
  if not public.jsonb_keys_allowed(new.actions,array['category','account_id','payee_id','note']) then
    raise exception 'unsupported ledger rule action';
  end if;
  if new.conditions ? 'kind' and new.conditions->>'kind' not in ('income','expense') then raise exception 'invalid rule kind'; end if;
  if new.conditions ? 'amount_min_minor' and (new.conditions->>'amount_min_minor')::bigint < 0 then raise exception 'invalid minimum amount'; end if;
  if new.conditions ? 'amount_max_minor' and (new.conditions->>'amount_max_minor')::bigint < 0 then raise exception 'invalid maximum amount'; end if;
  return new;
end;
$$;
drop trigger if exists ledger_rules_validate_payload on public.ledger_rules;
create trigger ledger_rules_validate_payload before insert or update of conditions,actions on public.ledger_rules
for each row execute function public.validate_ledger_rule_payload();

create or replace function public.check_ledger_split_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_entry uuid := coalesce(new.ledger_entry_id,old.ledger_entry_id); v_amount bigint; v_sum bigint;
begin
  select amount_minor into v_amount from public.ledger_entries where id=v_entry;
  if not found then return null; end if;
  select coalesce(pg_catalog.sum(amount_minor),0) into v_sum from public.ledger_splits where ledger_entry_id=v_entry;
  if v_sum<>0 and v_sum<>v_amount then raise exception 'ledger splits must equal parent amount'; end if;
  return null;
end;
$$;
drop trigger if exists ledger_splits_balance on public.ledger_splits;
create constraint trigger ledger_splits_balance after insert or update or delete on public.ledger_splits
deferrable initially deferred for each row execute function public.check_ledger_split_balance();

create or replace function public.create_ledger_transaction(
  p_command_id uuid,
  p_restore_epoch bigint,
  p_entry_id uuid,
  p_entry jsonb,
  p_splits jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid(); v_epoch bigint; v_previous private.workbench_operation_receipts%rowtype;
  v_row jsonb; v_data jsonb; v_amount bigint; v_split_sum bigint:=0; v_response jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_command_id is null or p_entry_id is null then raise exception 'ids required'; end if;
  if pg_catalog.jsonb_typeof(p_entry)<>'object' or pg_catalog.jsonb_typeof(p_splits)<>'array' then raise exception 'invalid ledger payload'; end if;
  if not public.jsonb_keys_allowed(p_entry,array['kind','category','amount_minor','currency_code','note','entry_date','status','account_id','payee_id']) then raise exception 'unsupported ledger field'; end if;
  if pg_catalog.jsonb_array_length(p_splits)>100 then raise exception 'too many splits'; end if;
  perform public.lock_user_data_revision(v_uid);
  select restore_epoch into v_epoch from public.user_data_revisions where user_id=v_uid;
  if v_epoch<>p_restore_epoch then return public.command_result('stale_restore',p_command_id,p_entry_id,null,null,array[]::text[],'restore epoch changed'); end if;
  select * into v_previous from private.workbench_operation_receipts where user_id=v_uid and operation_id=p_command_id;
  if found then
    if v_previous.operation_kind<>'ledger.transaction' or v_previous.restore_epoch<>p_restore_epoch then raise exception 'command id reused'; end if;
    return pg_catalog.jsonb_set(v_previous.response,'{status}','"duplicate"'::jsonb,true);
  end if;
  v_amount:=(p_entry->>'amount_minor')::bigint;
  if v_amount<=0 then raise exception 'amount must be positive'; end if;
  if p_entry->>'kind' not in ('income','expense') or p_entry->>'status' not in ('planned','posted') then raise exception 'invalid ledger entry'; end if;
  if p_entry->>'currency_code' not in ('CNY','USD','EUR','HKD','GBP') then raise exception 'invalid currency'; end if;
  if p_entry->>'account_id' is not null and not exists(select 1 from public.ledger_accounts where id=(p_entry->>'account_id')::uuid and user_id=v_uid) then raise exception 'account not owned'; end if;
  if p_entry->>'payee_id' is not null and not exists(select 1 from public.ledger_payees where id=(p_entry->>'payee_id')::uuid and user_id=v_uid) then raise exception 'payee not owned'; end if;
  for v_row in select value from pg_catalog.jsonb_array_elements(p_splits) loop
    if not public.jsonb_keys_allowed(v_row,array['id','category','amount_minor','note']) then raise exception 'unsupported split field'; end if;
    v_split_sum:=v_split_sum+(v_row->>'amount_minor')::bigint;
  end loop;
  if pg_catalog.jsonb_array_length(p_splits)>0 and v_split_sum<>v_amount then raise exception 'ledger splits must equal parent amount'; end if;
  insert into public.ledger_entries(id,user_id,kind,category,amount,amount_minor,currency_code,note,entry_date,status,account_id,payee_id)
  values(p_entry_id,v_uid,p_entry->>'kind',p_entry->>'category',v_amount::numeric/100,v_amount,p_entry->>'currency_code',
    p_entry->>'note',(p_entry->>'entry_date')::date,p_entry->>'status',nullif(p_entry->>'account_id','')::uuid,nullif(p_entry->>'payee_id','')::uuid)
  returning pg_catalog.to_jsonb(public.ledger_entries.*) into v_data;
  for v_row in select value from pg_catalog.jsonb_array_elements(p_splits) loop
    insert into public.ledger_splits(id,user_id,ledger_entry_id,category,amount_minor,note)
    values(coalesce(nullif(v_row->>'id','')::uuid,gen_random_uuid()),v_uid,p_entry_id,v_row->>'category',(v_row->>'amount_minor')::bigint,v_row->>'note');
  end loop;
  v_response:=public.command_result('applied',p_command_id,p_entry_id,
    pg_catalog.jsonb_build_object('entry',v_data,'splits',p_splits));
  insert into private.workbench_operation_receipts(user_id,operation_id,restore_epoch,operation_kind,response)
  values(v_uid,p_command_id,p_restore_epoch,'ledger.transaction',v_response);
  return v_response;
end;
$$;

create or replace function public.reconcile_ledger_account(
  p_command_id uuid,p_restore_epoch bigint,p_reconciliation_id uuid,p_account_id uuid,
  p_statement_date date,p_balance_minor bigint,p_entry_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_epoch bigint; v_previous private.workbench_operation_receipts%rowtype; v_response jsonb; v_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if pg_catalog.cardinality(p_entry_ids)>5000 then raise exception 'too many reconciliation entries'; end if;
  perform public.lock_user_data_revision(v_uid);
  select restore_epoch into v_epoch from public.user_data_revisions where user_id=v_uid;
  if v_epoch<>p_restore_epoch then return public.command_result('stale_restore',p_command_id,p_reconciliation_id,null,null,array[]::text[],'restore epoch changed'); end if;
  select * into v_previous from private.workbench_operation_receipts where user_id=v_uid and operation_id=p_command_id;
  if found then return pg_catalog.jsonb_set(v_previous.response,'{status}','"duplicate"'::jsonb,true); end if;
  if not exists(select 1 from public.ledger_accounts where id=p_account_id and user_id=v_uid) then raise exception 'account not owned'; end if;
  if exists(select 1 from pg_catalog.unnest(p_entry_ids) id where not exists(
    select 1 from public.ledger_entries e where e.id=id and e.user_id=v_uid and e.account_id=p_account_id and e.status='posted'
  )) then raise exception 'reconciliation entry is invalid'; end if;
  insert into public.ledger_reconciliations(id,user_id,account_id,statement_date,balance_minor)
  values(p_reconciliation_id,v_uid,p_account_id,p_statement_date,p_balance_minor);
  update public.ledger_entries set reconciled_at=pg_catalog.now() where user_id=v_uid and id=any(p_entry_ids);
  get diagnostics v_count=row_count;
  v_response:=public.command_result('applied',p_command_id,p_reconciliation_id,
    pg_catalog.jsonb_build_object('reconciliation_id',p_reconciliation_id,'entry_count',v_count));
  insert into private.workbench_operation_receipts(user_id,operation_id,restore_epoch,operation_kind,response)
  values(v_uid,p_command_id,p_restore_epoch,'ledger.reconcile',v_response);
  return v_response;
end;
$$;

create or replace function public.get_ledger_summary(p_month text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_start date:=public.workbench_month_start(p_month); v_end date:=(v_start+interval '1 month')::date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  return pg_catalog.jsonb_build_object(
    'total',(select pg_catalog.count(*) from public.ledger_entries where user_id=v_uid and status='posted'),
    'income_minor',coalesce((select pg_catalog.sum(amount_minor) from public.ledger_entries where user_id=v_uid and status='posted' and kind='income' and entry_date>=v_start and entry_date<v_end),0),
    'expense_minor',coalesce((select pg_catalog.sum(amount_minor) from public.ledger_entries where user_id=v_uid and status='posted' and kind='expense' and entry_date>=v_start and entry_date<v_end),0),
    'upcoming',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) order by entry_date,id) from public.ledger_entries e where user_id=v_uid and status='planned'),'[]'::jsonb),
    'daily_expense_minor',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('date',entry_date,'total_minor',total) order by entry_date)
      from (select entry_date,pg_catalog.sum(amount_minor) total from public.ledger_entries where user_id=v_uid and status='posted' and kind='expense' and entry_date>=v_start and entry_date<v_end group by entry_date)x),'[]'::jsonb),
    'category_expense_minor',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(category,total) order by total desc,category)
      from (select category,pg_catalog.sum(amount_minor) total from public.ledger_entries where user_id=v_uid and status='posted' and kind='expense' and entry_date>=v_start and entry_date<v_end group by category)x),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.validate_ledger_rule_payload() from public,anon,authenticated;
revoke all on function public.check_ledger_split_balance() from public,anon,authenticated;
revoke all on function public.create_ledger_transaction(uuid,bigint,uuid,jsonb,jsonb) from public,anon;
revoke all on function public.reconcile_ledger_account(uuid,bigint,uuid,uuid,date,bigint,uuid[]) from public,anon;
revoke all on function public.get_ledger_summary(text) from public,anon;
grant execute on function public.create_ledger_transaction(uuid,bigint,uuid,jsonb,jsonb) to authenticated;
grant execute on function public.reconcile_ledger_account(uuid,bigint,uuid,uuid,date,bigint,uuid[]) to authenticated;
grant execute on function public.get_ledger_summary(text) to authenticated;
