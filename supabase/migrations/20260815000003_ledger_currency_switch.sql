-- A currency switch only relabels the single-currency ledger. Integer amounts and
-- budgets remain unchanged; no exchange-rate conversion is attempted.

create or replace function public.switch_ledger_currency(
  p_command_id uuid,p_restore_epoch bigint,p_currency text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_epoch bigint; v_previous private.workbench_operation_receipts%rowtype; v_response jsonb; v_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_currency not in ('CNY','USD','EUR','HKD','GBP') then raise exception 'unsupported currency'; end if;
  perform public.lock_user_data_revision(v_uid);
  select restore_epoch into v_epoch from public.user_data_revisions where user_id=v_uid;
  if v_epoch<>p_restore_epoch then return public.command_result('stale_restore',p_command_id,v_uid,null,null,array[]::text[],'restore epoch changed'); end if;
  select * into v_previous from private.workbench_operation_receipts where user_id=v_uid and operation_id=p_command_id;
  if found then
    if v_previous.operation_kind<>'ledger.currency' or v_previous.restore_epoch<>p_restore_epoch then raise exception 'command id reused'; end if;
    return pg_catalog.jsonb_set(v_previous.response,'{status}','"duplicate"'::jsonb,true);
  end if;
  update public.ledger_entries set currency_code=p_currency where user_id=v_uid and currency_code<>p_currency;
  get diagnostics v_count=row_count;
  insert into public.user_preferences(user_id,currency_code) values(v_uid,p_currency)
  on conflict(user_id) do update set currency_code=excluded.currency_code,updated_at=pg_catalog.now();
  v_response:=public.command_result('applied',p_command_id,v_uid,pg_catalog.jsonb_build_object('currency_code',p_currency,'updated_entries',v_count));
  insert into private.workbench_operation_receipts(user_id,operation_id,restore_epoch,operation_kind,response)
  values(v_uid,p_command_id,p_restore_epoch,'ledger.currency',v_response);
  return v_response;
end;
$$;

revoke all on function public.switch_ledger_currency(uuid,bigint,text) from public,anon;
grant execute on function public.switch_ledger_currency(uuid,bigint,text) to authenticated;
