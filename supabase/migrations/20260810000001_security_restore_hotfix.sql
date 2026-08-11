-- Forward-only hotfix for the already deployed 20260806-20260809 migrations.
-- Do not edit the historical migrations: they are present in remote migration history.

-- Future objects are opt-in for API roles. The bootstrap migration granted broad
-- defaults to anon/authenticated, which makes a forgotten RLS policy dangerous.
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Current frontend access, expressed without TRUNCATE/REFERENCES/TRIGGER privileges.
grant select, insert, update, delete on table
  public.todos,
  public.habits,
  public.habit_logs,
  public.ledger_entries,
  public.goals,
  public.notes,
  public.practice_problems,
  public.workout_sessions,
  public.workout_exercises,
  public.body_metrics,
  public.pomodoro_sessions,
  public.user_preferences,
  public.user_avatars
to authenticated;
grant select on table public.user_data_revisions to authenticated;

-- Use make_date so the function is genuinely immutable and independent of DateStyle.
create or replace function public.workbench_month_start(p_month text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid month';
  end if;
  return pg_catalog.make_date(
    pg_catalog.substr(p_month, 1, 4)::int,
    pg_catalog.substr(p_month, 6, 2)::int,
    1
  );
end;
$$;

-- Correct the text[] initializer reported by plpgsql_check while preserving behavior.
create or replace function public.upsert_avatar(p_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_avatar_id uuid;
  v_evicted text[] := array[]::text[];
  v_old record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if pg_catalog.left(p_path, pg_catalog.length(v_uid::text) + 1) <> v_uid::text || '/' then
    raise exception 'invalid path';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('avatar:' || v_uid::text, 0));

  update public.user_avatars set is_active = false where user_id = v_uid and is_active;
  insert into public.user_avatars (user_id, storage_path, is_active)
  values (v_uid, p_path, true)
  returning id into v_avatar_id;

  for v_old in
    select id, storage_path from public.user_avatars
    where user_id = v_uid and not is_active
    order by created_at asc, id asc
  loop
    exit when (select pg_catalog.count(*) from public.user_avatars where user_id = v_uid) <= 5;
    v_evicted := pg_catalog.array_append(v_evicted, v_old.storage_path);
    delete from public.user_avatars where id = v_old.id;
  end loop;
  return pg_catalog.jsonb_build_object('avatar_id', v_avatar_id, 'evicted_paths', v_evicted);
end;
$$;

-- Every restore compares against the target account revision. Backup source
-- version only controls compatibility normalization; it never weakens locking.
create or replace function public.restore_workbench_backup_v3(
  p_payload jsonb,
  p_avatar_paths jsonb default '[]'::jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_result jsonb;
  v_v2_payload jsonb;
  v_deleted_counts jsonb;
  v_source_version int := coalesce((p_payload#>>'{metadata,source_version}')::int, 3);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce((p_payload#>>'{metadata,version}')::int, 0) <> 3 then
    raise exception 'unsupported backup version';
  end if;
  if v_source_version not in (1, 2, 3) then raise exception 'unsupported source backup version'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'expected revision required'; end if;
  if pg_catalog.jsonb_typeof(p_avatar_paths) <> 'array' then raise exception 'invalid avatar paths'; end if;
  if pg_catalog.jsonb_array_length(p_avatar_paths) > 5 then raise exception 'too many avatars'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_avatar_paths) x
    where pg_catalog.jsonb_typeof(x) <> 'object'
      or x->>'path' is null
      or pg_catalog.length(x->>'path') > 512
      or pg_catalog.left(x->>'path', pg_catalog.length(v_uid::text) + 1) <> v_uid::text || '/'
      or pg_catalog.lower(pg_catalog.right(x->>'path', 5)) <> '.webp'
  ) then
    raise exception 'invalid avatar path';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(p_avatar_paths) x
      where coalesce((x->>'is_active')::boolean, false)) > 1 then
    raise exception 'multiple active avatars';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('avatar:' || v_uid::text, 0));
  insert into public.user_data_revisions (user_id) values (v_uid) on conflict (user_id) do nothing;
  select revision into v_revision from public.user_data_revisions where user_id = v_uid for update;
  if v_revision <> p_expected_revision then raise exception 'revision conflict'; end if;

  v_deleted_counts := pg_catalog.jsonb_build_object(
    'todos', (select pg_catalog.count(*) from public.todos where user_id = v_uid),
    'habits', (select pg_catalog.count(*) from public.habits where user_id = v_uid),
    'habit_logs', (select pg_catalog.count(*) from public.habit_logs where user_id = v_uid),
    'ledger_entries', (select pg_catalog.count(*) from public.ledger_entries where user_id = v_uid),
    'goals', (select pg_catalog.count(*) from public.goals where user_id = v_uid),
    'notes', (select pg_catalog.count(*) from public.notes where user_id = v_uid),
    'practice_problems', (select pg_catalog.count(*) from public.practice_problems where user_id = v_uid),
    'workout_sessions', (select pg_catalog.count(*) from public.workout_sessions where user_id = v_uid),
    'workout_exercises', (
      select pg_catalog.count(*) from public.workout_exercises e
      join public.workout_sessions s on s.id = e.session_id where s.user_id = v_uid
    ),
    'body_metrics', (select pg_catalog.count(*) from public.body_metrics where user_id = v_uid),
    'pomodoro_sessions', (select pg_catalog.count(*) from public.pomodoro_sessions where user_id = v_uid),
    'user_preferences', (select pg_catalog.count(*) from public.user_preferences where user_id = v_uid),
    'user_avatars', (select pg_catalog.count(*) from public.user_avatars where user_id = v_uid)
  );

  perform pg_catalog.set_config('workbench.restore_mode', 'on', true);
  v_v2_payload := pg_catalog.jsonb_set(p_payload, '{metadata,version}', '2'::jsonb, true);
  v_result := public.restore_workbench_backup_v2(v_v2_payload, p_avatar_paths);
  perform pg_catalog.set_config('workbench.restore_mode', 'off', true);
  update public.user_data_revisions
  set revision = revision + 1, updated_at = pg_catalog.now()
  where user_id = v_uid;

  return v_result || pg_catalog.jsonb_build_object(
    'deleted_counts', v_deleted_counts,
    'revision', v_revision + 1
  );
end;
$$;

-- Legacy V2 is an implementation detail only. V3 remains temporarily available
-- for the deployed client, but now always requires a target revision.
revoke all on function public.restore_workbench_backup_v2(jsonb, jsonb) from public, anon, authenticated;

-- Explicit public API allowlist after revoking inherited/default EXECUTE.
grant execute on function public.increment_goal(uuid) to authenticated;
grant execute on function public.adjust_goal(uuid, numeric) to authenticated;
grant execute on function public.complete_pomodoro(date, int) to authenticated;
grant execute on function public.restore_workbench_backup_v3(jsonb, jsonb, bigint) to authenticated;
grant execute on function public.search_workbench(text, int) to authenticated;
grant execute on function public.get_user_data_revision() to authenticated;
grant execute on function public.upsert_avatar(text) to authenticated;
grant execute on function public.set_active_avatar(uuid) to authenticated;
grant execute on function public.delete_avatar(uuid) to authenticated;
grant execute on function public.set_habit_log(uuid, date, boolean) to authenticated;
grant execute on function public.create_todo(text, text, date, boolean, boolean) to authenticated;
grant execute on function public.move_todo(uuid, uuid, text) to authenticated;
grant execute on function public.get_today_todos(date, int) to authenticated;
grant execute on function public.get_focus_items(date, int) to authenticated;
grant execute on function public.get_note_stats(date) to authenticated;
grant execute on function public.get_note_stats_range(timestamptz, timestamptz) to authenticated;
grant execute on function public.get_ledger_summary(text) to authenticated;
grant execute on function public.get_habit_stats(date) to authenticated;
grant execute on function public.get_practice_page(int, int, text, text, text, text) to authenticated;
grant execute on function public.get_practice_stats(date, text) to authenticated;
grant execute on function public.get_workout_stats(date, text) to authenticated;
grant execute on function public.get_dashboard_summary(date, text) to authenticated;
grant execute on function public.get_workbench_insights(date, text) to authenticated;
grant execute on function public.export_workbench_backup_v3() to authenticated;
