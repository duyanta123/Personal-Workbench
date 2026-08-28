-- The staged restore protocol is itself a sensitive operation. Guard the
-- begin and stage calls as well as finalize; guarding only the relational
-- parser would still allow an old session to create/hold restore jobs.

alter function public.begin_restore(bigint, int, jsonb)
  rename to begin_restore_unchecked;
alter function public.stage_restore_chunk(uuid, text, int, jsonb)
  rename to stage_restore_chunk_unchecked;
alter function public.finalize_restore(uuid, jsonb)
  rename to finalize_restore_unchecked;

alter function public.begin_restore_unchecked(bigint, int, jsonb)
  set schema private;
alter function public.stage_restore_chunk_unchecked(uuid, text, int, jsonb)
  set schema private;
alter function public.finalize_restore_unchecked(uuid, jsonb)
  set schema private;

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
begin
  perform private.require_sensitive_auth(300);
  return private.begin_restore_unchecked(p_expected_revision, p_source_version, p_manifest);
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
begin
  perform private.require_sensitive_auth(300);
  perform private.stage_restore_chunk_unchecked(p_restore_id, p_table, p_chunk_index, p_rows);
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
begin
  perform private.require_sensitive_auth(300);
  return private.finalize_restore_unchecked(p_restore_id, p_avatar_paths);
end;
$$;

revoke all on function private.begin_restore_unchecked(bigint, int, jsonb) from public, anon, authenticated;
revoke all on function private.stage_restore_chunk_unchecked(uuid, text, int, jsonb) from public, anon, authenticated;
revoke all on function private.finalize_restore_unchecked(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.begin_restore(bigint, int, jsonb) from public, anon;
revoke all on function public.stage_restore_chunk(uuid, text, int, jsonb) from public, anon;
revoke all on function public.finalize_restore(uuid, jsonb) from public, anon;
grant execute on function public.begin_restore(bigint, int, jsonb) to authenticated;
grant execute on function public.stage_restore_chunk(uuid, text, int, jsonb) to authenticated;
grant execute on function public.finalize_restore(uuid, jsonb) to authenticated;
