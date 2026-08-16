-- Inbox search results must deep-link to the specific item via `?focus=<id>`
-- (regression introduced in 20260815000006, which hardcoded '/?focus=inbox'
-- and could only expand the inbox list, never locate the matched item).

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
        union all select 'inbox',id,pg_catalog.left(raw_text,100),null,'/?focus='||id,'raw_text',updated_at,extensions.similarity(raw_text,v_q) from public.inbox_items where user_id=v_uid and raw_text ilike v_pattern escape chr(92)
      ) matches order by rank desc,updated_at desc limit v_limit
    ) limited
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.search_workbench_v2(text,int) from public,anon;
grant execute on function public.search_workbench_v2(text,int) to authenticated;
