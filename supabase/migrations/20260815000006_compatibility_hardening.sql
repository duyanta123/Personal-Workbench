-- Compatibility hardening for the additive V7 model.
-- The legacy clients still send `amount`; V2 clients send `amount_minor`.
-- Resolve the source deterministically before the NOT NULL/check constraints run.

create or replace function public.sync_ledger_minor_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.amount_minor is not null then
      new.amount := new.amount_minor::numeric / 100;
    elsif new.amount is not null then
      new.amount_minor := pg_catalog.round(new.amount * 100)::bigint;
    end if;
  elsif new.amount_minor is distinct from old.amount_minor then
    if new.amount_minor is not null then
      new.amount := new.amount_minor::numeric / 100;
    elsif new.amount is not null then
      new.amount_minor := pg_catalog.round(new.amount * 100)::bigint;
    end if;
  elsif new.amount is distinct from old.amount then
    new.amount_minor := pg_catalog.round(new.amount * 100)::bigint;
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_minor_amount_sync on public.ledger_entries;
create trigger ledger_minor_amount_sync
before insert or update of amount, amount_minor on public.ledger_entries
for each row execute function public.sync_ledger_minor_amount();

-- These functions are called by table triggers. SECURITY DEFINER keeps their
-- internal validation helpers private while still allowing authenticated RLS
-- writes to invoke the trigger safely.

create or replace function public.validate_ledger_rule_payload()
returns trigger
language plpgsql
security definer
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

create or replace function public.validate_workbench_template_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_allowed text[];
begin
  if pg_catalog.jsonb_typeof(new.payload) <> 'object' then raise exception 'invalid template payload'; end if;
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

create or replace function public.validate_saved_view_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(new.filters) <> 'object' or pg_catalog.jsonb_typeof(new.sort) <> 'array' then raise exception 'invalid saved view payload'; end if;
  if new.entity_kind='todo' then
    if not public.jsonb_keys_allowed(new.filters,array['query','show_done','level','due']) then raise exception 'unsupported todo view filter'; end if;
  elsif new.entity_kind='ledger' then
    if not public.jsonb_keys_allowed(new.filters,array['query','kind','category','account_id','status','date_from','date_to']) then raise exception 'unsupported ledger view filter'; end if;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_ledger_minor_amount() from public, anon, authenticated;
revoke all on function public.validate_ledger_rule_payload() from public, anon, authenticated;
revoke all on function public.validate_workbench_template_payload() from public, anon, authenticated;
revoke all on function public.validate_saved_view_payload() from public, anon, authenticated;

-- Escape wildcard characters before the server-side fuzzy search. This keeps
-- a query such as "100%" literal while retaining trigram ranking.
create or replace function public.search_workbench_v2(p_query text, p_limit int default 8)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_q text := pg_catalog.trim(coalesce(p_query, ''));
  v_pattern text;
  v_limit int := pg_catalog.least(pg_catalog.greatest(coalesce(p_limit, 8), 1), 25);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_q = '' then return '[]'::jsonb; end if;
  v_pattern := '%' || replace(replace(replace(v_q, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'kind',kind,'id',id,'title',title,'subtitle',subtitle,'route',route,'matchField',match_field,'updatedAt',updated_at
    ) order by rank desc,updated_at desc,id) from (
      select * from (
        select 'todo' kind,id,text title,due_date::text subtitle,'/todos?focus='||id route,'text' match_field,updated_at,extensions.similarity(text,v_q) rank from public.todos where user_id=v_uid and text ilike v_pattern escape chr(92)
        union all select 'habit',id,name,null,'/checkins?focus='||id,'name',created_at,extensions.similarity(name,v_q) from public.habits where user_id=v_uid and name ilike v_pattern escape chr(92)
        union all select 'ledger',id,coalesce(note,category),category,'/ledger?focus='||id,'note',created_at,extensions.similarity(coalesce(note,category),v_q) from public.ledger_entries where user_id=v_uid and (note ilike v_pattern escape chr(92) or category ilike v_pattern escape chr(92))
        union all select 'goal',id,name,unit,'/goals?focus='||id,'name',updated_at,extensions.similarity(name,v_q) from public.goals where user_id=v_uid and name ilike v_pattern escape chr(92)
        union all select 'note',id,coalesce(title,pg_catalog.left(body,80)),pg_catalog.left(body,120),'/notes?focus='||id,case when title ilike v_pattern escape chr(92) then 'title' else 'body' end,updated_at,pg_catalog.greatest(extensions.similarity(coalesce(title,''),v_q),extensions.similarity(body,v_q)) from public.notes where user_id=v_uid and (title ilike v_pattern escape chr(92) or body ilike v_pattern escape chr(92))
        union all select 'practice',id,title,platform,'/practice?focus='||id,'title',updated_at,extensions.similarity(title,v_q) from public.practice_problems where user_id=v_uid and (title ilike v_pattern escape chr(92) or note ilike v_pattern escape chr(92))
        union all select 'workout',id,body_part,note,'/workout?focus='||id,'body_part',created_at,extensions.similarity(body_part,v_q) from public.workout_sessions where user_id=v_uid and (body_part ilike v_pattern escape chr(92) or note ilike v_pattern escape chr(92))
        union all select 'inbox',id,pg_catalog.left(raw_text,100),null,'/?focus=inbox','raw_text',updated_at,extensions.similarity(raw_text,v_q) from public.inbox_items where user_id=v_uid and raw_text ilike v_pattern escape chr(92)
      ) matches order by rank desc,updated_at desc limit v_limit
    ) limited
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.search_workbench_v2(text,int) from public,anon;
grant execute on function public.search_workbench_v2(text,int) to authenticated;
