-- ============================================================
-- 个人工作台 · 刷题记录
-- 1. 题目表（含平台/难度/状态/标签/完成日期）
-- ============================================================

create table if not exists public.practice_problems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  platform text not null default 'leetcode',
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  status text not null default 'todo'
    check (status in ('todo', 'doing', 'ac_solo', 'ac_hint', 'failed')),
  tags text[] not null default '{}',
  url text,
  note text,
  solved_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists practice_user_idx on public.practice_problems (user_id);
create index if not exists practice_solved_idx on public.practice_problems (solved_at desc);

-- updated_at 自动更新触发器（复用既有 set_updated_at 函数）
drop trigger if exists practice_set_updated_at on public.practice_problems;
create trigger practice_set_updated_at
  before update on public.practice_problems
  for each row execute function public.set_updated_at();

alter table public.practice_problems enable row level security;

drop policy if exists "own practice" on public.practice_problems;
create policy "own practice" on public.practice_problems
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
