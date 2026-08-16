-- Complete the Stage 4 JSON contracts. Keep validation at both the client and
-- database boundary because templates and saved views are also restored from backups.

create or replace function public.validate_workbench_template_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed text[];
  v_exercise jsonb;
begin
  if pg_catalog.jsonb_typeof(new.payload) <> 'object' then raise exception 'invalid template payload'; end if;
  v_allowed := case new.kind
    when 'todo' then array['text','level','due_offset_days']
    when 'habit' then array['name','emoji','tracking_type','period_days','target_count','target_value','target_mode','reminder_time']
    when 'goal' then array['name','emoji','target','unit','note','pinned']
    when 'workout' then array['body_part','duration_min','note','exercises']
  end;
  if v_allowed is null or not public.jsonb_keys_allowed(new.payload,v_allowed) then raise exception 'unsupported template field'; end if;

  if new.kind = 'todo' then
    if not (new.payload ?& array['text','level'])
      or pg_catalog.jsonb_typeof(new.payload->'text') <> 'string'
      or pg_catalog.jsonb_typeof(new.payload->'level') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(new.payload->>'text')) not between 1 and 1000
      or new.payload->>'level' not in ('high','mid','low') then raise exception 'invalid todo template'; end if;
    if new.payload ? 'due_offset_days' and pg_catalog.jsonb_typeof(new.payload->'due_offset_days') <> 'null' then
      if pg_catalog.jsonb_typeof(new.payload->'due_offset_days') <> 'number'
        or (new.payload->>'due_offset_days')::numeric <> pg_catalog.trunc((new.payload->>'due_offset_days')::numeric)
        or (new.payload->>'due_offset_days')::numeric not between -36500 and 36500 then raise exception 'invalid todo due offset'; end if;
    end if;
  elsif new.kind = 'habit' then
    if not (new.payload ?& array['name','emoji','tracking_type','period_days','target_count','target_mode'])
      or pg_catalog.jsonb_typeof(new.payload->'name') <> 'string'
      or pg_catalog.jsonb_typeof(new.payload->'emoji') <> 'string'
      or pg_catalog.jsonb_typeof(new.payload->'tracking_type') <> 'string'
      or pg_catalog.jsonb_typeof(new.payload->'target_mode') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(new.payload->>'name')) not between 1 and 200
      or pg_catalog.char_length(pg_catalog.btrim(new.payload->>'emoji')) not between 1 and 100
      or new.payload->>'tracking_type' not in ('boolean','numeric')
      or new.payload->>'target_mode' not in ('at_least','at_most') then raise exception 'invalid habit template'; end if;
    if pg_catalog.jsonb_typeof(new.payload->'period_days') <> 'number'
      or (new.payload->>'period_days')::numeric <> pg_catalog.trunc((new.payload->>'period_days')::numeric)
      or (new.payload->>'period_days')::numeric not between 1 and 365
      or pg_catalog.jsonb_typeof(new.payload->'target_count') <> 'number'
      or (new.payload->>'target_count')::numeric <> pg_catalog.trunc((new.payload->>'target_count')::numeric)
      or (new.payload->>'target_count')::numeric not between 1 and 365 then raise exception 'invalid habit target'; end if;
    if new.payload->>'tracking_type' = 'numeric'
      and (pg_catalog.jsonb_typeof(new.payload->'target_value') <> 'number' or (new.payload->>'target_value')::numeric is null) then
      raise exception 'numeric habit target required';
    end if;
    if new.payload ? 'reminder_time' and pg_catalog.jsonb_typeof(new.payload->'reminder_time') <> 'null'
      and (pg_catalog.jsonb_typeof(new.payload->'reminder_time') <> 'string'
        or new.payload->>'reminder_time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'invalid habit reminder'; end if;
  elsif new.kind = 'goal' then
    if not (new.payload ?& array['name','emoji','target'])
      or pg_catalog.jsonb_typeof(new.payload->'name') <> 'string'
      or pg_catalog.jsonb_typeof(new.payload->'emoji') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(new.payload->>'name')) not between 1 and 200
      or pg_catalog.char_length(pg_catalog.btrim(new.payload->>'emoji')) not between 1 and 100
      or pg_catalog.jsonb_typeof(new.payload->'target') <> 'number'
      or (new.payload->>'target')::numeric <= 0 then raise exception 'invalid goal template'; end if;
    if new.payload ? 'unit' and pg_catalog.jsonb_typeof(new.payload->'unit') <> 'null'
      and (pg_catalog.jsonb_typeof(new.payload->'unit') <> 'string' or pg_catalog.char_length(new.payload->>'unit') > 100) then raise exception 'invalid goal unit'; end if;
    if new.payload ? 'note' and pg_catalog.jsonb_typeof(new.payload->'note') <> 'null'
      and (pg_catalog.jsonb_typeof(new.payload->'note') <> 'string' or pg_catalog.char_length(new.payload->>'note') > 100000) then raise exception 'invalid goal note'; end if;
    if new.payload ? 'pinned' and pg_catalog.jsonb_typeof(new.payload->'pinned') <> 'boolean' then raise exception 'invalid goal pinned value'; end if;
  elsif new.kind = 'workout' then
    if not (new.payload ? 'body_part')
      or pg_catalog.jsonb_typeof(new.payload->'body_part') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(new.payload->>'body_part')) not between 1 and 100 then raise exception 'invalid workout template'; end if;
    if new.payload ? 'duration_min' and pg_catalog.jsonb_typeof(new.payload->'duration_min') <> 'null' then
      if pg_catalog.jsonb_typeof(new.payload->'duration_min') <> 'number'
        or (new.payload->>'duration_min')::numeric <> pg_catalog.trunc((new.payload->>'duration_min')::numeric)
        or (new.payload->>'duration_min')::numeric not between 0 and 10080 then raise exception 'invalid workout duration'; end if;
    end if;
    if new.payload ? 'note' and pg_catalog.jsonb_typeof(new.payload->'note') <> 'null'
      and (pg_catalog.jsonb_typeof(new.payload->'note') <> 'string' or pg_catalog.char_length(new.payload->>'note') > 100000) then raise exception 'invalid workout note'; end if;
    if new.payload ? 'exercises' then
      if pg_catalog.jsonb_typeof(new.payload->'exercises') <> 'array'
        or pg_catalog.jsonb_array_length(new.payload->'exercises') > 100 then raise exception 'invalid workout exercises'; end if;
      for v_exercise in select value from pg_catalog.jsonb_array_elements(new.payload->'exercises') loop
        if pg_catalog.jsonb_typeof(v_exercise) <> 'object'
          or not public.jsonb_keys_allowed(v_exercise,array['name','sets','reps','weight','note'])
          or not (v_exercise ?& array['name','sets','reps','weight'])
          or pg_catalog.jsonb_typeof(v_exercise->'name') <> 'string'
          or pg_catalog.char_length(pg_catalog.btrim(v_exercise->>'name')) not between 1 and 200
          or pg_catalog.jsonb_typeof(v_exercise->'sets') <> 'number'
          or (v_exercise->>'sets')::numeric <> pg_catalog.trunc((v_exercise->>'sets')::numeric)
          or (v_exercise->>'sets')::numeric not between 0 and 1000
          or pg_catalog.jsonb_typeof(v_exercise->'reps') <> 'number'
          or (v_exercise->>'reps')::numeric <> pg_catalog.trunc((v_exercise->>'reps')::numeric)
          or (v_exercise->>'reps')::numeric not between 0 and 100000
          or pg_catalog.jsonb_typeof(v_exercise->'weight') <> 'number'
          or (v_exercise->>'weight')::numeric < 0
          or (v_exercise ? 'note' and pg_catalog.jsonb_typeof(v_exercise->'note') <> 'null'
            and (pg_catalog.jsonb_typeof(v_exercise->'note') <> 'string' or pg_catalog.char_length(v_exercise->>'note') > 100000)) then
          raise exception 'invalid workout exercise';
        end if;
      end loop;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.validate_saved_view_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sort jsonb;
  v_columns text[];
begin
  if pg_catalog.jsonb_typeof(new.filters) <> 'object' or pg_catalog.jsonb_typeof(new.sort) <> 'array'
    or pg_catalog.jsonb_array_length(new.sort) > 3 then raise exception 'invalid saved view payload'; end if;
  if new.entity_kind = 'todo' then
    if not public.jsonb_keys_allowed(new.filters,array['query','show_done','level','due']) then raise exception 'unsupported todo view filter'; end if;
    v_columns := array['sort_order','due_date','created_at'];
    if new.filters ? 'query' and (pg_catalog.jsonb_typeof(new.filters->'query') <> 'string' or pg_catalog.char_length(new.filters->>'query') > 1000) then raise exception 'invalid todo query'; end if;
    if new.filters ? 'show_done' and pg_catalog.jsonb_typeof(new.filters->'show_done') <> 'boolean' then raise exception 'invalid todo done filter'; end if;
    if new.filters ? 'level' and new.filters->>'level' not in ('high','mid','low') then raise exception 'invalid todo level filter'; end if;
    if new.filters ? 'due' and new.filters->>'due' not in ('overdue','today','future','none') then raise exception 'invalid todo due filter'; end if;
  elsif new.entity_kind = 'ledger' then
    if not public.jsonb_keys_allowed(new.filters,array['query','kind','category','account_id','status','date_from','date_to']) then raise exception 'unsupported ledger view filter'; end if;
    v_columns := array['entry_date','amount_minor','category','created_at'];
    if new.filters ? 'query' and (pg_catalog.jsonb_typeof(new.filters->'query') <> 'string' or pg_catalog.char_length(new.filters->>'query') > 200) then raise exception 'invalid ledger query'; end if;
    if new.filters ? 'kind' and new.filters->>'kind' not in ('income','expense') then raise exception 'invalid ledger kind filter'; end if;
    if new.filters ? 'status' and new.filters->>'status' not in ('planned','posted') then raise exception 'invalid ledger status filter'; end if;
    if new.filters ? 'category' and (pg_catalog.jsonb_typeof(new.filters->'category') <> 'string' or pg_catalog.char_length(new.filters->>'category') > 200) then raise exception 'invalid ledger category filter'; end if;
    if new.filters ? 'account_id' and (pg_catalog.jsonb_typeof(new.filters->'account_id') <> 'string' or (new.filters->>'account_id')::uuid is null) then raise exception 'invalid ledger account filter'; end if;
    if new.filters ? 'date_from' then
      if pg_catalog.jsonb_typeof(new.filters->'date_from') <> 'string' then raise exception 'invalid ledger start date'; end if;
      perform (new.filters->>'date_from')::date;
    end if;
    if new.filters ? 'date_to' then
      if pg_catalog.jsonb_typeof(new.filters->'date_to') <> 'string' then raise exception 'invalid ledger end date'; end if;
      perform (new.filters->>'date_to')::date;
    end if;
  else
    raise exception 'unsupported saved view kind';
  end if;
  for v_sort in select value from pg_catalog.jsonb_array_elements(new.sort) loop
    if pg_catalog.jsonb_typeof(v_sort) <> 'object'
      or not public.jsonb_keys_allowed(v_sort,array['column','direction'])
      or not (v_sort ?& array['column','direction'])
      or v_sort->>'column' <> all(v_columns)
      or v_sort->>'direction' not in ('asc','desc') then raise exception 'invalid saved view sort'; end if;
  end loop;
  return new;
end;
$$;

create or replace function public.enforce_saved_view_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.user_id <> auth.uid() then raise exception 'saved view owner mismatch'; end if;
  if new.is_default then
    update public.saved_views
      set is_default = false
      where user_id = new.user_id and entity_kind = new.entity_kind and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists saved_views_enforce_default on public.saved_views;
create trigger saved_views_enforce_default
before insert or update of is_default on public.saved_views
for each row execute function public.enforce_saved_view_default();

revoke all on function public.validate_workbench_template_payload() from public,anon,authenticated;
revoke all on function public.validate_saved_view_payload() from public,anon,authenticated;
revoke all on function public.enforce_saved_view_default() from public,anon,authenticated;
