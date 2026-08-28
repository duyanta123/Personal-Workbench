-- V8 is a streaming container around the V7 relational model.  Give it an
-- explicit source marker so the old V1-V7 staged clients retain their 40 MiB
-- / 200k-row guard while V8 can use the configurable larger limits.

alter table private.workbench_restore_jobs
  drop constraint if exists workbench_restore_jobs_source_version_check;
alter table private.workbench_restore_jobs
  add constraint workbench_restore_jobs_source_version_check
  check (source_version between 1 and 8);

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
  v_limits private.workbench_restore_limits%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'expected revision required'; end if;
  if p_source_version not between 1 and 8 then raise exception 'unsupported source backup version'; end if;
  if pg_catalog.jsonb_typeof(p_manifest) <> 'object' then raise exception 'invalid manifest'; end if;
  select * into strict v_limits from private.workbench_restore_limits where singleton;

  foreach v_table in array private.workbench_backup_tables_v7() loop
    begin
      v_expected := coalesce((p_manifest->>v_table)::bigint, 0);
    exception when others then
      raise exception 'invalid manifest count for %', v_table;
    end;
    if v_expected < 0 then raise exception 'invalid manifest count for %', v_table; end if;
    if p_source_version < 8 and v_expected > 50000 then
      raise exception 'legacy table row limit exceeded: %', v_table;
    end if;
    if p_source_version = 8 and v_expected > v_limits.max_table_rows then
      raise exception 'table row limit exceeded: %', v_table;
    end if;
    v_total := v_total + v_expected;
  end loop;
  if p_source_version < 8 and v_total > 200000 then
    raise exception 'legacy total row limit exceeded';
  end if;
  if p_source_version = 8 and v_total > v_limits.max_total_rows then
    raise exception 'total row limit exceeded';
  end if;

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
  v_source_version int;
  v_limits private.workbench_restore_limits%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not (p_table = any(private.workbench_backup_tables_v7())) then raise exception 'unsupported restore table'; end if;
  if p_chunk_index is null or p_chunk_index < 0 then raise exception 'invalid chunk index'; end if;
  if pg_catalog.jsonb_typeof(p_rows) <> 'array' then raise exception 'chunk rows must be an array'; end if;
  select source_version into v_source_version
  from private.workbench_restore_jobs
  where id = p_restore_id and user_id = v_uid and status = 'staging';
  if not found then raise exception 'restore job not found'; end if;
  select * into strict v_limits from private.workbench_restore_limits where singleton;

  v_count := pg_catalog.jsonb_array_length(p_rows);
  v_bytes := pg_catalog.octet_length(p_rows::text);
  if v_count > v_limits.max_chunk_rows then raise exception 'chunk row limit exceeded'; end if;
  if v_bytes > v_limits.max_chunk_bytes then raise exception 'chunk byte limit exceeded'; end if;
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
  if v_source_version < 8 and v_total_rows + v_count > 200000 then
    raise exception 'legacy total row limit exceeded';
  end if;
  if v_source_version < 8 and v_total_bytes + v_bytes > 41943040 then
    raise exception 'legacy restore byte limit exceeded';
  end if;
  if v_source_version = 8 and v_total_rows + v_count > v_limits.max_total_rows then
    raise exception 'total row limit exceeded';
  end if;
  if v_source_version = 8 and v_total_bytes + v_bytes > v_limits.max_total_bytes then
    raise exception 'restore byte limit exceeded';
  end if;
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
  v_restore_source_version int;
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

  foreach v_table in array private.workbench_backup_tables_v7() loop
    v_expected := coalesce((v_job.manifest->>v_table)::bigint, 0);
    select coalesce(pg_catalog.sum(row_count), 0), pg_catalog.count(*),
      pg_catalog.min(chunk_index), pg_catalog.max(chunk_index)
    into v_actual, v_chunk_count, v_min_chunk, v_max_chunk
    from private.workbench_restore_chunks
    where restore_id = p_restore_id and table_name = v_table;
    if v_actual <> v_expected then raise exception 'restore manifest mismatch: %', v_table; end if;
    if v_expected = 0 and v_chunk_count <> 0 then raise exception 'unexpected empty-table chunks: %', v_table; end if;
    if v_expected > 0 and (v_min_chunk <> 0 or v_max_chunk + 1 <> v_chunk_count) then
      raise exception 'missing restore chunks: %', v_table;
    end if;
    select coalesce(pg_catalog.jsonb_agg(item.value order by c.chunk_index, item.ordinality), '[]'::jsonb)
    into v_rows
    from private.workbench_restore_chunks c
    cross join lateral pg_catalog.jsonb_array_elements(c.rows) with ordinality as item(value, ordinality)
    where c.restore_id = p_restore_id and c.table_name = v_table;
    v_tables := pg_catalog.jsonb_set(v_tables, array[v_table], v_rows, true);
  end loop;

  select restore_epoch into v_epoch from public.user_data_revisions where user_id = v_uid for update;
  if v_epoch <> v_job.expected_epoch then raise exception 'restore epoch conflict'; end if;
  -- V8 uses the V7 row model; the marker is only consumed by the staging
  -- limits above and must not be passed to the V7 relational restore parser.
  v_restore_source_version := least(v_job.source_version, 7);
  v_payload := pg_catalog.jsonb_build_object(
    'metadata', pg_catalog.jsonb_build_object(
      'version', 7, 'source_version', v_restore_source_version,
      'source_revision', v_job.expected_revision
    ),
    'tables', v_tables
  );
  v_result := public.restore_workbench_backup_v7(v_payload, p_avatar_paths, v_job.expected_revision);
  update public.user_data_revisions set restore_epoch = restore_epoch + 1, updated_at = pg_catalog.now()
  where user_id = v_uid returning restore_epoch into v_epoch;
  delete from private.workbench_restore_jobs where id = p_restore_id;
  return v_result || pg_catalog.jsonb_build_object('restore_epoch', v_epoch);
end;
$$;

revoke all on function public.begin_restore(bigint, int, jsonb) from public, anon;
revoke all on function public.stage_restore_chunk(uuid, text, int, jsonb) from public, anon;
revoke all on function public.finalize_restore(uuid, jsonb) from public, anon;
grant execute on function public.begin_restore(bigint, int, jsonb) to authenticated;
grant execute on function public.stage_restore_chunk(uuid, text, int, jsonb) to authenticated;
grant execute on function public.finalize_restore(uuid, jsonb) to authenticated;
