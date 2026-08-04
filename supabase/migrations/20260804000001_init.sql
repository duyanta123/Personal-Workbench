-- ============================================================
-- 个人工作台 · Supabase 建表 + RLS 脚本
-- 使用方法：Supabase 控制台 → SQL Editor → 粘贴整段执行
-- 或：supabase db push（配合本地 CLI）
-- ============================================================

-- ---------- 扩展 ----------
create extension if not exists "pgcrypto";

-- ---------- 待办 todos ----------
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  level text not null default 'mid' check (level in ('high', 'mid', 'low')),
  done boolean not null default false,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists todos_user_idx on public.todos (user_id);

-- ---------- 习惯 habits + 打卡记录 habit_logs ----------
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  emoji text not null default '✅',
  created_at timestamptz not null default now()
);
create index if not exists habits_user_idx on public.habits (user_id);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);
create index if not exists habit_logs_user_idx on public.habit_logs (user_id);

-- ---------- 记账 ledger_entries ----------
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  category text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  note text,
  entry_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user_idx on public.ledger_entries (user_id);
create index if not exists ledger_date_idx on public.ledger_entries (entry_date desc);

-- ---------- 长期目标 goals ----------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  emoji text not null default '🎯',
  current numeric not null default 0,
  target numeric not null default 1 check (target > 0),
  unit text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals (user_id);

-- ---------- 内容记录 notes ----------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  body text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user_idx on public.notes (user_id);

-- ---------- updated_at 自动更新触发器 ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists todos_set_updated_at on public.todos;
create trigger todos_set_updated_at
  before update on public.todos
  for each row execute function public.set_updated_at();

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------- 目标 +1 的 RPC（带用户校验，安全定义者） ----------
create or replace function public.increment_goal(goal_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.goals
  set current = current + 1, updated_at = now()
  where id = goal_id and user_id = auth.uid();
$$;

-- ---------- 行级安全（RLS）：每个用户只能访问自己的数据 ----------
alter table public.todos enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.goals enable row level security;
alter table public.notes enable row level security;

-- todos
drop policy if exists "own todos" on public.todos;
create policy "own todos" on public.todos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- habits
drop policy if exists "own habits" on public.habits;
create policy "own habits" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- habit_logs
drop policy if exists "own habit logs" on public.habit_logs;
create policy "own habit logs" on public.habit_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ledger_entries
drop policy if exists "own ledger" on public.ledger_entries;
create policy "own ledger" on public.ledger_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- goals
drop policy if exists "own goals" on public.goals;
create policy "own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- notes
drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
