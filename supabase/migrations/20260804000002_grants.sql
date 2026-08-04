-- 为 anon / authenticated / service_role 授权表与序列访问权限（RLS 仍负责行级过滤）
-- 说明：supabase db push 的迁移角色不会自动带默认授权，需显式 GRANT。

grant usage on schema public to anon, authenticated, service_role;

grant all on table public.todos to anon, authenticated, service_role;
grant all on table public.habits to anon, authenticated, service_role;
grant all on table public.habit_logs to anon, authenticated, service_role;
grant all on table public.ledger_entries to anon, authenticated, service_role;
grant all on table public.goals to anon, authenticated, service_role;
grant all on table public.notes to anon, authenticated, service_role;

-- 目标 +1 RPC 函数
grant execute on function public.increment_goal(uuid) to anon, authenticated, service_role;

-- 未来新建表也自动带上默认授权（RLS 兜底行级安全）
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
