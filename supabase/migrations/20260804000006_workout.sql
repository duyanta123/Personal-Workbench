-- ============================================================
-- 个人工作台 · 健身记录
-- 1. 训练会话 workout_sessions
-- 2. 动作明细 workout_exercises（挂在会话下）
-- 3. 身体数据 body_metrics（每天一条）
-- ============================================================

-- ---------- 训练会话 ----------
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null default current_date,
  body_part text not null default 'full',
  duration_min int,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists workout_sessions_user_idx on public.workout_sessions (user_id);
create index if not exists workout_sessions_date_idx on public.workout_sessions (date desc);

-- ---------- 动作明细 ----------
create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  name text not null,
  sets int not null default 0,
  reps int not null default 0,
  weight numeric(8,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists workout_exercises_session_idx on public.workout_exercises (session_id);

-- ---------- 身体数据 ----------
create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null default current_date,
  weight numeric(6,2),
  body_fat numeric(5,2),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists body_metrics_user_idx on public.body_metrics (user_id);

-- ---------- RLS ----------
alter table public.workout_sessions enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.body_metrics enable row level security;

drop policy if exists "own workout sessions" on public.workout_sessions;
create policy "own workout sessions" on public.workout_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 动作表无 user_id，通过父会话归属校验
drop policy if exists "own workout exercises" on public.workout_exercises;
create policy "own workout exercises" on public.workout_exercises
  for all using (
    exists (select 1 from public.workout_sessions s
            where s.id = session_id and s.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.workout_sessions s
            where s.id = session_id and s.user_id = auth.uid())
  );

drop policy if exists "own body metrics" on public.body_metrics;
create policy "own body metrics" on public.body_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
