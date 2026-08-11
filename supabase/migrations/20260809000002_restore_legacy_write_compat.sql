-- The RPC-only frontend has not been released yet. Keep legacy authenticated
-- writes available during the compatibility window; RLS still restricts rows
-- to their owner. Revoke these grants in a new migration after frontend rollout.
grant insert, update, delete on public.user_avatars to authenticated;
grant insert, update, delete on public.habit_logs to authenticated;
