-- Idempotent, restore-aware and version-protected wrapper around the established
-- fractional todo ordering algorithm.

create or replace function public.move_todo_v2(
  p_command_id uuid,p_restore_epoch bigint,p_todo_id uuid,p_base_version bigint,p_anchor_id uuid,p_position text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_epoch bigint; v_previous private.workbench_operation_receipts%rowtype;
  v_current public.todos; v_moved public.todos; v_response jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_position not in ('before','after') or p_todo_id=p_anchor_id then raise exception 'invalid move'; end if;
  perform public.lock_user_data_revision(v_uid);
  select restore_epoch into v_epoch from public.user_data_revisions where user_id=v_uid;
  if v_epoch<>p_restore_epoch then return public.command_result('stale_restore',p_command_id,p_todo_id,null,null,array[]::text[],'restore epoch changed'); end if;
  select * into v_previous from private.workbench_operation_receipts where user_id=v_uid and operation_id=p_command_id;
  if found then
    if v_previous.operation_kind<>'v2:todo.move' or v_previous.restore_epoch<>p_restore_epoch then raise exception 'command id reused'; end if;
    return pg_catalog.jsonb_set(v_previous.response,'{status}','"duplicate"'::jsonb,true);
  end if;
  select * into v_current from public.todos where id=p_todo_id and user_id=v_uid;
  if not found then v_response:=public.command_result('not_found',p_command_id,p_todo_id,null,null,array[]::text[],'todo not found');
  elsif v_current.row_version<>p_base_version then v_response:=public.command_result('conflict',p_command_id,p_todo_id,null,pg_catalog.to_jsonb(v_current),array['sort_order'],'todo changed before move');
  elsif not exists(select 1 from public.todos where id=p_anchor_id and user_id=v_uid and pinned=v_current.pinned) then raise exception 'anchor is invalid';
  else
    v_moved:=public.move_todo(p_todo_id,p_anchor_id,p_position);
    v_response:=public.command_result('applied',p_command_id,p_todo_id,pg_catalog.to_jsonb(v_moved));
  end if;
  insert into private.workbench_operation_receipts(user_id,operation_id,restore_epoch,operation_kind,response)
  values(v_uid,p_command_id,p_restore_epoch,'v2:todo.move',v_response);
  return v_response;
end;
$$;

revoke all on function public.move_todo_v2(uuid,bigint,uuid,bigint,uuid,text) from public,anon;
grant execute on function public.move_todo_v2(uuid,bigint,uuid,bigint,uuid,text) to authenticated;
