-- ============================================================
-- 个人工作台 · 模板布局移植增强
-- 1. 番茄钟每日会话表
-- 2. 置顶扩展：todos / habits / goals
-- 3. 笔记卡片布局：标准 / 引文 / 大图 + 图片 URL
-- ============================================================

-- ---------- 番茄钟每日会话 ----------
create table if not exists public.pomodoro_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  count int not null default 0,      -- 当日完成的番茄轮数
  minutes int not null default 0,    -- 当日专注分钟数
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists pomodoro_user_idx on public.pomodoro_sessions (user_id);

alter table public.pomodoro_sessions enable row level security;

drop policy if exists "own pomodoro" on public.pomodoro_sessions;
create policy "own pomodoro" on public.pomodoro_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant all on table public.pomodoro_sessions to anon, authenticated, service_role;

-- ---------- 置顶扩展 ----------
alter table public.todos add column if not exists pinned boolean not null default false;
create index if not exists todos_pinned_idx on public.todos (pinned desc);

alter table public.habits add column if not exists pinned boolean not null default false;
create index if not exists habits_pinned_idx on public.habits (pinned desc);

alter table public.goals add column if not exists pinned boolean not null default false;
create index if not exists goals_pinned_idx on public.goals (pinned desc);

-- ---------- 笔记卡片布局 ----------
alter table public.notes add column if not exists layout text not null default 'default'
  check (layout in ('default', 'feature', 'quote'));
alter table public.notes add column if not exists image_url text;
