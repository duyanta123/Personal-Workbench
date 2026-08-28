-- V8 keeps the existing atomic staged-restore protocol but removes the old
-- 50k/200k/40MiB ceilings. V1-V7 clients still enforce their own 40MiB input
-- limit; V8 uses the streaming client and these larger server guards.

create table if not exists private.workbench_restore_limits (
  singleton boolean primary key default true check (singleton),
  max_table_rows bigint not null check (max_table_rows between 1 and 1000000),
  max_total_rows bigint not null check (max_total_rows between 1 and 5000000),
  max_total_bytes bigint not null check (max_total_bytes between 1048576 and 4294967296),
  max_chunk_rows int not null check (max_chunk_rows between 1 and 500),
  max_chunk_bytes int not null check (max_chunk_bytes between 65536 and 1048576),
  updated_at timestamptz not null default now()
);

insert into private.workbench_restore_limits
  (singleton,max_table_rows,max_total_rows,max_total_bytes,max_chunk_rows,max_chunk_bytes)
values (true,500000,2000000,2147483648,500,921600)
on conflict (singleton) do nothing;

revoke all on table private.workbench_restore_limits from public, anon, authenticated;

create or replace function public.begin_restore(
  p_expected_revision bigint, p_source_version int, p_manifest jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_revision bigint; v_epoch bigint; v_id uuid;
  v_table text; v_expected bigint; v_total bigint := 0;
  v_limits private.workbench_restore_limits%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'expected revision required'; end if;
  if p_source_version not between 1 and 7 then raise exception 'unsupported source backup version'; end if;
  if pg_catalog.jsonb_typeof(p_manifest) <> 'object' then raise exception 'invalid manifest'; end if;
  select * into strict v_limits from private.workbench_restore_limits where singleton;
  foreach v_table in array private.workbench_backup_tables_v7() loop
    begin v_expected := coalesce((p_manifest->>v_table)::bigint,0);
    exception when others then raise exception 'invalid manifest count for %',v_table; end;
    if v_expected < 0 or v_expected > v_limits.max_table_rows then raise exception 'table row limit exceeded: %',v_table; end if;
    v_total := v_total + v_expected;
  end loop;
  if v_total > v_limits.max_total_rows then raise exception 'total row limit exceeded'; end if;
  perform public.lock_user_data_revision(v_uid);
  select revision,restore_epoch into v_revision,v_epoch from public.user_data_revisions where user_id=v_uid;
  if v_revision <> p_expected_revision then raise exception 'revision conflict'; end if;
  delete from private.workbench_restore_jobs where user_id=v_uid and created_at < pg_catalog.now()-interval '24 hours';
  insert into private.workbench_restore_jobs(user_id,expected_revision,expected_epoch,source_version,manifest)
    values(v_uid,v_revision,v_epoch,p_source_version,p_manifest) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.stage_restore_chunk(
  p_restore_id uuid, p_table text, p_chunk_index int, p_rows jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_count int; v_bytes int; v_checksum text; v_existing text;
  v_total_rows bigint; v_total_bytes bigint;
  v_limits private.workbench_restore_limits%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not (p_table = any(private.workbench_backup_tables_v7())) then raise exception 'unsupported restore table'; end if;
  if p_chunk_index is null or p_chunk_index < 0 then raise exception 'invalid chunk index'; end if;
  if pg_catalog.jsonb_typeof(p_rows) <> 'array' then raise exception 'chunk rows must be an array'; end if;
  if not exists(select 1 from private.workbench_restore_jobs where id=p_restore_id and user_id=v_uid and status='staging') then raise exception 'restore job not found'; end if;
  select * into strict v_limits from private.workbench_restore_limits where singleton;
  v_count := pg_catalog.jsonb_array_length(p_rows); v_bytes := pg_catalog.octet_length(p_rows::text);
  if v_count > v_limits.max_chunk_rows then raise exception 'chunk row limit exceeded'; end if;
  if v_bytes > v_limits.max_chunk_bytes then raise exception 'chunk byte limit exceeded'; end if;
  v_checksum := pg_catalog.md5(p_rows::text);
  select checksum into v_existing from private.workbench_restore_chunks where restore_id=p_restore_id and table_name=p_table and chunk_index=p_chunk_index;
  if found then if v_existing <> v_checksum then raise exception 'chunk checksum mismatch'; end if; return; end if;
  select coalesce(pg_catalog.sum(row_count),0),coalesce(pg_catalog.sum(byte_count),0) into v_total_rows,v_total_bytes from private.workbench_restore_chunks where restore_id=p_restore_id;
  if v_total_rows+v_count > v_limits.max_total_rows then raise exception 'total row limit exceeded'; end if;
  if v_total_bytes+v_bytes > v_limits.max_total_bytes then raise exception 'restore byte limit exceeded'; end if;
  insert into private.workbench_restore_chunks(restore_id,table_name,chunk_index,row_count,byte_count,checksum,rows)
    values(p_restore_id,p_table,p_chunk_index,v_count,v_bytes,v_checksum,p_rows);
end;
$$;

create or replace function public.get_backup_health()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_table text;
  v_count bigint;
  v_bytes bigint;
  v_total bigint := 0;
  v_total_bytes bigint := 0;
  v_avatar_bytes bigint := 0;
  v_counts jsonb := '{}'::jsonb;
  v_limits private.workbench_restore_limits%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into strict v_limits from private.workbench_restore_limits where singleton;
  foreach v_table in array private.workbench_backup_tables_v7() loop
    execute pg_catalog.format(
      'select pg_catalog.count(*),coalesce(pg_catalog.sum(pg_catalog.octet_length(pg_catalog.to_jsonb(t)::text)+1),0) from public.%I t where user_id = $1',
      v_table
    ) into v_count,v_bytes using v_uid;
    v_counts := v_counts || pg_catalog.jsonb_build_object(v_table,v_count);
    v_total := v_total + v_count;
    v_total_bytes := v_total_bytes + v_bytes;
  end loop;
  select coalesce(pg_catalog.sum(coalesce((metadata->>'size')::bigint,0)),0)
    into v_avatar_bytes
    from storage.objects
    where bucket_id='avatars' and (storage.foldername(name))[1]=v_uid::text;
  return pg_catalog.jsonb_build_object(
    'table_rows',v_counts,
    'total_rows',v_total,
    'max_table_rows',v_limits.max_table_rows,
    'max_total_rows',v_limits.max_total_rows,
    'estimated_export_bytes',v_total_bytes+v_avatar_bytes+65536,
    'thresholds',pg_catalog.jsonb_build_array(0.6,0.8,0.95)
  );
end;
$$;

revoke all on function public.begin_restore(bigint,int,jsonb) from public, anon;
revoke all on function public.stage_restore_chunk(uuid,text,int,jsonb) from public, anon;
revoke all on function public.get_backup_health() from public, anon;
grant execute on function public.begin_restore(bigint,int,jsonb) to authenticated;
grant execute on function public.stage_restore_chunk(uuid,text,int,jsonb) to authenticated;
grant execute on function public.get_backup_health() to authenticated;
