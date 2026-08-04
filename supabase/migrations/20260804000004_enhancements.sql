-- ============================================================
-- 个人工作台 · 增强迁移
-- 1. 待办支持日期规划（due_date）
-- 2. 内容记录支持置顶（pinned）
-- 3. 用户偏好表（自定义分类、月预算）
-- ============================================================

-- ---------- 待办：日期规划 ----------
alter table public.todos add column if not exists due_date date;
create index if not exists todos_due_idx on public.todos (due_date);

-- ---------- 内容记录：置顶 ----------
alter table public.notes add column if not exists pinned boolean not null default false;
create index if not exists notes_pinned_idx on public.notes (pinned desc);

-- ---------- 用户偏好 ----------
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  categories jsonb not null default '{"expense": [], "income": []}'::jsonb,
  monthly_budget numeric(12, 2),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "own preferences" on public.user_preferences;
create policy "own preferences" on public.user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant all on table public.user_preferences to anon, authenticated, service_role;
