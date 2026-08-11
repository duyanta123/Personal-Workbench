-- Idempotent write protocol and restore epoch. Only security-definer RPCs can
-- access the private receipt table.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.user_data_revisions
  add column if not exists restore_epoch bigint not null default 0;

create table if not exists private.workbench_operation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  restore_epoch bigint not null,
  operation_kind text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
create index if not exists workbench_operation_receipts_created_idx
  on private.workbench_operation_receipts (user_id, created_at desc);

create or replace function public.get_user_sync_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_epoch bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.user_data_revisions (user_id) values (v_uid) on conflict (user_id) do nothing;
  select revision, restore_epoch into v_revision, v_epoch
  from public.user_data_revisions where user_id = v_uid for share;
  return pg_catalog.jsonb_build_object('revision', v_revision, 'restore_epoch', v_epoch);
end;
$$;

create or replace function public.apply_workbench_operation(
  p_operation_id uuid,
  p_restore_epoch bigint,
  p_kind text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_epoch bigint;
  v_previous private.workbench_operation_receipts%rowtype;
  v_response jsonb;
  v_todo public.todos;
  v_habit public.habits;
  v_ledger public.ledger_entries;
  v_goal public.goals;
  v_note public.notes;
  v_problem public.practice_problems;
  v_session public.workout_sessions;
  v_exercise public.workout_exercises;
  v_pomodoro public.pomodoro_sessions;
  v_solved_at date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_operation_id is null then raise exception 'operation id required'; end if;
  if p_restore_epoch is null or p_restore_epoch < 0 then raise exception 'restore epoch required'; end if;
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid payload'; end if;

  perform public.lock_user_data_revision(v_uid);
  select restore_epoch into v_epoch from public.user_data_revisions where user_id = v_uid;
  if v_epoch <> p_restore_epoch then raise exception 'stale restore epoch'; end if;

  select * into v_previous from private.workbench_operation_receipts
  where user_id = v_uid and operation_id = p_operation_id;
  if found then
    if v_previous.operation_kind <> p_kind or v_previous.restore_epoch <> p_restore_epoch then
      raise exception 'operation id reused';
    end if;
    return v_previous.response;
  end if;

  case p_kind
    when 'todo.create' then
      insert into public.todos (id, user_id, text, level, done, pinned, due_date, sort_order)
      values (
        p_operation_id, v_uid, p_payload->>'text', coalesce(p_payload->>'level', 'mid'),
        coalesce((p_payload->>'done')::boolean, false),
        coalesce((p_payload->>'pinned')::boolean, false),
        nullif(p_payload->>'due_date', '')::date,
        coalesce((select pg_catalog.max(sort_order) + 1024 from public.todos
          where user_id = v_uid and pinned = coalesce((p_payload->>'pinned')::boolean, false)), 0)
      ) returning * into v_todo;
      v_response := pg_catalog.to_jsonb(v_todo);

    when 'habit.create' then
      insert into public.habits (id, user_id, name, emoji, pinned)
      values (p_operation_id, v_uid, p_payload->>'name', coalesce(p_payload->>'emoji', 'flame'),
        coalesce((p_payload->>'pinned')::boolean, false))
      returning * into v_habit;
      v_response := pg_catalog.to_jsonb(v_habit);

    when 'ledger.create' then
      insert into public.ledger_entries (id, user_id, kind, category, amount, note, entry_date)
      values (p_operation_id, v_uid, p_payload->>'kind', p_payload->>'category',
        (p_payload->>'amount')::numeric, p_payload->>'note', (p_payload->>'entry_date')::date)
      returning * into v_ledger;
      v_response := pg_catalog.to_jsonb(v_ledger);

    when 'goal.create' then
      insert into public.goals (id, user_id, name, emoji, current, target, unit, note, pinned)
      values (p_operation_id, v_uid, p_payload->>'name', coalesce(p_payload->>'emoji', 'target'),
        coalesce((p_payload->>'current')::numeric, 0), (p_payload->>'target')::numeric,
        p_payload->>'unit', p_payload->>'note', coalesce((p_payload->>'pinned')::boolean, false))
      returning * into v_goal;
      v_response := pg_catalog.to_jsonb(v_goal);

    when 'goal.adjust' then
      update public.goals
      set current = least(target, greatest(0, current + (p_payload->>'delta')::numeric)),
          updated_at = pg_catalog.now()
      where id = (p_payload->>'goal_id')::uuid and user_id = v_uid
      returning * into v_goal;
      if v_goal.id is null then raise exception 'goal not found'; end if;
      v_response := pg_catalog.to_jsonb(v_goal);

    when 'note.create' then
      if not public.is_jsonb_string_array(coalesce(p_payload->'tags', '[]'::jsonb)) then
        raise exception 'invalid tags';
      end if;
      insert into public.notes (id, user_id, title, body, tags, pinned, layout, image_url)
      values (p_operation_id, v_uid, p_payload->>'title', p_payload->>'body',
        array(select pg_catalog.jsonb_array_elements_text(coalesce(p_payload->'tags', '[]'::jsonb))),
        coalesce((p_payload->>'pinned')::boolean, false),
        coalesce(p_payload->>'layout', 'default'), p_payload->>'image_url')
      returning * into v_note;
      v_response := pg_catalog.to_jsonb(v_note);

    when 'practice.create' then
      if not public.is_jsonb_string_array(coalesce(p_payload->'tags', '[]'::jsonb)) then
        raise exception 'invalid tags';
      end if;
      v_solved_at := nullif(p_payload->>'solved_at', '')::date;
      insert into public.practice_problems
        (id, user_id, title, platform, difficulty, status, tags, url, note, solved_at)
      values (p_operation_id, v_uid, p_payload->>'title', coalesce(p_payload->>'platform', 'leetcode'),
        coalesce(p_payload->>'difficulty', 'medium'), coalesce(p_payload->>'status', 'todo'),
        array(select pg_catalog.jsonb_array_elements_text(coalesce(p_payload->'tags', '[]'::jsonb))),
        p_payload->>'url', p_payload->>'note', v_solved_at)
      returning * into v_problem;
      v_response := pg_catalog.to_jsonb(v_problem);

    when 'workout_session.create' then
      insert into public.workout_sessions (id, user_id, date, body_part, duration_min, note)
      values (p_operation_id, v_uid, (p_payload->>'date')::date,
        coalesce(p_payload->>'body_part', 'full'),
        nullif(p_payload->>'duration_min', '')::int, p_payload->>'note')
      returning * into v_session;
      v_response := pg_catalog.to_jsonb(v_session);

    when 'workout_exercise.create' then
      if not exists (select 1 from public.workout_sessions
        where id = (p_payload->>'session_id')::uuid and user_id = v_uid) then
        raise exception 'workout session not found';
      end if;
      insert into public.workout_exercises (id, session_id, name, sets, reps, weight, note)
      values (p_operation_id, (p_payload->>'session_id')::uuid, p_payload->>'name',
        coalesce((p_payload->>'sets')::int, 0),
        coalesce((p_payload->>'reps')::int, 0),
        coalesce((p_payload->>'weight')::numeric, 0), p_payload->>'note')
      returning * into v_exercise;
      v_response := pg_catalog.to_jsonb(v_exercise);

    when 'pomodoro.complete' then
      if (p_payload->>'minutes')::int <= 0 or (p_payload->>'minutes')::int > 240 then
        raise exception 'invalid minutes';
      end if;
      insert into public.pomodoro_sessions (user_id, date, count, minutes)
      values (v_uid, (p_payload->>'date')::date, 1, (p_payload->>'minutes')::int)
      on conflict (user_id, date) do update
        set count = public.pomodoro_sessions.count + 1,
            minutes = public.pomodoro_sessions.minutes + excluded.minutes
      returning * into v_pomodoro;
      v_response := pg_catalog.to_jsonb(v_pomodoro);

    when 'avatar.register' then
      v_response := public.upsert_avatar(p_payload->>'path');

    else
      raise exception 'unsupported operation kind';
  end case;

  insert into private.workbench_operation_receipts
    (user_id, operation_id, restore_epoch, operation_kind, response)
  values (v_uid, p_operation_id, p_restore_epoch, p_kind, v_response);
  return v_response;
end;
$$;

revoke all on function public.get_user_sync_state() from public, anon;
revoke all on function public.apply_workbench_operation(uuid, bigint, text, jsonb) from public, anon;
grant execute on function public.get_user_sync_state() to authenticated;
grant execute on function public.apply_workbench_operation(uuid, bigint, text, jsonb) to authenticated;
