-- Keep the legacy implementation callable only by trusted wrapper functions,
-- but remove session-temporary table references so plpgsql_check can verify it.

create or replace function public.restore_workbench_backup_v2(
  p_payload jsonb,
  p_avatar_paths jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_pref jsonb;
  v_old_avatar_paths jsonb;
  v_path text;
  v_tables jsonb := coalesce(p_payload->'tables', '{}'::jsonb);
  v_habit_map jsonb := '{}'::jsonb;
  v_session_map jsonb := '{}'::jsonb;
  v_new_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce((p_payload#>>'{metadata,version}')::int, 0) <> 2 then
    raise exception 'unsupported backup version';
  end if;
  if pg_catalog.jsonb_typeof(p_avatar_paths) <> 'array' then raise exception 'invalid avatar paths'; end if;
  if pg_catalog.jsonb_array_length(p_avatar_paths) > 5 then raise exception 'too many avatars'; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(p_avatar_paths) x
      where coalesce((x->>'is_active')::boolean, false)) > 1 then
    raise exception 'multiple active avatars';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('avatar:' || v_uid::text, 0));

  select coalesce(pg_catalog.jsonb_agg(storage_path), '[]'::jsonb)
  into v_old_avatar_paths from public.user_avatars where user_id = v_uid;

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

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'todos', '[]'::jsonb)) loop
    insert into public.todos (user_id, text, level, done, sort_order, due_date, pinned, created_at, updated_at)
    values (v_uid, v_row->>'text', coalesce(v_row->>'level', 'mid'),
      coalesce((v_row->>'done')::boolean, false), coalesce((v_row->>'sort_order')::bigint, 0),
      nullif(v_row->>'due_date', '')::date, coalesce((v_row->>'pinned')::boolean, false),
      coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz, pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'habits', '[]'::jsonb)) loop
    v_new_id := gen_random_uuid();
    v_habit_map := pg_catalog.jsonb_set(v_habit_map, array[v_row->>'id'], pg_catalog.to_jsonb(v_new_id::text), true);
    insert into public.habits (id, user_id, name, emoji, pinned, created_at)
    values (v_new_id, v_uid, v_row->>'name', coalesce(v_row->>'emoji', 'flame'),
      coalesce((v_row->>'pinned')::boolean, false), coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'habit_logs', '[]'::jsonb)) loop
    v_new_id := nullif(v_habit_map->>(v_row->>'habit_id'), '')::uuid;
    if v_new_id is null then raise exception 'habit log references missing habit'; end if;
    insert into public.habit_logs (habit_id, user_id, log_date, created_at)
    values (v_new_id, v_uid, (v_row->>'log_date')::date,
      coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'ledger_entries', '[]'::jsonb)) loop
    insert into public.ledger_entries (user_id, kind, category, amount, note, entry_date, created_at)
    values (v_uid, v_row->>'kind', v_row->>'category', (v_row->>'amount')::numeric,
      v_row->>'note', (v_row->>'entry_date')::date,
      coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'goals', '[]'::jsonb)) loop
    insert into public.goals (user_id, name, emoji, current, target, unit, note, pinned, created_at, updated_at)
    values (v_uid, v_row->>'name', coalesce(v_row->>'emoji', 'target'),
      least(greatest(coalesce((v_row->>'current')::numeric, 0), 0), greatest((v_row->>'target')::numeric, 1)),
      greatest((v_row->>'target')::numeric, 1), v_row->>'unit', v_row->>'note',
      coalesce((v_row->>'pinned')::boolean, false),
      coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz, pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'notes', '[]'::jsonb)) loop
    insert into public.notes (user_id, title, body, tags, pinned, layout, image_url, created_at, updated_at)
    values (v_uid, v_row->>'title', v_row->>'body',
      array(select pg_catalog.jsonb_array_elements_text(coalesce(v_row->'tags', '[]'::jsonb))),
      coalesce((v_row->>'pinned')::boolean, false), coalesce(v_row->>'layout', 'default'), v_row->>'image_url',
      coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz, pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'practice_problems', '[]'::jsonb)) loop
    insert into public.practice_problems
      (user_id, title, platform, difficulty, status, tags, url, note, solved_at, created_at, updated_at)
    values (v_uid, v_row->>'title', coalesce(v_row->>'platform', 'leetcode'),
      coalesce(v_row->>'difficulty', 'medium'), coalesce(v_row->>'status', 'todo'),
      array(select pg_catalog.jsonb_array_elements_text(coalesce(v_row->'tags', '[]'::jsonb))),
      v_row->>'url', v_row->>'note', nullif(v_row->>'solved_at', '')::date,
      coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()),
      coalesce((v_row->>'updated_at')::timestamptz, pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'workout_sessions', '[]'::jsonb)) loop
    v_new_id := gen_random_uuid();
    v_session_map := pg_catalog.jsonb_set(v_session_map, array[v_row->>'id'], pg_catalog.to_jsonb(v_new_id::text), true);
    insert into public.workout_sessions (id, user_id, date, body_part, duration_min, note, created_at)
    values (v_new_id, v_uid, (v_row->>'date')::date, coalesce(v_row->>'body_part', 'full'),
      nullif(v_row->>'duration_min', '')::int, v_row->>'note',
      coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'workout_exercises', '[]'::jsonb)) loop
    v_new_id := nullif(v_session_map->>(v_row->>'session_id'), '')::uuid;
    if v_new_id is null then raise exception 'exercise references missing workout session'; end if;
    insert into public.workout_exercises (session_id, name, sets, reps, weight, note, created_at)
    values (v_new_id, v_row->>'name', coalesce((v_row->>'sets')::int, 0),
      coalesce((v_row->>'reps')::int, 0), coalesce((v_row->>'weight')::numeric, 0),
      v_row->>'note', coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'body_metrics', '[]'::jsonb)) loop
    insert into public.body_metrics (user_id, date, weight, body_fat, note, created_at)
    values (v_uid, (v_row->>'date')::date, nullif(v_row->>'weight', '')::numeric,
      nullif(v_row->>'body_fat', '')::numeric, v_row->>'note',
      coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()));
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_tables->'pomodoro_sessions', '[]'::jsonb)) loop
    insert into public.pomodoro_sessions (user_id, date, count, minutes, created_at)
    values (v_uid, (v_row->>'date')::date, coalesce((v_row->>'count')::int, 0),
      coalesce((v_row->>'minutes')::int, 0),
      coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()));
  end loop;

  if pg_catalog.jsonb_array_length(coalesce(v_tables->'user_preferences', '[]'::jsonb)) > 0 then
    v_pref := v_tables->'user_preferences'->0;
    insert into public.user_preferences (user_id, categories, monthly_budget, pomodoro, updated_at)
    values (v_uid, coalesce(v_pref->'categories', '{"expense":[],"income":[]}'::jsonb),
      nullif(v_pref->>'monthly_budget', '')::numeric,
      coalesce(v_pref->'pomodoro', '{"focus":25,"break":5,"long_break":15,"rounds_per_cycle":4}'::jsonb),
      coalesce((v_pref->>'updated_at')::timestamptz, pg_catalog.now()));
  end if;

  for v_row in select value from pg_catalog.jsonb_array_elements(p_avatar_paths) loop
    v_path := v_row->>'path';
    if v_path is null or pg_catalog.left(v_path, pg_catalog.length(v_uid::text) + 1) <> v_uid::text || '/' then
      raise exception 'invalid avatar path';
    end if;
    insert into public.user_avatars (user_id, storage_path, is_active, created_at)
    values (v_uid, v_path, coalesce((v_row->>'is_active')::boolean, false),
      coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()));
  end loop;

  return pg_catalog.jsonb_build_object(
    'old_avatar_paths', v_old_avatar_paths,
    'counts', pg_catalog.jsonb_build_object(
      'todos', pg_catalog.jsonb_array_length(coalesce(v_tables->'todos', '[]'::jsonb)),
      'habits', pg_catalog.jsonb_array_length(coalesce(v_tables->'habits', '[]'::jsonb)),
      'habit_logs', pg_catalog.jsonb_array_length(coalesce(v_tables->'habit_logs', '[]'::jsonb)),
      'ledger_entries', pg_catalog.jsonb_array_length(coalesce(v_tables->'ledger_entries', '[]'::jsonb)),
      'goals', pg_catalog.jsonb_array_length(coalesce(v_tables->'goals', '[]'::jsonb)),
      'notes', pg_catalog.jsonb_array_length(coalesce(v_tables->'notes', '[]'::jsonb)),
      'practice_problems', pg_catalog.jsonb_array_length(coalesce(v_tables->'practice_problems', '[]'::jsonb)),
      'workout_sessions', pg_catalog.jsonb_array_length(coalesce(v_tables->'workout_sessions', '[]'::jsonb)),
      'workout_exercises', pg_catalog.jsonb_array_length(coalesce(v_tables->'workout_exercises', '[]'::jsonb)),
      'body_metrics', pg_catalog.jsonb_array_length(coalesce(v_tables->'body_metrics', '[]'::jsonb)),
      'pomodoro_sessions', pg_catalog.jsonb_array_length(coalesce(v_tables->'pomodoro_sessions', '[]'::jsonb)),
      'user_preferences', pg_catalog.jsonb_array_length(coalesce(v_tables->'user_preferences', '[]'::jsonb)),
      'avatars', pg_catalog.jsonb_array_length(p_avatar_paths)
    )
  );
end;
$$;

revoke all on function public.restore_workbench_backup_v2(jsonb, jsonb) from public, anon, authenticated;
