-- Restore is destructive replacement, not a cross-device merge. Writes that
-- were waiting on the revision lock run after commit, but old-ID mutations can
-- become no-ops because the restored rows receive new IDs.
create or replace function public.restore_workbench_backup_v3(
  p_payload jsonb,
  p_avatar_paths jsonb default '[]'::jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  if coalesce((p_payload#>>'{metadata,version}')::int, 0) <> 3 then raise exception 'unsupported backup version'; end if;
  if v_source_version not in (1, 2, 3) then raise exception 'unsupported source backup version'; end if;
  if v_source_version = 3 and (p_expected_revision is null or p_expected_revision < 0) then
    raise exception 'expected revision required';
  end if;
  if jsonb_typeof(p_avatar_paths) <> 'array' then raise exception 'invalid avatar paths'; end if;
  if jsonb_array_length(p_avatar_paths) > 5 then raise exception 'too many avatars'; end if;
  if (select count(*) from jsonb_array_elements(p_avatar_paths) x where coalesce((x->>'is_active')::boolean,false)) > 1 then
    raise exception 'multiple active avatars';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('avatar:' || v_uid::text, 0));
  insert into public.user_data_revisions (user_id) values (v_uid) on conflict (user_id) do nothing;
  select revision into v_revision from public.user_data_revisions where user_id=v_uid for update;
  if v_source_version = 3 and v_revision <> p_expected_revision then raise exception 'revision conflict'; end if;

  v_deleted_counts := jsonb_build_object(
    'todos', (select count(*) from public.todos where user_id = v_uid),
    'habits', (select count(*) from public.habits where user_id = v_uid),
    'habit_logs', (select count(*) from public.habit_logs where user_id = v_uid),
    'ledger_entries', (select count(*) from public.ledger_entries where user_id = v_uid),
    'goals', (select count(*) from public.goals where user_id = v_uid),
    'notes', (select count(*) from public.notes where user_id = v_uid),
    'practice_problems', (select count(*) from public.practice_problems where user_id = v_uid),
    'workout_sessions', (select count(*) from public.workout_sessions where user_id = v_uid),
    'workout_exercises', (
      select count(*) from public.workout_exercises e
      join public.workout_sessions s on s.id = e.session_id
      where s.user_id = v_uid
    ),
    'body_metrics', (select count(*) from public.body_metrics where user_id = v_uid),
    'pomodoro_sessions', (select count(*) from public.pomodoro_sessions where user_id = v_uid),
    'user_preferences', (select count(*) from public.user_preferences where user_id = v_uid),
    'user_avatars', (select count(*) from public.user_avatars where user_id = v_uid)
  );

  perform set_config('workbench.restore_mode','on',true);
  v_v2_payload := jsonb_set(p_payload, '{metadata,version}', '2'::jsonb, true);
  v_result := public.restore_workbench_backup_v2(v_v2_payload, p_avatar_paths);
  perform set_config('workbench.restore_mode','off',true);
  update public.user_data_revisions set revision = revision + 1, updated_at=now() where user_id=v_uid;
  return v_result || jsonb_build_object(
    'deleted_counts', v_deleted_counts,
    'revision', v_revision + 1
  );
end;
$$;

revoke all on function public.restore_workbench_backup_v3(jsonb,jsonb,bigint) from public, anon;
grant execute on function public.restore_workbench_backup_v3(jsonb,jsonb,bigint) to authenticated;
