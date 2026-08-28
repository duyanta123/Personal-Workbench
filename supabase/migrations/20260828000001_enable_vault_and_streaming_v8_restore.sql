-- The scheduler reads secrets through Vault.  Declare the extension explicitly
-- so a fresh local/hosted database has the same dependency as the runtime SQL.
create extension if not exists supabase_vault with schema vault;

-- Preserve the V1-V7 staged finalizer before replacing the implementation.
-- The public wrapper below dispatches by source_version so already-deployed
-- clients continue to restore their legacy JSON chunks.
alter function private.finalize_restore_unchecked(uuid, jsonb)
  rename to finalize_restore_legacy_unchecked;

-- V8 stages bounded JSONB chunks, but must not aggregate all chunks into one
-- JSONB document at finalize time.  Restore each row from its chunk directly
-- into the relational table instead.
create or replace function private.restore_v8_insert_chunk(
  p_user_id uuid,
  p_table text,
  p_rows jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_inserted bigint := 0;
begin
  if p_user_id is null then raise exception 'restore user required'; end if;
  if not (p_table = any(private.workbench_backup_tables_v7())) then
    raise exception 'unsupported restore table';
  end if;
  if pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'restore chunk rows must be an array';
  end if;

  for v_row in select value from pg_catalog.jsonb_array_elements(p_rows) loop
    -- jsonb_populate_record ignores unknown fields and maps the current V8
    -- row shape to the current table type.  Override ownership explicitly so
    -- a backup can never write rows for a different account.
    execute pg_catalog.format(
      'insert into public.%I select (pg_catalog.jsonb_populate_record(null::public.%I, pg_catalog.jsonb_set($1, ''{user_id}'', pg_catalog.to_jsonb($2), true))).*',
      p_table,
      p_table
    ) using v_row, p_user_id;
    v_inserted := v_inserted + 1;
  end loop;
  return v_inserted;
end;
$$;

revoke all on function private.restore_v8_insert_chunk(uuid, text, jsonb)
  from public, anon, authenticated;

create or replace function private.finalize_restore_v8_unchecked(
  p_restore_id uuid,
  p_avatar_paths jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job private.workbench_restore_jobs%rowtype;
  v_table text;
  v_expected bigint;
  v_actual bigint;
  v_chunk_count bigint;
  v_min_chunk int;
  v_max_chunk int;
  v_epoch bigint;
  v_revision bigint;
  v_inserted bigint;
  v_old_avatar_paths jsonb;
  v_deleted_counts jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_path text;
  v_row jsonb;
  v_insert_order text[] := array[
    'recurrence_rules','ledger_accounts','ledger_payees','todos',
    'todo_status_history','habits','habit_logs','ledger_entries',
    'ledger_rules','ledger_splits','ledger_reconciliations','goals',
    'notes','practice_problems','workout_sessions','workout_exercises',
    'body_metrics','pomodoro_sessions','user_preferences','inbox_items',
    'workbench_templates','saved_views','entity_links'
  ];
  v_delete_order text[] := array[
    'todo_status_history','entity_links','ledger_splits',
    'ledger_reconciliations','habit_logs','workout_exercises','todos',
    'ledger_entries','recurrence_rules','ledger_rules','ledger_payees',
    'ledger_accounts','habits','goals','notes','practice_problems',
    'workout_sessions','body_metrics','pomodoro_sessions','user_preferences',
    'inbox_items','workbench_templates','saved_views'
  ];
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_job
  from private.workbench_restore_jobs
  where id = p_restore_id and user_id = v_uid
  for update;
  if not found or v_job.status <> 'staging' then
    raise exception 'restore job not found';
  end if;
  if v_job.created_at < pg_catalog.now() - interval '24 hours' then
    raise exception 'restore job expired';
  end if;
  if v_job.source_version <> 8 then
    -- V1-V7 staged clients retain the original relational parser and limits.
    raise exception 'streaming finalizer requires V8 source';
  end if;
  if pg_catalog.jsonb_typeof(p_avatar_paths) <> 'array'
    or pg_catalog.jsonb_array_length(p_avatar_paths) > 5 then
    raise exception 'invalid avatar paths';
  end if;
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
  if (select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(p_avatar_paths) x
      where coalesce((x->>'is_active')::boolean, false)) > 1 then
    raise exception 'multiple active avatars';
  end if;

  update private.workbench_restore_jobs
  set status = 'finalizing'
  where id = p_restore_id;

  -- Validate every manifest and chunk before deleting any user data.  The
  -- unique primary key makes the min/max/count continuity check sufficient to
  -- detect gaps without materializing the rows themselves.
  foreach v_table in array private.workbench_backup_tables_v7() loop
    v_expected := coalesce((v_job.manifest->>v_table)::bigint, 0);
    select coalesce(pg_catalog.sum(row_count), 0), pg_catalog.count(*),
      pg_catalog.min(chunk_index), pg_catalog.max(chunk_index)
    into v_actual, v_chunk_count, v_min_chunk, v_max_chunk
    from private.workbench_restore_chunks
    where restore_id = p_restore_id and table_name = v_table;
    if v_actual <> v_expected then
      raise exception 'restore manifest mismatch: %', v_table;
    end if;
    if v_expected = 0 and v_chunk_count <> 0 then
      raise exception 'unexpected empty-table chunks: %', v_table;
    end if;
    if v_expected > 0 and (v_min_chunk <> 0 or v_max_chunk + 1 <> v_chunk_count) then
      raise exception 'missing restore chunks: %', v_table;
    end if;
    v_counts := v_counts || pg_catalog.jsonb_build_object(v_table, v_expected);
  end loop;

  select revision, restore_epoch into v_revision, v_epoch
  from public.user_data_revisions
  where user_id = v_uid
  for update;
  if v_revision <> v_job.expected_revision then
    raise exception 'revision conflict';
  end if;
  if v_epoch <> v_job.expected_epoch then
    raise exception 'restore epoch conflict';
  end if;

  foreach v_table in array v_delete_order loop
    execute pg_catalog.format(
      'select pg_catalog.count(*) from public.%I where user_id = $1', v_table
    ) into v_actual using v_uid;
    v_deleted_counts := v_deleted_counts || pg_catalog.jsonb_build_object(v_table, v_actual);
  end loop;
  select coalesce(pg_catalog.jsonb_agg(storage_path), '[]'::jsonb)
  into v_old_avatar_paths
  from public.user_avatars
  where user_id = v_uid;
  v_deleted_counts := v_deleted_counts || pg_catalog.jsonb_build_object(
    'avatars', (select pg_catalog.count(*) from public.user_avatars where user_id = v_uid)
  );
  v_counts := v_counts || pg_catalog.jsonb_build_object(
    'avatars', pg_catalog.jsonb_array_length(p_avatar_paths)
  );

  perform pg_catalog.set_config('workbench.restore_mode', 'on', true);
  foreach v_table in array v_delete_order loop
    execute pg_catalog.format('delete from public.%I where user_id = $1', v_table)
      using v_uid;
  end loop;
  delete from public.user_avatars where user_id = v_uid;

  -- Insert in dependency order.  Each call consumes one bounded chunk, so no
  -- operation constructs a database-sized JSONB value.
  foreach v_table in array v_insert_order loop
    for v_row in
      select c.rows
      from private.workbench_restore_chunks c
      where c.restore_id = p_restore_id and c.table_name = v_table
      order by c.chunk_index
    loop
      v_inserted := private.restore_v8_insert_chunk(v_uid, v_table, v_row);
    end loop;
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(p_avatar_paths) loop
    v_path := v_row->>'path';
    insert into public.user_avatars(user_id, storage_path, is_active, created_at)
    values (v_uid, v_path, coalesce((v_row->>'is_active')::boolean, false),
      coalesce((v_row->>'created_at')::timestamptz, pg_catalog.now()));
  end loop;

  -- V8 bypasses the V7 JSON parser, so enforce the same ledger invariant here.
  if exists (
    select 1
    from public.ledger_entries e
    left join public.user_preferences p on p.user_id = e.user_id
    where e.user_id = v_uid
      and coalesce(e.currency_code, 'CNY') <> coalesce(p.currency_code, 'CNY')
  ) then
    raise exception 'restore ledger currency must match base currency';
  end if;
  if exists (
    select 1 from public.ledger_entries
    where user_id = v_uid
    group by user_id
    having pg_catalog.count(distinct coalesce(currency_code, 'CNY')) > 1
  ) then
    raise exception 'restore contains multiple ledger currencies';
  end if;

  perform pg_catalog.set_config('workbench.restore_mode', 'off', true);
  update public.user_data_revisions
  set revision = revision + 1, restore_epoch = restore_epoch + 1,
      updated_at = pg_catalog.now()
  where user_id = v_uid
  returning restore_epoch into v_epoch;
  delete from private.workbench_restore_jobs where id = p_restore_id;
  return pg_catalog.jsonb_build_object(
    'old_avatar_paths', v_old_avatar_paths,
    'counts', v_counts,
    'deleted_counts', v_deleted_counts,
    'revision', v_revision + 1,
    'restore_epoch', v_epoch
  );
end;
$$;

revoke all on function private.finalize_restore_v8_unchecked(uuid, jsonb)
  from public, anon, authenticated;

create or replace function private.finalize_restore_unchecked(
  p_restore_id uuid,
  p_avatar_paths jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_version int;
begin
  select source_version into v_source_version
  from private.workbench_restore_jobs
  where id = p_restore_id and user_id = auth.uid();
  if v_source_version is null then raise exception 'restore job not found'; end if;
  if v_source_version = 8 then
    return private.finalize_restore_v8_unchecked(p_restore_id, p_avatar_paths);
  end if;
  return private.finalize_restore_legacy_unchecked(p_restore_id, p_avatar_paths);
end;
$$;

revoke all on function private.finalize_restore_legacy_unchecked(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function private.finalize_restore_unchecked(uuid, jsonb)
  from public, anon, authenticated;
