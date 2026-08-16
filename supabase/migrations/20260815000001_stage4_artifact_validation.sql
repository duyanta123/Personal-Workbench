-- Validate template and saved-view JSON contracts. Tables and RLS were expanded earlier;
-- this migration tightens the public JSON boundary without removing compatibility paths.

create or replace function public.validate_workbench_template_payload()
returns trigger language plpgsql set search_path = '' as $$
declare v_allowed text[];
begin
  if pg_catalog.jsonb_typeof(new.payload)<>'object' then raise exception 'invalid template payload'; end if;
  v_allowed := case new.kind
    when 'todo' then array['text','level','due_offset_days']
    when 'habit' then array['name','emoji','tracking_type','period_days','target_count','target_value','target_mode','reminder_time']
    when 'goal' then array['name','emoji','target','unit','note','pinned']
    when 'workout' then array['body_part','duration_min','note','exercises']
  end;
  if v_allowed is null or not public.jsonb_keys_allowed(new.payload,v_allowed) then raise exception 'unsupported template field'; end if;
  if new.kind='todo' and (new.payload->>'level') not in ('high','mid','low') then raise exception 'invalid todo template level'; end if;
  return new;
end;
$$;

drop trigger if exists workbench_templates_validate_payload on public.workbench_templates;
create trigger workbench_templates_validate_payload before insert or update of kind,payload on public.workbench_templates
for each row execute function public.validate_workbench_template_payload();

create or replace function public.validate_saved_view_payload()
returns trigger language plpgsql set search_path = '' as $$
begin
  if pg_catalog.jsonb_typeof(new.filters)<>'object' or pg_catalog.jsonb_typeof(new.sort)<>'array' then raise exception 'invalid saved view payload'; end if;
  if new.entity_kind='todo' then
    if not public.jsonb_keys_allowed(new.filters,array['query','show_done','level','due']) then raise exception 'unsupported todo view filter'; end if;
  elsif new.entity_kind='ledger' then
    if not public.jsonb_keys_allowed(new.filters,array['query','kind','category','account_id','status','date_from','date_to']) then raise exception 'unsupported ledger view filter'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists saved_views_validate_payload on public.saved_views;
create trigger saved_views_validate_payload before insert or update of entity_kind,filters,sort on public.saved_views
for each row execute function public.validate_saved_view_payload();

revoke all on function public.validate_workbench_template_payload() from public,anon,authenticated;
revoke all on function public.validate_saved_view_payload() from public,anon,authenticated;
