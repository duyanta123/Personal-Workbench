-- Stable composite cursor for the only list that must be served by an RPC.
-- The legacy offset function remains read-only compatibility for old clients.

create or replace function public.get_practice_page_cursor(
  p_page_size int default 50,
  p_query text default '',
  p_platform text default null,
  p_difficulty text default null,
  p_tag text default null,
  p_has_cursor boolean default false,
  p_after_solved_at date default null,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_size int := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_query text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, '')));
  v_total bigint;
  v_items jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_difficulty is not null and p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'invalid difficulty';
  end if;
  if coalesce(p_has_cursor, false) and (p_after_created_at is null or p_after_id is null) then
    raise exception 'incomplete practice cursor';
  end if;

  select pg_catalog.count(*)
  into v_total
  from public.practice_problems p
  where p.user_id = v_uid
    and (v_query = '' or pg_catalog.strpos(pg_catalog.lower(p.title), v_query) > 0
      or exists (
        select 1 from pg_catalog.unnest(p.tags) tag
        where pg_catalog.strpos(pg_catalog.lower(tag), v_query) > 0
      ))
    and (p_platform is null or p.platform = p_platform)
    and (p_difficulty is null or p.difficulty = p_difficulty)
    and (p_tag is null or p.tags @> array[p_tag]::text[]);

  with page_rows as (
    select p.*
    from public.practice_problems p
    where p.user_id = v_uid
      and (v_query = '' or pg_catalog.strpos(pg_catalog.lower(p.title), v_query) > 0
        or exists (
          select 1 from pg_catalog.unnest(p.tags) tag
          where pg_catalog.strpos(pg_catalog.lower(tag), v_query) > 0
        ))
      and (p_platform is null or p.platform = p_platform)
      and (p_difficulty is null or p.difficulty = p_difficulty)
      and (p_tag is null or p.tags @> array[p_tag]::text[])
      and (
        not coalesce(p_has_cursor, false)
        or coalesce(p.solved_at, date '0001-01-01') < coalesce(p_after_solved_at, date '0001-01-01')
        or (
          coalesce(p.solved_at, date '0001-01-01') = coalesce(p_after_solved_at, date '0001-01-01')
          and p.created_at < p_after_created_at
        )
        or (
          coalesce(p.solved_at, date '0001-01-01') = coalesce(p_after_solved_at, date '0001-01-01')
          and p.created_at = p_after_created_at
          and p.id < p_after_id
        )
      )
    order by p.solved_at desc nulls last, p.created_at desc, p.id desc
    limit v_size
  )
  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page_rows)
      order by solved_at desc nulls last, created_at desc, id desc),
    '[]'::jsonb
  )
  into v_items
  from page_rows;

  return pg_catalog.jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

revoke all on function public.get_practice_page_cursor(int, text, text, text, text, boolean, date, timestamptz, uuid)
from public, anon;
grant execute on function public.get_practice_page_cursor(int, text, text, text, text, boolean, date, timestamptz, uuid)
to authenticated;
