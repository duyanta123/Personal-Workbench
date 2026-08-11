-- Reliability V3: ownership-safe mutations, revisioned restore, bounded data,
-- literal search, and lightweight dashboard data sources.

-- Earlier bootstrap migrations granted new functions to anon by default.
-- Keep future RPCs opt-in while retaining the authenticated/service-role grants.
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------- JSON preference validation ----------
create or replace function public.is_jsonb_string_array(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
  for v_item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(v_item) <> 'string' then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.is_valid_pomodoro_pref(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_focus numeric;
  v_break numeric;
  v_long numeric;
  v_rounds numeric;
begin
  if p_value is null or jsonb_typeof(p_value) is distinct from 'object' then return false; end if;
  if jsonb_typeof(p_value->'focus') is distinct from 'number'
    or jsonb_typeof(p_value->'break') is distinct from 'number'
    or jsonb_typeof(p_value->'long_break') is distinct from 'number'
    or jsonb_typeof(p_value->'rounds_per_cycle') is distinct from 'number'
  then
    return false;
  end if;
  begin
    v_focus := (p_value->>'focus')::numeric;
    v_break := (p_value->>'break')::numeric;
    v_long := (p_value->>'long_break')::numeric;
    v_rounds := (p_value->>'rounds_per_cycle')::numeric;
  exception when others then
    return false;
  end;
  if v_focus is null or v_break is null or v_long is null or v_rounds is null then return false; end if;
  return v_focus in (15, 25, 45)
    and v_break in (5, 10, 15)
    and v_long in (10, 15, 20, 30)
    and v_rounds in (2, 3, 4);
end;
$$;

update public.user_preferences
set categories = '{"expense":[],"income":[]}'::jsonb
where jsonb_typeof(categories) <> 'object'
   or not public.is_jsonb_string_array(categories->'expense')
   or not public.is_jsonb_string_array(categories->'income');

update public.user_preferences
set pomodoro = '{"focus":25,"break":5,"long_break":15,"rounds_per_cycle":4}'::jsonb
where not public.is_valid_pomodoro_pref(pomodoro);

update public.user_preferences set monthly_budget = null where monthly_budget is not null and monthly_budget <= 0;

alter table public.user_preferences drop constraint if exists preferences_categories_shape;
alter table public.user_preferences add constraint preferences_categories_shape check (
  jsonb_typeof(categories) = 'object'
  and public.is_jsonb_string_array(categories->'expense')
  and public.is_jsonb_string_array(categories->'income')
);
alter table public.user_preferences drop constraint if exists preferences_pomodoro_shape;
alter table public.user_preferences add constraint preferences_pomodoro_shape check (public.is_valid_pomodoro_pref(pomodoro));
alter table public.user_preferences drop constraint if exists preferences_budget_positive;
alter table public.user_preferences add constraint preferences_budget_positive check (monthly_budget is null or monthly_budget > 0);

-- ---------- Numeric data repair and constraints ----------
update public.workout_sessions set duration_min = 0 where duration_min < 0;
update public.workout_exercises
set sets = greatest(sets, 0), reps = greatest(reps, 0), weight = greatest(weight, 0)
where sets < 0 or reps < 0 or weight < 0;
update public.body_metrics set weight = null where weight < 0;
update public.body_metrics set body_fat = null where body_fat < 0;
update public.pomodoro_sessions
set count = greatest(count, 0), minutes = greatest(minutes, 0)
where count < 0 or minutes < 0;

alter table public.workout_sessions drop constraint if exists workout_duration_nonnegative;
alter table public.workout_sessions add constraint workout_duration_nonnegative check (duration_min is null or duration_min >= 0);
alter table public.workout_exercises drop constraint if exists workout_exercise_nonnegative;
alter table public.workout_exercises add constraint workout_exercise_nonnegative check (sets >= 0 and reps >= 0 and weight >= 0);
alter table public.body_metrics drop constraint if exists body_metric_nonnegative;
alter table public.body_metrics add constraint body_metric_nonnegative check (
  (weight is null or weight >= 0) and (body_fat is null or body_fat >= 0)
);
alter table public.pomodoro_sessions drop constraint if exists pomodoro_aggregate_nonnegative;
alter table public.pomodoro_sessions add constraint pomodoro_aggregate_nonnegative check (count >= 0 and minutes >= 0);

create index if not exists todos_stable_page_idx on public.todos (user_id, pinned desc, sort_order, id);
create index if not exists habits_stable_page_idx on public.habits (user_id, pinned desc, created_at, id);
create index if not exists goals_stable_page_idx on public.goals (user_id, pinned desc, created_at, id);
create index if not exists practice_stable_page_idx on public.practice_problems (user_id, solved_at desc, created_at desc, id desc);
create index if not exists workout_stable_page_idx on public.workout_sessions (user_id, date desc, created_at desc, id desc);
create index if not exists habit_logs_range_idx on public.habit_logs (user_id, log_date, habit_id);

-- ---------- User data revision ----------
create table if not exists public.user_data_revisions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_data_revisions enable row level security;
drop policy if exists "own data revision" on public.user_data_revisions;
create policy "own data revision" on public.user_data_revisions
  for select using (auth.uid() = user_id);
grant select on public.user_data_revisions to authenticated;
revoke insert, update, delete on public.user_data_revisions from anon, authenticated;

insert into public.user_data_revisions (user_id)
select distinct user_id from (
  select user_id from public.todos union all
  select user_id from public.habits union all
  select user_id from public.ledger_entries union all
  select user_id from public.goals union all
  select user_id from public.notes union all
  select user_id from public.practice_problems union all
  select user_id from public.workout_sessions union all
  select user_id from public.body_metrics union all
  select user_id from public.pomodoro_sessions union all
  select user_id from public.user_preferences union all
  select user_id from public.user_avatars
) users
on conflict (user_id) do nothing;

create or replace function public.lock_user_data_revision(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then raise exception 'user required'; end if;
  insert into public.user_data_revisions (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
  perform 1 from public.user_data_revisions where user_id = p_user_id for update;
end;
$$;

create or replace function public.guard_user_data_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if current_setting('workbench.restore_mode', true) = 'on' or v_uid is null then
    return null;
  end if;
  perform public.lock_user_data_revision(v_uid);
  return null;
end;
$$;

create or replace function public.bump_user_data_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_session_id uuid;
begin
  if current_setting('workbench.restore_mode', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'workout_exercises' then
    v_session_id := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
    select user_id into v_uid from public.workout_sessions where id = v_session_id;
    if v_uid is null then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
  else
    v_uid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  end if;

  insert into public.user_data_revisions (user_id, revision, updated_at)
  values (v_uid, 1, now())
  on conflict (user_id) do update
    set revision = public.user_data_revisions.revision + 1, updated_at = now();
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'todos','habits','habit_logs','ledger_entries','goals','notes','practice_problems',
    'workout_sessions','workout_exercises','body_metrics','pomodoro_sessions','user_preferences','user_avatars'
  ] loop
    execute format('drop trigger if exists %I_revision_guard on public.%I', v_table, v_table);
    execute format(
      'create trigger %I_revision_guard before insert or update or delete on public.%I for each statement execute function public.guard_user_data_revision()',
      v_table, v_table
    );
    execute format('drop trigger if exists %I_revision on public.%I', v_table, v_table);
    execute format(
      'create trigger %I_revision before insert or update or delete on public.%I for each row execute function public.bump_user_data_revision()',
      v_table, v_table
    );
  end loop;
end;
$$;

create or replace function public.get_user_data_revision()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.user_data_revisions (user_id) values (v_uid) on conflict (user_id) do nothing;
  -- A shared revision-row lock keeps all trigger-guarded business writes from
  -- committing until this snapshot has been assembled.
  select revision into v_revision from public.user_data_revisions where user_id = v_uid for share;
  return v_revision;
end;
$$;

-- ---------- Avatar invariants and serialized RPCs ----------
with ranked as (
  select id, row_number() over (
    partition by user_id order by is_active desc, created_at desc, id desc
  ) as rn
  from public.user_avatars
)
update public.user_avatars a
set is_active = (r.rn = 1)
from ranked r
where a.id = r.id and a.is_active is distinct from (r.rn = 1);

with ranked as (
  select id, row_number() over (
    partition by user_id order by is_active desc, created_at desc, id desc
  ) as rn
  from public.user_avatars
)
delete from public.user_avatars a using ranked r where a.id = r.id and r.rn > 5;

create unique index if not exists user_avatars_one_active_idx
  on public.user_avatars (user_id) where is_active;

create or replace function public.upsert_avatar(p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_avatar_id uuid;
  v_evicted text[] := '{}';
  v_old record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if left(p_path, length(v_uid::text) + 1) <> v_uid::text || '/' then raise exception 'invalid path'; end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar:' || v_uid::text, 0));

  update public.user_avatars set is_active = false where user_id = v_uid and is_active;
  insert into public.user_avatars (user_id, storage_path, is_active)
  values (v_uid, p_path, true)
  returning id into v_avatar_id;

  for v_old in
    select id, storage_path from public.user_avatars
    where user_id = v_uid and not is_active
    order by created_at asc, id asc
  loop
    exit when (select count(*) from public.user_avatars where user_id = v_uid) <= 5;
    v_evicted := array_append(v_evicted, v_old.storage_path);
    delete from public.user_avatars where id = v_old.id;
  end loop;
  return jsonb_build_object('avatar_id', v_avatar_id, 'evicted_paths', v_evicted);
end;
$$;

create or replace function public.set_active_avatar(p_avatar_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar:' || v_uid::text, 0));
  perform 1 from public.user_avatars where id = p_avatar_id and user_id = v_uid for update;
  if not found then raise exception 'avatar not found'; end if;
  update public.user_avatars set is_active = false where user_id = v_uid and is_active;
  update public.user_avatars set is_active = true where id = p_avatar_id and user_id = v_uid;
end;
$$;

create or replace function public.delete_avatar(p_avatar_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_path text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar:' || v_uid::text, 0));
  select storage_path into v_path from public.user_avatars
  where id = p_avatar_id and user_id = v_uid and not is_active for update;
  if v_path is null then raise exception 'avatar not found or active'; end if;
  delete from public.user_avatars where id = p_avatar_id and user_id = v_uid;
  return v_path;
end;
$$;

grant select on public.user_avatars to authenticated;

-- ---------- Habit ownership and idempotent state RPC ----------
delete from public.habit_logs l
where not exists (
  select 1 from public.habits h where h.id = l.habit_id and h.user_id = l.user_id
);

drop policy if exists "own habit logs" on public.habit_logs;
create policy "own habit logs" on public.habit_logs
  for all
  using (
    auth.uid() = user_id and exists (
      select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id and exists (
      select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()
    )
  );

create or replace function public.set_habit_log(p_habit_id uuid, p_log_date date, p_done boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended('habit:' || v_uid::text || ':' || p_habit_id::text || ':' || p_log_date::text, 0));
  perform public.lock_user_data_revision(v_uid);
  if not exists (select 1 from public.habits where id = p_habit_id and user_id = v_uid) then
    raise exception 'habit not found';
  end if;
  if p_done then
    insert into public.habit_logs (habit_id, user_id, log_date)
    values (p_habit_id, v_uid, p_log_date)
    on conflict (habit_id, log_date) do nothing;
  else
    delete from public.habit_logs
    where habit_id = p_habit_id and user_id = v_uid and log_date = p_log_date;
  end if;
  return p_done;
end;
$$;

-- ---------- Atomic todo creation and movement ----------
create or replace function public.create_todo(
  p_text text,
  p_level text default 'mid',
  p_due_date date default null,
  p_done boolean default false,
  p_pinned boolean default false
)
returns public.todos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order bigint;
  v_todo public.todos;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if trim(coalesce(p_text, '')) = '' then raise exception 'text required'; end if;
  if p_level not in ('high','mid','low') then raise exception 'invalid level'; end if;
  perform pg_advisory_xact_lock(hashtextextended('todo:' || v_uid::text, 0));
  perform public.lock_user_data_revision(v_uid);
  select coalesce(max(sort_order), 0) + 1024 into v_order
  from public.todos where user_id = v_uid and pinned = p_pinned;
  insert into public.todos (user_id, text, level, due_date, done, pinned, sort_order)
  values (v_uid, trim(p_text), p_level, p_due_date, p_done, p_pinned, v_order)
  returning * into v_todo;
  return v_todo;
end;
$$;

create or replace function public.move_todo(p_todo_id uuid, p_anchor_id uuid, p_position text)
returns public.todos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_todo public.todos;
  v_anchor public.todos;
  v_lower bigint;
  v_upper bigint;
  v_new_order bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_todo_id = p_anchor_id then raise exception 'same todo'; end if;
  if p_position not in ('before','after') then raise exception 'invalid position'; end if;
  perform pg_advisory_xact_lock(hashtextextended('todo:' || v_uid::text, 0));
  perform public.lock_user_data_revision(v_uid);
  select * into v_todo from public.todos where id = p_todo_id and user_id = v_uid for update;
  select * into v_anchor from public.todos where id = p_anchor_id and user_id = v_uid for update;
  if v_todo.id is null or v_anchor.id is null then raise exception 'todo not found'; end if;
  if v_todo.pinned <> v_anchor.pinned then raise exception 'cannot move across pinned groups'; end if;

  if p_position = 'before' then
    v_upper := v_anchor.sort_order;
    select sort_order into v_lower from public.todos
    where user_id=v_uid and pinned=v_todo.pinned and id<>p_todo_id
      and (sort_order < v_anchor.sort_order or (sort_order = v_anchor.sort_order and id < v_anchor.id))
    order by sort_order desc, id desc limit 1;
    if v_lower is null then v_new_order := v_upper - 1024;
    elsif v_upper - v_lower > 1 then v_new_order := v_lower + ((v_upper - v_lower) / 2);
    end if;
  else
    v_lower := v_anchor.sort_order;
    select sort_order into v_upper from public.todos
    where user_id=v_uid and pinned=v_todo.pinned and id<>p_todo_id
      and (sort_order > v_anchor.sort_order or (sort_order = v_anchor.sort_order and id > v_anchor.id))
    order by sort_order, id limit 1;
    if v_upper is null then v_new_order := v_lower + 1024;
    elsif v_upper - v_lower > 1 then v_new_order := v_lower + ((v_upper - v_lower) / 2);
    end if;
  end if;

  if v_new_order is null then
    with base as (
      select id, row_number() over (order by sort_order, id)::bigint as pos
      from public.todos
      where user_id = v_uid and pinned = v_todo.pinned and id <> p_todo_id
    ), anchor_pos as (
      select pos + case when p_position = 'after' then 1 else 0 end as pos from base where id=p_anchor_id
    ), positions as (
      select b.id, case when b.pos >= a.pos then b.pos + 1 else b.pos end as pos from base b cross join anchor_pos a
      union all select p_todo_id, pos from anchor_pos
    )
    update public.todos t set sort_order = positions.pos * 1024
    from positions where t.id = positions.id;
  else
    update public.todos set sort_order=v_new_order where id=p_todo_id and user_id=v_uid;
  end if;

  select * into v_todo from public.todos where id = p_todo_id;
  return v_todo;
end;
$$;

-- ---------- Lightweight todo and focus sources ----------
create or replace function public.get_today_todos(p_date date, p_limit int default 50)
returns setof public.todos
language sql
security definer
set search_path = public
as $$
  select t.* from public.todos t
  where t.user_id = auth.uid() and not t.done and (t.due_date is null or t.due_date = p_date)
  order by t.pinned desc, t.sort_order asc, t.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.get_focus_items(p_date date, p_limit int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  return jsonb_build_object(
    'todos', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.todos where user_id = v_uid and pinned and (due_date is null or due_date = p_date)
      order by sort_order, id limit v_limit
    ) x), '[]'::jsonb),
    'habits', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select h.*, exists (
        select 1 from public.habit_logs l where l.habit_id = h.id and l.user_id = v_uid and l.log_date = p_date
      ) as done_today
      from public.habits h where h.user_id = v_uid and h.pinned
      order by h.created_at, h.id limit v_limit
    ) x), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.goals where user_id = v_uid and pinned
      order by created_at, id limit v_limit
    ) x), '[]'::jsonb)
  );
end;
$$;

-- ---------- Literal global search ----------
create or replace function public.search_workbench(p_query text, p_limit int default 6)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_query text := lower(trim(coalesce(p_query, '')));
  v_limit int := least(greatest(coalesce(p_limit, 6), 1), 20);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_query = '' then return jsonb_build_object('todos','[]'::jsonb,'notes','[]'::jsonb,'ledger','[]'::jsonb); end if;
  return jsonb_build_object(
    'todos', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select t.* from public.todos t
      where t.user_id = v_uid and strpos(lower(t.text), v_query) > 0
      order by t.updated_at desc, t.id desc limit v_limit
    ) x), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select n.* from public.notes n
      where n.user_id = v_uid and (
        strpos(lower(coalesce(n.title,'')), v_query) > 0
        or strpos(lower(n.body), v_query) > 0
        or exists (select 1 from unnest(n.tags) tag where strpos(lower(tag), v_query) > 0)
      ) order by n.pinned desc, n.updated_at desc, n.id desc limit v_limit
    ) x), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select e.* from public.ledger_entries e
      where e.user_id = v_uid and (
        strpos(lower(e.category), v_query) > 0 or strpos(lower(coalesce(e.note,'')), v_query) > 0
      ) order by e.entry_date desc, e.created_at desc, e.id desc limit v_limit
    ) x), '[]'::jsonb)
  );
end;
$$;

-- ---------- Server-side pages and aggregates ----------
create or replace function public.workbench_month_start(p_month text)
returns date
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid month';
  end if;
  return (p_month || '-01')::date;
end;
$$;

create or replace function public.get_note_stats(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.notes where user_id = v_uid),
    'pinned', (select count(*) from public.notes where user_id = v_uid and pinned),
    'today', (select count(*) from public.notes
      where user_id = v_uid and created_at >= p_date::timestamp
        and created_at < (p_date + 1)::timestamp),
    'tag_counts', coalesce((
      select jsonb_agg(jsonb_build_array(tag, amount) order by amount desc, tag)
      from (
        select tag, count(*) as amount
        from public.notes n cross join lateral unnest(n.tags) tag
        where n.user_id = v_uid
        group by tag
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_ledger_summary(p_month text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_start date := public.workbench_month_start(p_month);
  v_end date := (v_start + interval '1 month')::date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.ledger_entries where user_id = v_uid),
    'income', coalesce((select sum(amount) from public.ledger_entries
      where user_id = v_uid and kind = 'income' and entry_date >= v_start and entry_date < v_end), 0),
    'expense', coalesce((select sum(amount) from public.ledger_entries
      where user_id = v_uid and kind = 'expense' and entry_date >= v_start and entry_date < v_end), 0),
    'daily_expense', coalesce((
      select jsonb_agg(jsonb_build_object('date', entry_date, 'total', total) order by entry_date)
      from (
        select entry_date, sum(amount) as total from public.ledger_entries
        where user_id = v_uid and kind = 'expense' and entry_date >= v_start and entry_date < v_end
        group by entry_date
      ) x
    ), '[]'::jsonb),
    'category_expense', coalesce((
      select jsonb_agg(jsonb_build_array(category, total) order by total desc, category)
      from (
        select category, sum(amount) as total from public.ledger_entries
        where user_id = v_uid and kind = 'expense' and entry_date >= v_start and entry_date < v_end
        group by category
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_habit_stats(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_month_start date := date_trunc('month', p_date::timestamp)::date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  return jsonb_build_object(
    'month_logged_days', (select count(distinct log_date) from public.habit_logs
      where user_id = v_uid and log_date >= v_month_start and log_date <= p_date),
    'streaks', coalesce((
      with dated as (
        select l.habit_id, l.log_date,
          row_number() over (partition by l.habit_id order by l.log_date desc) as rn
        from public.habit_logs l
        where l.user_id = v_uid and l.log_date <= p_date
      ), streaks as (
        select habit_id,
          count(*) filter (where log_date = p_date - (rn::int - 1))::int as streak
        from dated group by habit_id
      )
      select jsonb_agg(jsonb_build_object(
        'habit_id', h.id, 'name', h.name, 'emoji', h.emoji,
        'streak', coalesce(s.streak, 0)
      ) order by coalesce(s.streak, 0) desc, h.pinned desc, h.created_at, h.id)
      from public.habits h left join streaks s on s.habit_id = h.id
      where h.user_id = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_practice_page(
  p_page int default 0,
  p_page_size int default 50,
  p_query text default '',
  p_platform text default null,
  p_difficulty text default null,
  p_tag text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_page int := greatest(coalesce(p_page, 0), 0);
  v_size int := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_query text := lower(trim(coalesce(p_query, '')));
  v_total bigint;
  v_items jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_difficulty is not null and p_difficulty not in ('easy','medium','hard') then raise exception 'invalid difficulty'; end if;

  with filtered as (
    select p.* from public.practice_problems p
    where p.user_id = v_uid
      and (v_query = '' or strpos(lower(p.title), v_query) > 0
        or exists (select 1 from unnest(p.tags) tag where strpos(lower(tag), v_query) > 0))
      and (p_platform is null or p.platform = p_platform)
      and (p_difficulty is null or p.difficulty = p_difficulty)
      and (p_tag is null or p.tags @> array[p_tag]::text[])
  )
  select count(*) into v_total from filtered;

  with filtered as (
    select p.* from public.practice_problems p
    where p.user_id = v_uid
      and (v_query = '' or strpos(lower(p.title), v_query) > 0
        or exists (select 1 from unnest(p.tags) tag where strpos(lower(tag), v_query) > 0))
      and (p_platform is null or p.platform = p_platform)
      and (p_difficulty is null or p.difficulty = p_difficulty)
      and (p_tag is null or p.tags @> array[p_tag]::text[])
  ), page_rows as (
    select * from filtered
    order by solved_at desc nulls last, created_at desc, id desc
    offset v_page * v_size limit v_size
  )
  select coalesce(jsonb_agg(to_jsonb(page_rows)
    order by solved_at desc nulls last, created_at desc, id desc), '[]'::jsonb)
  into v_items from page_rows;
  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

create or replace function public.get_practice_stats(p_date date, p_month text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_start date := public.workbench_month_start(p_month);
  v_end date := (v_start + interval '1 month')::date;
  v_streak int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  with dated as (
    select solved_at,
      row_number() over (order by solved_at desc) as rn
    from (select distinct solved_at from public.practice_problems
      where user_id = v_uid and solved_at is not null and solved_at <= p_date) d
  )
  select count(*) filter (where solved_at = p_date - (rn::int - 1))::int into v_streak from dated;

  return jsonb_build_object(
    'total', (select count(*) from public.practice_problems where user_id = v_uid),
    'ac_count', (select count(*) from public.practice_problems
      where user_id = v_uid and status in ('ac_solo','ac_hint')),
    'today_solved', (select count(*) from public.practice_problems where user_id = v_uid and solved_at = p_date),
    'month_solved', (select count(*) from public.practice_problems
      where user_id = v_uid and solved_at >= v_start and solved_at < v_end),
    'streak', coalesce(v_streak, 0),
    'difficulty', jsonb_build_object(
      'easy', (select count(*) from public.practice_problems where user_id = v_uid and difficulty='easy'),
      'medium', (select count(*) from public.practice_problems where user_id = v_uid and difficulty='medium'),
      'hard', (select count(*) from public.practice_problems where user_id = v_uid and difficulty='hard')
    ),
    'platforms', coalesce((select jsonb_agg(jsonb_build_array(platform, amount) order by amount desc, platform)
      from (select platform, count(*) amount from public.practice_problems where user_id=v_uid group by platform) x), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(tag order by tag) from (
      select distinct tag from public.practice_problems p cross join lateral unnest(p.tags) tag where p.user_id=v_uid
    ) x), '[]'::jsonb),
    'heatmap', coalesce((select jsonb_agg(jsonb_build_object('date', solved_at, 'count', amount) order by solved_at)
      from (select solved_at, count(*) amount from public.practice_problems
        where user_id=v_uid and solved_at >= v_start and solved_at < v_end group by solved_at) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_workout_stats(p_date date, p_month text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_start date := public.workbench_month_start(p_month);
  v_end date := (v_start + interval '1 month')::date;
  v_week_start date := date_trunc('week', p_date::timestamp)::date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.workout_sessions where user_id=v_uid),
    'month_sessions', (select count(*) from public.workout_sessions
      where user_id=v_uid and date >= v_start and date < v_end),
    'month_minutes', coalesce((select sum(duration_min) from public.workout_sessions
      where user_id=v_uid and date >= v_start and date < v_end), 0),
    'week_sessions', (select count(*) from public.workout_sessions
      where user_id=v_uid and date >= v_week_start and date <= p_date),
    'week_volume', coalesce((select sum(e.sets * e.reps * e.weight)
      from public.workout_exercises e join public.workout_sessions s on s.id=e.session_id
      where s.user_id=v_uid and s.date >= v_week_start and s.date <= p_date), 0),
    'body_parts', coalesce((select jsonb_agg(jsonb_build_array(body_part, amount) order by amount desc, body_part)
      from (select body_part, count(*) amount from public.workout_sessions
        where user_id=v_uid group by body_part) x), '[]'::jsonb),
    'month_body_parts', coalesce((select jsonb_agg(jsonb_build_array(body_part, amount) order by amount desc, body_part)
      from (select body_part, count(*) amount from public.workout_sessions
        where user_id=v_uid and date >= v_start and date < v_end group by body_part) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_dashboard_summary(p_date date, p_month text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_start date := public.workbench_month_start(p_month);
  v_end date := (v_start + interval '1 month')::date;
  v_week_start date := date_trunc('week', p_date::timestamp)::date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  return jsonb_build_object(
    'today_todos', coalesce((select jsonb_agg(to_jsonb(x) order by x.pinned desc, x.sort_order, x.id) from (
      select * from public.todos where user_id=v_uid and (due_date is null or due_date=p_date)
      order by pinned desc, sort_order, id limit 50
    ) x), '[]'::jsonb),
    'habits', coalesce((select jsonb_agg(to_jsonb(x) order by x.pinned desc, x.created_at, x.id) from (
      select * from public.habits where user_id=v_uid order by pinned desc, created_at, id limit 50
    ) x), '[]'::jsonb),
    'habit_logs', coalesce((select jsonb_agg(to_jsonb(x) order by x.log_date, x.id) from (
      select * from public.habit_logs where user_id=v_uid and log_date >= v_week_start and log_date <= p_date
    ) x), '[]'::jsonb),
    'weekly_habits', coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'value', coalesce(x.amount,0)) order by d.day)
      from generate_series(p_date - 6, p_date, interval '1 day') d(day)
      left join (select log_date, count(*) amount from public.habit_logs
        where user_id=v_uid and log_date between p_date - 6 and p_date group by log_date) x
      on x.log_date=d.day::date), '[]'::jsonb),
    'overview', jsonb_build_object(
      'todo_total', (select count(*) from public.todos where user_id=v_uid and (due_date is null or due_date=p_date)),
      'todo_done', (select count(*) from public.todos where user_id=v_uid and done and (due_date is null or due_date=p_date)),
      'habit_total', (select count(*) from public.habits where user_id=v_uid),
      'habit_done', (select count(distinct habit_id) from public.habit_logs where user_id=v_uid and log_date=p_date),
      'goal_total', (select count(*) from public.goals where user_id=v_uid),
      'goal_percent', coalesce((select round(avg(least(1, current / greatest(target,1))) * 100) from public.goals where user_id=v_uid),0),
      'week_workouts', (select count(*) from public.workout_sessions where user_id=v_uid and date >= v_week_start and date <= p_date),
      'ledger_total', (select count(*) from public.ledger_entries where user_id=v_uid),
      'note_total', (select count(*) from public.notes where user_id=v_uid),
      'problem_total', (select count(*) from public.practice_problems where user_id=v_uid),
      'workout_total', (select count(*) from public.workout_sessions where user_id=v_uid),
      'total_records', (
        (select count(*) from public.todos where user_id=v_uid) +
        (select count(*) from public.habits where user_id=v_uid) +
        (select count(*) from public.ledger_entries where user_id=v_uid) +
        (select count(*) from public.goals where user_id=v_uid) +
        (select count(*) from public.notes where user_id=v_uid) +
        (select count(*) from public.practice_problems where user_id=v_uid) +
        (select count(*) from public.workout_sessions where user_id=v_uid)
      ),
      'pinned_total', (
        (select count(*) from public.todos where user_id=v_uid and pinned) +
        (select count(*) from public.habits where user_id=v_uid and pinned) +
        (select count(*) from public.goals where user_id=v_uid and pinned) +
        (select count(*) from public.notes where user_id=v_uid and pinned)
      ),
      'month_income', coalesce((select sum(amount) from public.ledger_entries
        where user_id=v_uid and kind='income' and entry_date>=v_start and entry_date<v_end),0),
      'month_expense', coalesce((select sum(amount) from public.ledger_entries
        where user_id=v_uid and kind='expense' and entry_date>=v_start and entry_date<v_end),0)
    ),
    'expense_categories', coalesce((select jsonb_agg(jsonb_build_array(category,total) order by total desc, category)
      from (select category,sum(amount) total from public.ledger_entries
        where user_id=v_uid and kind='expense' and entry_date>=v_start and entry_date<v_end group by category) x), '[]'::jsonb),
    'fitness', public.get_workout_stats(p_date,p_month)
  );
end;
$$;

create or replace function public.get_workbench_insights(p_date date, p_month text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_start date := public.workbench_month_start(p_month);
  v_end date := (v_start + interval '1 month')::date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  return jsonb_build_object(
    'todos', jsonb_build_object(
      'total',(select count(*) from public.todos where user_id=v_uid),
      'done',(select count(*) from public.todos where user_id=v_uid and done)
    ),
    'habits', jsonb_build_object(
      'total',(select count(*) from public.habits where user_id=v_uid),
      'done_today',(select count(distinct habit_id) from public.habit_logs where user_id=v_uid and log_date=p_date),
      'top_streaks', coalesce((select jsonb_agg(value) from (
        select value from jsonb_array_elements(coalesce(public.get_habit_stats(p_date)->'streaks','[]'::jsonb)) limit 3
      ) x), '[]'::jsonb)
    ),
    'ledger', jsonb_build_object(
      'income',coalesce((select sum(amount) from public.ledger_entries where user_id=v_uid and kind='income' and entry_date>=v_start and entry_date<v_end),0),
      'expense',coalesce((select sum(amount) from public.ledger_entries where user_id=v_uid and kind='expense' and entry_date>=v_start and entry_date<v_end),0)
    ),
    'goals', jsonb_build_object(
      'total',(select count(*) from public.goals where user_id=v_uid),
      'done',(select count(*) from public.goals where user_id=v_uid and current>=target),
      'percent',coalesce((select round(avg(least(1,current/greatest(target,1)))*100) from public.goals where user_id=v_uid),0)
    ),
    'practice', jsonb_build_object(
      'total',(select count(*) from public.practice_problems where user_id=v_uid),
      'ac_count',(select count(*) from public.practice_problems where user_id=v_uid and status in ('ac_solo','ac_hint')),
      'today_solved',(select count(*) from public.practice_problems where user_id=v_uid and solved_at=p_date)
    ),
    'workout', public.get_workout_stats(p_date,p_month),
    'notes', jsonb_build_object(
      'total',(select count(*) from public.notes where user_id=v_uid),
      'tag_count',(select count(distinct tag) from public.notes n cross join lateral unnest(n.tags) tag where n.user_id=v_uid)
    )
  );
end;
$$;

-- ---------- Backup V3 snapshot and revision-safe restore ----------
create or replace function public.export_workbench_backup_v3()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.user_data_revisions (user_id) values (v_uid) on conflict (user_id) do nothing;
  -- Revision triggers lock this row before changing business data. Holding a
  -- shared lock therefore freezes this user's snapshot until the RPC commits.
  select revision into v_revision from public.user_data_revisions
  where user_id = v_uid for share;
  return jsonb_build_object(
    'metadata', jsonb_build_object('version', 3, 'exported_at', now(), 'source_revision', v_revision),
    'tables', jsonb_build_object(
      'todos', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.todos x where x.user_id=v_uid),'[]'::jsonb),
      'habits', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.habits x where x.user_id=v_uid),'[]'::jsonb),
      'habit_logs', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.habit_logs x where x.user_id=v_uid),'[]'::jsonb),
      'ledger_entries', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.ledger_entries x where x.user_id=v_uid),'[]'::jsonb),
      'goals', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.goals x where x.user_id=v_uid),'[]'::jsonb),
      'notes', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.notes x where x.user_id=v_uid),'[]'::jsonb),
      'practice_problems', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.practice_problems x where x.user_id=v_uid),'[]'::jsonb),
      'workout_sessions', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.workout_sessions x where x.user_id=v_uid),'[]'::jsonb),
      'workout_exercises', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.workout_exercises x join public.workout_sessions s on s.id=x.session_id where s.user_id=v_uid),'[]'::jsonb),
      'body_metrics', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.body_metrics x where x.user_id=v_uid),'[]'::jsonb),
      'pomodoro_sessions', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.pomodoro_sessions x where x.user_id=v_uid),'[]'::jsonb),
      'user_preferences', coalesce((select jsonb_agg(to_jsonb(x)) from public.user_preferences x where x.user_id=v_uid),'[]'::jsonb)
    ),
    'avatar_manifest', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (
      select storage_path, is_active, created_at from public.user_avatars where user_id=v_uid
    ) x),'[]'::jsonb)
  );
end;
$$;

create or replace function public.restore_workbench_backup_v3(
  p_payload jsonb,
  p_avatar_paths jsonb default '[]'::jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_result jsonb;
  v_v2_payload jsonb;
  v_source_version int := coalesce((p_payload#>>'{metadata,source_version}')::int, 3);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce((p_payload#>>'{metadata,version}')::int, 0) <> 3 then raise exception 'unsupported backup version'; end if;
  if v_source_version not in (1, 2, 3) then raise exception 'unsupported source backup version'; end if;
  if v_source_version = 3 and (p_expected_revision is null or p_expected_revision < 0) then
    raise exception 'expected revision required';
  end if;
  if jsonb_typeof(p_avatar_paths) <> 'array' then raise exception 'invalid avatar paths'; end if;
  if jsonb_array_length(p_avatar_paths) > 5 then raise exception 'too many avatars'; end if;
  if (select count(*) from jsonb_array_elements(p_avatar_paths) x where coalesce((x->>'is_active')::boolean,false)) > 1 then
    raise exception 'multiple active avatars';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('avatar:' || v_uid::text, 0));
  insert into public.user_data_revisions (user_id) values (v_uid) on conflict (user_id) do nothing;
  select revision into v_revision from public.user_data_revisions where user_id=v_uid for update;
  if v_source_version = 3 and v_revision <> p_expected_revision then raise exception 'revision conflict'; end if;

  perform set_config('workbench.restore_mode','on',true);
  v_v2_payload := jsonb_set(p_payload, '{metadata,version}', '2'::jsonb, true);
  v_result := public.restore_workbench_backup_v2(v_v2_payload, p_avatar_paths);
  perform set_config('workbench.restore_mode','off',true);
  update public.user_data_revisions set revision = revision + 1, updated_at=now() where user_id=v_uid;
  return v_result || jsonb_build_object('revision', v_revision + 1);
end;
$$;

revoke all on function public.guard_user_data_revision() from public, anon, authenticated;
revoke all on function public.bump_user_data_revision() from public, anon, authenticated;
revoke all on function public.lock_user_data_revision(uuid) from public, anon, authenticated;
revoke all on function public.get_user_data_revision() from public, anon;
revoke all on function public.upsert_avatar(text) from public, anon;
revoke all on function public.set_active_avatar(uuid) from public, anon;
revoke all on function public.delete_avatar(uuid) from public, anon;
revoke all on function public.set_habit_log(uuid,date,boolean) from public, anon;
revoke all on function public.create_todo(text,text,date,boolean,boolean) from public, anon;
revoke all on function public.move_todo(uuid,uuid,text) from public, anon;
revoke all on function public.get_today_todos(date,int) from public, anon;
revoke all on function public.get_focus_items(date,int) from public, anon;
revoke all on function public.search_workbench(text,int) from public, anon;
revoke all on function public.get_note_stats(date) from public, anon;
revoke all on function public.get_ledger_summary(text) from public, anon;
revoke all on function public.get_habit_stats(date) from public, anon;
revoke all on function public.get_practice_page(int,int,text,text,text,text) from public, anon;
revoke all on function public.get_practice_stats(date,text) from public, anon;
revoke all on function public.get_workout_stats(date,text) from public, anon;
revoke all on function public.get_dashboard_summary(date,text) from public, anon;
revoke all on function public.get_workbench_insights(date,text) from public, anon;
revoke all on function public.export_workbench_backup_v3() from public, anon;
revoke all on function public.restore_workbench_backup_v3(jsonb,jsonb,bigint) from public, anon;
grant execute on function public.get_user_data_revision() to authenticated;
grant execute on function public.upsert_avatar(text) to authenticated;
grant execute on function public.set_active_avatar(uuid) to authenticated;
grant execute on function public.delete_avatar(uuid) to authenticated;
grant execute on function public.set_habit_log(uuid,date,boolean) to authenticated;
grant execute on function public.create_todo(text,text,date,boolean,boolean) to authenticated;
grant execute on function public.move_todo(uuid,uuid,text) to authenticated;
grant execute on function public.get_today_todos(date,int) to authenticated;
grant execute on function public.get_focus_items(date,int) to authenticated;
grant execute on function public.search_workbench(text,int) to authenticated;
grant execute on function public.get_note_stats(date) to authenticated;
grant execute on function public.get_ledger_summary(text) to authenticated;
grant execute on function public.get_habit_stats(date) to authenticated;
grant execute on function public.get_practice_page(int,int,text,text,text,text) to authenticated;
grant execute on function public.get_practice_stats(date,text) to authenticated;
grant execute on function public.get_workout_stats(date,text) to authenticated;
grant execute on function public.get_dashboard_summary(date,text) to authenticated;
grant execute on function public.get_workbench_insights(date,text) to authenticated;
grant execute on function public.export_workbench_backup_v3() to authenticated;
grant execute on function public.restore_workbench_backup_v3(jsonb,jsonb,bigint) to authenticated;
