-- Phase 2 foundation: preferences participate in the V2 command protocol.

alter table public.user_preferences add column if not exists row_version bigint not null default 1;
alter table public.user_preferences add column if not exists timezone text not null default 'Asia/Shanghai';
alter table public.user_preferences add column if not exists todo_digest_time time not null default '09:00';
alter table public.user_preferences add column if not exists push_preview_mode text not null default 'summary';
alter table public.user_preferences drop constraint if exists preferences_push_preview_mode_valid;
alter table public.user_preferences add constraint preferences_push_preview_mode_valid
  check (push_preview_mode in ('summary','content'));
alter table public.user_preferences drop constraint if exists preferences_timezone_valid;
alter table public.user_preferences add constraint preferences_timezone_valid
  check (pg_catalog.length(timezone) between 1 and 100);

create or replace function private.ensure_user_preferences()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_preferences(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists auth_user_preferences on auth.users;
create trigger auth_user_preferences after insert on auth.users
for each row execute function private.ensure_user_preferences();

insert into public.user_preferences(user_id)
select id from auth.users on conflict(user_id) do nothing;

drop trigger if exists user_preferences_revision_guard on public.user_preferences;
create trigger user_preferences_revision_guard before insert or update or delete on public.user_preferences
for each statement execute function public.guard_user_data_revision();
drop trigger if exists user_preferences_revision on public.user_preferences;
create trigger user_preferences_revision before insert or update or delete on public.user_preferences
for each row execute function public.bump_user_data_revision();
drop trigger if exists user_preferences_row_version on public.user_preferences;
create trigger user_preferences_row_version before update on public.user_preferences
for each row execute function public.bump_row_version();
drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at before update on public.user_preferences
for each row execute function public.set_updated_at();

create or replace function public.apply_workbench_preference_v2(
  p_command_id uuid,
  p_entity_id uuid,
  p_restore_epoch bigint,
  p_payload jsonb,
  p_expected jsonb,
  p_base_version bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_epoch bigint; v_current jsonb; v_data jsonb;
  v_previous private.workbench_operation_receipts%rowtype; v_conflicts text[]; v_set_list text;
  v_allowed text[] := array['categories','monthly_budget','monthly_budget_minor','currency_code','pomodoro','timezone','todo_digest_time','push_preview_mode'];
begin
  if v_uid is null or p_entity_id <> v_uid then raise exception 'not authenticated'; end if;
  if p_command_id is null or p_restore_epoch is null or p_base_version is null then raise exception 'preference command metadata required'; end if;
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' or pg_catalog.jsonb_typeof(p_expected) <> 'object' then raise exception 'invalid preference payload'; end if;
  if not public.jsonb_keys_allowed(p_payload,v_allowed) or not public.jsonb_keys_allowed(p_expected,v_allowed) then raise exception 'preference field is not allowed'; end if;
  perform public.lock_user_data_revision(v_uid);
  select restore_epoch into v_epoch from public.user_data_revisions where user_id=v_uid;
  if v_epoch <> p_restore_epoch then return public.command_result('stale_restore',p_command_id,p_entity_id,null,null,array[]::text[],'restore epoch changed'); end if;
  select * into v_previous from private.workbench_operation_receipts where user_id=v_uid and operation_id=p_command_id;
  if found then
    if v_previous.operation_kind <> 'v2:preference.update' or v_previous.restore_epoch <> p_restore_epoch then raise exception 'command id reused'; end if;
    return pg_catalog.jsonb_set(v_previous.response,'{status}','"duplicate"'::jsonb,true);
  end if;
  select pg_catalog.to_jsonb(p) into v_current from public.user_preferences p where user_id=v_uid;
  if v_current is null then raise exception 'preferences row missing'; end if;
  if (v_current->>'row_version')::bigint <> p_base_version then
    v_conflicts := public.command_conflicting_fields(v_current,p_expected,p_payload);
  else v_conflicts := array[]::text[]; end if;
  if pg_catalog.cardinality(v_conflicts)>0 then
    v_data := public.command_result('conflict',p_command_id,p_entity_id,null,v_current,v_conflicts,'same preference fields changed on another device');
  else
    select pg_catalog.string_agg(pg_catalog.format('%1$I = x.%1$I',key),', ' order by ord) into v_set_list
      from pg_catalog.unnest(v_allowed) with ordinality a(key,ord) where p_payload ? key;
    if v_set_list is null then raise exception 'empty preference update'; end if;
    execute pg_catalog.format(
      'update public.user_preferences t set %s from pg_catalog.jsonb_populate_record(null::public.user_preferences,$1) x where t.user_id=$2 returning pg_catalog.to_jsonb(t.*)',
      v_set_list
    ) into v_data using p_payload,v_uid;
    v_data := public.command_result('applied',p_command_id,p_entity_id,v_data);
  end if;
  insert into private.workbench_operation_receipts(user_id,operation_id,restore_epoch,operation_kind,response)
    values(v_uid,p_command_id,p_restore_epoch,'v2:preference.update',v_data);
  return v_data;
end;
$$;

revoke all on function private.ensure_user_preferences() from public, anon, authenticated;
revoke all on function public.apply_workbench_preference_v2(uuid,uuid,bigint,jsonb,jsonb,bigint) from public, anon;
grant execute on function public.apply_workbench_preference_v2(uuid,uuid,bigint,jsonb,jsonb,bigint) to authenticated;

revoke insert, update, delete on table public.user_preferences from anon, authenticated;
grant select on table public.user_preferences to authenticated;
