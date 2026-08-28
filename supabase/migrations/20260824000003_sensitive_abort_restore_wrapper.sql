-- Aborting a staged restore mutates private restore state and therefore must
-- use the same recent-authentication/AAL2 policy as begin, stage and finalize.

alter function public.abort_restore(uuid)
  rename to abort_restore_unchecked;
alter function public.abort_restore_unchecked(uuid)
  set schema private;

create or replace function public.abort_restore(p_restore_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_sensitive_auth(300);
  perform private.abort_restore_unchecked(p_restore_id);
end;
$$;

revoke all on function private.abort_restore_unchecked(uuid) from public, anon, authenticated;
revoke all on function public.abort_restore(uuid) from public, anon;
grant execute on function public.abort_restore(uuid) to authenticated;
