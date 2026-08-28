-- All public restore entry points must enforce the same recent-authentication
-- policy as the staged V8 path.  The original implementations are retained
-- under private-ish names so deployed clients keep the existing signatures,
-- while direct calls cannot bypass the server-side guard.

alter function public.restore_workbench_backup_v2(jsonb, jsonb)
  rename to restore_workbench_backup_v2_unchecked;
alter function public.restore_workbench_backup_v3(jsonb, jsonb, bigint)
  rename to restore_workbench_backup_v3_unchecked;
alter function public.restore_workbench_backup_v7(jsonb, jsonb, bigint)
  rename to restore_workbench_backup_v7_unchecked;

alter function public.restore_workbench_backup_v2_unchecked(jsonb, jsonb)
  set schema private;
alter function public.restore_workbench_backup_v3_unchecked(jsonb, jsonb, bigint)
  set schema private;
alter function public.restore_workbench_backup_v7_unchecked(jsonb, jsonb, bigint)
  set schema private;

create or replace function public.restore_workbench_backup_v2(
  p_payload jsonb,
  p_avatar_paths jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_sensitive_auth(300);
  return private.restore_workbench_backup_v2_unchecked(p_payload, p_avatar_paths);
end;
$$;

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
begin
  perform private.require_sensitive_auth(300);
  return private.restore_workbench_backup_v3_unchecked(p_payload, p_avatar_paths, p_expected_revision);
end;
$$;

create or replace function public.restore_workbench_backup_v7(
  p_payload jsonb,
  p_avatar_paths jsonb default '[]'::jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_sensitive_auth(300);
  return private.restore_workbench_backup_v7_unchecked(p_payload, p_avatar_paths, p_expected_revision);
end;
$$;

revoke all on function private.restore_workbench_backup_v2_unchecked(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.restore_workbench_backup_v3_unchecked(jsonb, jsonb, bigint) from public, anon, authenticated;
revoke all on function private.restore_workbench_backup_v7_unchecked(jsonb, jsonb, bigint) from public, anon, authenticated;
-- V2 and V7 direct restore RPCs remain revoked for clients. V3 is retained
-- for the deployed client until post-rollout lockdown, but now shares the
-- server-side recent-authentication check. The staged `finalize_restore`
-- security-definer function can call every wrapper internally.
revoke all on function public.restore_workbench_backup_v2(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.restore_workbench_backup_v3(jsonb, jsonb, bigint) from public, anon;
revoke all on function public.restore_workbench_backup_v7(jsonb, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.restore_workbench_backup_v3(jsonb, jsonb, bigint) to authenticated;
