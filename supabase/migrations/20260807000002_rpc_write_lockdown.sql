-- Apply only after the frontend release has switched avatar and habit-log
-- mutations to the serialized RPCs introduced by reliability_v3.

revoke insert, update, delete on public.user_avatars from anon, authenticated;
revoke insert, update, delete on public.habit_logs from anon, authenticated;
grant select on public.user_avatars, public.habit_logs to authenticated;
