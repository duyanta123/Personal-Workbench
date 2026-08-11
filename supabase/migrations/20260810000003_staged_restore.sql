-- Chunked, idempotent restore upload. Live data is only touched by finalize_restore,
-- which delegates to the transactional V3 restore after rechecking revision.

create table if not exists private.workbench_restore_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expected_revision bigint not null check (expected_revision >= 0),
  expected_epoch bigint not null check (expected_epoch >= 0),
  source_version int not null check (source_version in (1, 2, 3)),
  manifest jsonb not null,
  status text not null default 'staging' check (status in ('staging', 'finalizing')),
  created_at timestamptz not null default now()
);
create index if not exists workbench_restore_jobs_user_idx
  on private.workbench_restore_jobs (user_id, created_at desc);

create table if not exists private.workbench_restore_chunks (
  restore_id uuid not null references private.workbench_restore_jobs(id) on delete cascade,
  table_name text not null,
  chunk_index int not null check (chunk_index >= 0),
  row_count int not null check (row_count between 0 and 500),
  byte_count int not null check (byte_count between 0 and 1048576),
  checksum text not null,
  rows jsonb not null,
  primary key (restore_id, table_name, chunk_index)
);

create or replace function public.begin_restore(
  p_expected_revision bigint,
  p_source_version int,
  p_manifest jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_epoch bigint;
  v_id uuid;
  v_table text;
  v_expected bigint;
  v_total bigint := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'expected revision required'; end if;
  if p_source_version not in (1, 2, 3) then raise exception 'unsupported source backup version'; end if;
  if pg_catalog.jsonb_typeof(p_manifest) <> 'object' then raise exception 'invalid manifest'; end if;

  foreach v_table in array array[
    'todos','habits','habit_logs','ledger_entries','goals','notes','practice_problems',
    'workout_sessions','workout_exercises','body_metrics','pomodoro_sessions','user_preferences'
  ] loop
    begin
      v_expected := coalesce((p_manifest->>v_table)::bigint, 0);
    exception when others then
      raise exception 'invalid manifest count for %', v_table;
    end;
    if v_expected < 0 or v_expected > 50000 then raise exception 'table row limit exceeded: %', v_table; end if;
    v_total := v_total + v_expected;
  end loop;
  if v_total > 200000 then raise exception 'total row limit exceeded'; end if;

  perform public.lock_user_data_revision(v_uid);
  select revision, restore_epoch into v_revision, v_epoch
  from public.user_data_revisions where user_id = v_uid;
  if v_revision <> p_expected_revision then raise exception 'revision conflict'; end if;

  delete from private.workbench_restore_jobs
  where user_id = v_uid and created_at < pg_catalog.now() - interval '24 hours';

  insert into private.workbench_restore_jobs
    (user_id, expected_revision, expected_epoch, source_version, manifest)
  values (v_uid, v_revision, v_epoch, p_source_version, p_manifest)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.stage_restore_chunk(
  p_restore_id uuid,
  p_table text,
  p_chunk_index int,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
  v_bytes int;
  v_checksum text;
  v_existing text;
  v_total_rows bigint;
  v_total_bytes bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_table not in (
    'todos','habits','habit_logs','ledger_entries','goals','notes','practice_problems',
    'workout_sessions','workout_exercises','body_metrics','pomodoro_sessions','user_preferences'
  ) then raise exception 'unsupported restore table'; end if;
  if p_chunk_index is null or p_chunk_index < 0 then raise exception 'invalid chunk index'; end if;
  if pg_catalog.jsonb_typeof(p_rows) <> 'array' then raise exception 'chunk rows must be an array'; end if;
  if not exists (select 1 from private.workbench_restore_jobs
    where id = p_restore_id and user_id = v_uid and status = 'staging') then
    raise exception 'restore job not found';
  end if;

  v_count := pg_catalog.jsonb_array_length(p_rows);
  v_bytes := pg_catalog.octet_length(p_rows::text);
  if v_count > 500 then raise exception 'chunk row limit exceeded'; end if;
  if v_bytes > 1048576 then raise exception 'chunk byte limit exceeded'; end if;
  v_checksum := pg_catalog.md5(p_rows::text);

  select checksum into v_existing from private.workbench_restore_chunks
  where restore_id = p_restore_id and table_name = p_table and chunk_index = p_chunk_index;
  if found then
    if v_existing <> v_checksum then raise exception 'chunk checksum mismatch'; end if;
    return;
  end if;

  select coalesce(pg_catalog.sum(row_count), 0), coalesce(pg_catalog.sum(byte_count), 0)
  into v_total_rows, v_total_bytes
  from private.workbench_restore_chunks where restore_id = p_restore_id;
  if v_total_rows + v_count > 200000 then raise exception 'total row limit exceeded'; end if;
  if v_total_bytes + v_bytes > 41943040 then raise exception 'restore byte limit exceeded'; end if;

  insert into private.workbench_restore_chunks
    (restore_id, table_name, chunk_index, row_count, byte_count, checksum, rows)
  values (p_restore_id, p_table, p_chunk_index, v_count, v_bytes, v_checksum, p_rows);
end;
$$;

create or replace function public.finalize_restore(
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
  v_rows jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_payload jsonb;
  v_result jsonb;
  v_epoch bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_job from private.workbench_restore_jobs
  where id = p_restore_id and user_id = v_uid for update;
  if not found or v_job.status <> 'staging' then raise exception 'restore job not found'; end if;
  if v_job.created_at < pg_catalog.now() - interval '24 hours' then raise exception 'restore job expired'; end if;
  if pg_catalog.jsonb_typeof(p_avatar_paths) <> 'array' or pg_catalog.jsonb_array_length(p_avatar_paths) > 5 then
    raise exception 'invalid avatar paths';
  end if;

  update private.workbench_restore_jobs set status = 'finalizing' where id = p_restore_id;

  foreach v_table in array array[
    'todos','habits','habit_logs','ledger_entries','goals','notes','practice_problems',
    'workout_sessions','workout_exercises','body_metrics','pomodoro_sessions','user_preferences'
  ] loop
    v_expected := coalesce((v_job.manifest->>v_table)::bigint, 0);
    select coalesce(pg_catalog.sum(row_count), 0) into v_actual
    from private.workbench_restore_chunks
    where restore_id = p_restore_id and table_name = v_table;
    if v_actual <> v_expected then raise exception 'restore manifest mismatch: %', v_table; end if;

    select pg_catalog.count(*), pg_catalog.min(chunk_index), pg_catalog.max(chunk_index)
    into v_chunk_count, v_min_chunk, v_max_chunk
    from private.workbench_restore_chunks
    where restore_id = p_restore_id and table_name = v_table;
    if v_expected = 0 and v_chunk_count <> 0 then raise exception 'unexpected empty-table chunks: %', v_table; end if;
    if v_expected > 0 and (v_min_chunk <> 0 or v_max_chunk + 1 <> v_chunk_count) then
      raise exception 'missing or non-contiguous restore chunks: %', v_table;
    end if;

    select coalesce(pg_catalog.jsonb_agg(item.value order by c.chunk_index, item.ordinality), '[]'::jsonb)
    into v_rows
    from private.workbench_restore_chunks c
    cross join lateral pg_catalog.jsonb_array_elements(c.rows) with ordinality as item(value, ordinality)
    where c.restore_id = p_restore_id and c.table_name = v_table;
    v_tables := pg_catalog.jsonb_set(v_tables, array[v_table], v_rows, true);
  end loop;

  select restore_epoch into v_epoch from public.user_data_revisions
  where user_id = v_uid for update;
  if v_epoch <> v_job.expected_epoch then raise exception 'restore epoch conflict'; end if;

  v_payload := pg_catalog.jsonb_build_object(
    'metadata', pg_catalog.jsonb_build_object(
      'version', 3,
      'source_version', v_job.source_version,
      'source_revision', v_job.expected_revision
    ),
    'tables', v_tables
  );
  v_result := public.restore_workbench_backup_v3(v_payload, p_avatar_paths, v_job.expected_revision);

  update public.user_data_revisions
  set restore_epoch = restore_epoch + 1, updated_at = pg_catalog.now()
  where user_id = v_uid
  returning restore_epoch into v_epoch;
  delete from private.workbench_restore_jobs where id = p_restore_id;
  return v_result || pg_catalog.jsonb_build_object('restore_epoch', v_epoch);
end;
$$;

create or replace function public.abort_restore(p_restore_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  delete from private.workbench_restore_jobs where id = p_restore_id and user_id = v_uid;
end;
$$;

revoke all on function public.begin_restore(bigint, int, jsonb) from public, anon;
revoke all on function public.stage_restore_chunk(uuid, text, int, jsonb) from public, anon;
revoke all on function public.finalize_restore(uuid, jsonb) from public, anon;
revoke all on function public.abort_restore(uuid) from public, anon;
grant execute on function public.begin_restore(bigint, int, jsonb) to authenticated;
grant execute on function public.stage_restore_chunk(uuid, text, int, jsonb) to authenticated;
grant execute on function public.finalize_restore(uuid, jsonb) to authenticated;
grant execute on function public.abort_restore(uuid) to authenticated;
