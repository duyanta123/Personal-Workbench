-- ============================================================
-- 个人工作台 · 课表管理
-- 1. 课程 courses（含周次范围/单双周）
-- 2. 课程节次 course_slots（周几 + 节次区间）
-- 3. 作业 assignments
-- 4. 考试 exams
-- ============================================================

-- ---------- 课程 ----------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  teacher text,
  location text,
  color text not null default 'm1',
  start_week int not null default 1,
  end_week int not null default 16,
  odd_even text not null default 'all' check (odd_even in ('all', 'odd', 'even')),
  created_at timestamptz not null default now()
);
create index if not exists courses_user_idx on public.courses (user_id);

-- ---------- 课程节次 ----------
create table if not exists public.course_slots (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  weekday int not null check (weekday between 1 and 7),
  start_section int not null check (start_section between 1 and 12),
  end_section int not null check (end_section between 1 and 12 and end_section >= start_section)
);
create index if not exists course_slots_course_idx on public.course_slots (course_id);

-- ---------- 作业 ----------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  title text not null,
  due_date date,
  done boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists assignments_user_idx on public.assignments (user_id);
create index if not exists assignments_due_idx on public.assignments (due_date);

-- ---------- 考试 ----------
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  name text not null,
  exam_date date not null,
  location text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists exams_user_idx on public.exams (user_id);
create index if not exists exams_date_idx on public.exams (exam_date);

-- ---------- RLS ----------
alter table public.courses enable row level security;
alter table public.course_slots enable row level security;
alter table public.assignments enable row level security;
alter table public.exams enable row level security;

drop policy if exists "own courses" on public.courses;
create policy "own courses" on public.courses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 节次表无 user_id，通过课程归属校验
drop policy if exists "own course slots" on public.course_slots;
create policy "own course slots" on public.course_slots
  for all using (
    exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid())
  );

drop policy if exists "own assignments" on public.assignments;
create policy "own assignments" on public.assignments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own exams" on public.exams;
create policy "own exams" on public.exams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
