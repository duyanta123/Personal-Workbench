-- Data ownership defaults, bounded goal progress, atomic pomodoro completion,
-- and transactional full-backup restore.

alter table public.todos alter column user_id set default auth.uid();
alter table public.habits alter column user_id set default auth.uid();
alter table public.habit_logs alter column user_id set default auth.uid();
alter table public.ledger_entries alter column user_id set default auth.uid();
alter table public.goals alter column user_id set default auth.uid();
alter table public.notes alter column user_id set default auth.uid();
alter table public.practice_problems alter column user_id set default auth.uid();
alter table public.workout_sessions alter column user_id set default auth.uid();
alter table public.body_metrics alter column user_id set default auth.uid();
alter table public.pomodoro_sessions alter column user_id set default auth.uid();
alter table public.user_preferences alter column user_id set default auth.uid();
alter table public.user_avatars alter column user_id set default auth.uid();

update public.goals
set target = greatest(target, 1),
    current = least(greatest(current, 0), greatest(target, 1));

alter table public.goals drop constraint if exists goals_current_bounds;
alter table public.goals add constraint goals_current_bounds check (current >= 0 and current <= target);

create or replace function public.increment_goal(goal_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.goals
  set current = least(target, current + 1), updated_at = now()
  where id = goal_id and user_id = auth.uid() and current < target;
$$;

create or replace function public.adjust_goal(p_goal_id uuid, p_delta numeric)
returns public.goals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal public.goals;
begin
  update public.goals
  set current = least(target, greatest(0, current + p_delta)), updated_at = now()
  where id = p_goal_id and user_id = auth.uid()
  returning * into v_goal;
  return v_goal;
end;
$$;

create or replace function public.complete_pomodoro(p_date date, p_minutes int)
returns public.pomodoro_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.pomodoro_sessions;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_minutes <= 0 or p_minutes > 240 then raise exception 'invalid minutes'; end if;

  insert into public.pomodoro_sessions (user_id, date, count, minutes)
  values (v_uid, p_date, 1, p_minutes)
  on conflict (user_id, date) do update
    set count = public.pomodoro_sessions.count + 1,
        minutes = public.pomodoro_sessions.minutes + excluded.minutes
  returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.restore_workbench_backup_v2(
  p_payload jsonb,
  p_avatar_paths jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_pref jsonb;
  v_old_avatar_paths jsonb;
  v_path text;
  v_tables jsonb := coalesce(p_payload->'tables', '{}'::jsonb);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce((p_payload#>>'{metadata,version}')::int, 0) <> 2 then
    raise exception 'unsupported backup version';
  end if;
  if jsonb_typeof(p_avatar_paths) <> 'array' then raise exception 'invalid avatar paths'; end if;
  if jsonb_array_length(p_avatar_paths) > 5 then raise exception 'too many avatars'; end if;
  if (select count(*) from jsonb_array_elements(p_avatar_paths) x
      where coalesce((x->>'is_active')::boolean, false)) > 1 then
    raise exception 'multiple active avatars';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar:' || v_uid::text, 0));

  select coalesce(jsonb_agg(storage_path), '[]'::jsonb)
  into v_old_avatar_paths
  from public.user_avatars where user_id = v_uid;

  delete from public.todos where user_id = v_uid;
  delete from public.habits where user_id = v_uid;
  delete from public.ledger_entries where user_id = v_uid;
  delete from public.goals where user_id = v_uid;
  delete from public.notes where user_id = v_uid;
  delete from public.practice_problems where user_id = v_uid;
  delete from public.workout_sessions where user_id = v_uid;
  delete from public.body_metrics where user_id = v_uid;
  delete from public.pomodoro_sessions where user_id = v_uid;
  delete from public.user_preferences where user_id = v_uid;
  delete from public.user_avatars where user_id = v_uid;

  create temporary table tmp_habit_map (old_id text primary key, new_id uuid not null) on commit drop;
  create temporary table tmp_session_map (old_id text primary key, new_id uuid not null) on commit drop;

  for v_row in select value from jsonb_array_elements(coalesce(v_tables->'todos', '[]'::jsonb)) loop
    insert into public.todos (user_id, text, level, done, sort_order, due_date, pinned, created_at, updated_at)
    values (
      v_uid, v_row->>'text', coalesce(v_row->>'level', 'mid'),
      coalesce((v_row->>'done')::boolean, false), coalesce((v_row->>'sort_order')::bigint, 0),
      nullif(v_row->>'due_date', '')::date, coalesce((v_row->>'pinned')::boolean, false),
      coalesce((v_row->>'created_at')::timestamptz, now()), coalesce((v_row->>'updated_at')::timestamptz, now())
    );
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_tables->'habits', '[]'::jsonb)) loop
    insert into pg_temp.tmp_habit_map values (v_row->>'id', gen_random_uuid());
    insert into public.habits (id, user_id, name, emoji, pinned, created_at)
    select new_id, v_uid, v_row->>'name', coalesce(v_row->>'emoji', 'flame'),
           coalesce((v_row->>'pinned')::boolean, false), coalesce((v_row->>'created_at')::timestamptz, now())
    from pg_temp.tmp_habit_map where old_id = v_row->>'id';
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_tables->'habit_logs', '[]'::jsonb)) loop
    insert into public.habit_logs (habit_id, user_id, log_date, created_at)
    select new_id, v_uid, (v_row->>'log_date')::date, coalesce((v_row->>'created_at')::timestamptz, now())
    from pg_temp.tmp_habit_map where old_id = v_row->>'habit_id';
    if not found then raise exception 'habit log references missing habit'; end if;
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_tables->'ledger_entries', '[]'::jsonb)) loop
    insert into public.ledger_entries (user_id, kind, category, amount, note, entry_date, created_at)
    values (v_uid, v_row->>'kind', v_row->>'category', (v_row->>'amount')::numeric,
            v_row->>'note', (v_row->>'entry_date')::date, coalesce((v_row->>'created_at')::timestamptz, now()));
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_tables->'goals', '[]'::jsonb)) loop
    insert into public.goals (user_id, name, emoji, current, target, unit, note, pinned, created_at, updated_at)
    values (
      v_uid, v_row->>'name', coalesce(v_row->>'emoji', 'target'),
      least(greatest(coalesce((v_row->>'current')::numeric, 0), 0), greatest((v_row->>'target')::numeric, 1)),
      greatest((v_row->>'target')::numeric, 1), v_row->>'unit', v_row->>'note',
      coalesce((v_row->>'pinned')::boolean, false), coalesce((v_row->>'created_at')::timestamptz, now()),
      coalesce((v_row->>'updated_at')::timestamptz, now())
    );
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_tables->'notes', '[]'::jsonb)) loop
    insert into public.notes (user_id, title, body, tags, pinned, layout, image_url, created_at, updated_at)
    values (
      v_uid, v_row->>'title', v_row->>'body',
      array(select jsonb_array_elements_text(coalesce(v_row->'tags', '[]'::jsonb))),
      coalesce((v_row->>'pinned')::boolean, false), coalesce(v_row->>'layout', 'default'), v_row->>'image_url',
      coalesce((v_row->>'created_at')::timestamptz, now()), coalesce((v_row->>'updated_at')::timestamptz, now())
    );
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_tables->'practice_problems', '[]'::jsonb)) loop
    insert into public.practice_problems
      (user_id, title, platform, difficulty, status, tags, url, note, solved_at, created_at, updated_at)
    values (
      v_uid, v_row->>'title', coalesce(v_row->>'platform', 'leetcode'), coalesce(v_row->>'difficulty', 'medium'),
      coalesce(v_row->>'status', 'todo'), array(select jsonb_array_elements_text(coalesce(v_row->'tags', '[]'::jsonb))),
      v_row->>'url', v_row->>'note', nullif(v_row->>'solved_at', '')::date,
      coalesce((v_row->>'created_at')::timestamptz, now()), coalesce((v_row->>'updated_at')::timestamptz, now())
    );
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_tables->'workout_sessions', '[]'::jsonb)) loop
    insert into pg_temp.tmp_session_map values (v_row->>'id', gen_random_uuid());
    insert into public.workout_sessions (id, user_id, date, body_part, duration_min, note, created_at)
    select new_id, v_uid, (v_row->>'date')::date, coalesce(v_row->>'body_part', 'full'),
           nullif(v_row->>'duration_min', '')::int, v_row->>'note', coalesce((v_row->>'created_at')::timestamptz, now())
    from pg_temp.tmp_session_map where old_id = v_row->>'id';
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_tables->'workout_exercises', '[]'::jsonb)) loop
    insert into public.workout_exercises (session_id, name, sets, reps, weight, note, created_at)
    select new_id, v_row->>'name', coalesce((v_row->>'sets')::int, 0), coalesce((v_row->>'reps')::int, 0),
           coalesce((v_row->>'weight')::numeric, 0), v_row->>'note', coalesce((v_row->>'created_at')::timestamptz, now())
    from pg_temp.tmp_session_map where old_id = v_row->>'session_id';
    if not found then raise exception 'exercise references missing workout session'; end if;
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_tables->'body_metrics', '[]'::jsonb)) loop
    insert into public.body_metrics (user_id, date, weight, body_fat, note, created_at)
    values (v_uid, (v_row->>'date')::date, nullif(v_row->>'weight', '')::numeric,
            nullif(v_row->>'body_fat', '')::numeric, v_row->>'note', coalesce((v_row->>'created_at')::timestamptz, now()));
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_tables->'pomodoro_sessions', '[]'::jsonb)) loop
    insert into public.pomodoro_sessions (user_id, date, count, minutes, created_at)
    values (v_uid, (v_row->>'date')::date, coalesce((v_row->>'count')::int, 0),
            coalesce((v_row->>'minutes')::int, 0), coalesce((v_row->>'created_at')::timestamptz, now()));
  end loop;

  v_pref := coalesce(v_tables->'user_preferences'->0, '{}'::jsonb);
  insert into public.user_preferences (user_id, categories, monthly_budget, pomodoro, updated_at)
  values (
    v_uid, coalesce(v_pref->'categories', '{"expense":[],"income":[]}'::jsonb),
    nullif(v_pref->>'monthly_budget', '')::numeric,
    coalesce(v_pref->'pomodoro', '{"focus":25,"break":5,"long_break":15,"rounds_per_cycle":4}'::jsonb),
    coalesce((v_pref->>'updated_at')::timestamptz, now())
  );

  for v_row in select value from jsonb_array_elements(p_avatar_paths) loop
    v_path := v_row->>'path';
    if v_path is null or left(v_path, length(v_uid::text) + 1) <> v_uid::text || '/' then
      raise exception 'invalid avatar path';
    end if;
    insert into public.user_avatars (user_id, storage_path, is_active, created_at)
    values (v_uid, v_path, coalesce((v_row->>'is_active')::boolean, false), coalesce((v_row->>'created_at')::timestamptz, now()));
  end loop;

  return jsonb_build_object(
    'old_avatar_paths', v_old_avatar_paths,
    'counts', jsonb_build_object(
      'todos', jsonb_array_length(coalesce(v_tables->'todos', '[]'::jsonb)),
      'habits', jsonb_array_length(coalesce(v_tables->'habits', '[]'::jsonb)),
      'habit_logs', jsonb_array_length(coalesce(v_tables->'habit_logs', '[]'::jsonb)),
      'ledger_entries', jsonb_array_length(coalesce(v_tables->'ledger_entries', '[]'::jsonb)),
      'goals', jsonb_array_length(coalesce(v_tables->'goals', '[]'::jsonb)),
      'notes', jsonb_array_length(coalesce(v_tables->'notes', '[]'::jsonb)),
      'practice_problems', jsonb_array_length(coalesce(v_tables->'practice_problems', '[]'::jsonb)),
      'workout_sessions', jsonb_array_length(coalesce(v_tables->'workout_sessions', '[]'::jsonb)),
      'workout_exercises', jsonb_array_length(coalesce(v_tables->'workout_exercises', '[]'::jsonb)),
      'body_metrics', jsonb_array_length(coalesce(v_tables->'body_metrics', '[]'::jsonb)),
      'pomodoro_sessions', jsonb_array_length(coalesce(v_tables->'pomodoro_sessions', '[]'::jsonb)),
      'avatars', jsonb_array_length(p_avatar_paths)
    )
  );
end;
$$;

create or replace function public.search_workbench(p_query text, p_limit int default 6)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_query text := trim(coalesce(p_query, ''));
  v_limit int := least(greatest(coalesce(p_limit, 6), 1), 20);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_query = '' then
    return jsonb_build_object('todos', '[]'::jsonb, 'notes', '[]'::jsonb, 'ledger', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'todos', coalesce((
      select jsonb_agg(to_jsonb(result)) from (
        select t.* from public.todos t
        where t.user_id = v_uid and t.text ilike '%' || v_query || '%'
        order by t.updated_at desc, t.id desc limit v_limit
      ) result
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(to_jsonb(result)) from (
        select n.* from public.notes n
        where n.user_id = v_uid and (
          coalesce(n.title, '') ilike '%' || v_query || '%'
          or n.body ilike '%' || v_query || '%'
          or exists (select 1 from unnest(n.tags) tag where tag ilike '%' || v_query || '%')
        )
        order by n.pinned desc, n.updated_at desc, n.id desc limit v_limit
      ) result
    ), '[]'::jsonb),
    'ledger', coalesce((
      select jsonb_agg(to_jsonb(result)) from (
        select e.* from public.ledger_entries e
        where e.user_id = v_uid and (
          e.category ilike '%' || v_query || '%'
          or coalesce(e.note, '') ilike '%' || v_query || '%'
        )
        order by e.entry_date desc, e.created_at desc, e.id desc limit v_limit
      ) result
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.increment_goal(uuid) from public, anon;
revoke all on function public.adjust_goal(uuid, numeric) from public, anon;
revoke all on function public.complete_pomodoro(date, int) from public, anon;
revoke all on function public.restore_workbench_backup_v2(jsonb, jsonb) from public, anon;
revoke all on function public.search_workbench(text, int) from public, anon;
grant execute on function public.increment_goal(uuid) to authenticated;
grant execute on function public.adjust_goal(uuid, numeric) to authenticated;
grant execute on function public.complete_pomodoro(date, int) to authenticated;
grant execute on function public.restore_workbench_backup_v2(jsonb, jsonb) to authenticated;
grant execute on function public.search_workbench(text, int) to authenticated;
