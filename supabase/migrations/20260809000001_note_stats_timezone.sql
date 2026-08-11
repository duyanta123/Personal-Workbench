-- Use browser-provided UTC boundaries so "today" follows the user's local
-- calendar day instead of the database session timezone.
create or replace function public.get_note_stats_range(p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'invalid note stats range'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.notes where user_id = v_uid),
    'pinned', (select count(*) from public.notes where user_id = v_uid and pinned),
    'today', (select count(*) from public.notes where user_id = v_uid and created_at >= p_start and created_at < p_end),
    'tag_counts', coalesce((
      select jsonb_agg(jsonb_build_array(tag, amount) order by amount desc, tag)
      from (
        select tag, count(*) as amount
        from public.notes n cross join lateral unnest(n.tags) tag
        where n.user_id = v_uid
        group by tag
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_note_stats_range(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_note_stats_range(timestamptz, timestamptz) to authenticated;
