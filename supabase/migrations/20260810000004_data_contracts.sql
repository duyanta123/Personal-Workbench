-- Generous product limits protect the browser, backup protocol, and aggregate
-- queries without silently changing existing rows. NOT VALID still enforces all
-- new writes; a later validation can run after the reported legacy rows are fixed.

create or replace function public.is_bounded_text_array(
  p_value text[],
  p_max_items int,
  p_max_chars int
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(pg_catalog.cardinality(p_value), 0) <= p_max_items
    and not exists (
      select 1 from pg_catalog.unnest(coalesce(p_value, array[]::text[])) item
      where pg_catalog.char_length(item) > p_max_chars
    );
$$;

create or replace function public.is_safe_external_url(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null
    or p_value ~ '^https://[^[:space:]]+$'
    or p_value ~ '^http://(localhost|127[.]0[.]0[.]1|\[::1\])(:[0-9]+)?(/|$)';
$$;

alter table public.todos drop constraint if exists todos_text_size;
alter table public.todos add constraint todos_text_size
  check (pg_catalog.char_length(text) between 1 and 1000) not valid;

alter table public.habits drop constraint if exists habits_text_size;
alter table public.habits add constraint habits_text_size check (
  pg_catalog.char_length(name) between 1 and 200
  and pg_catalog.char_length(emoji) between 1 and 200
) not valid;

alter table public.ledger_entries drop constraint if exists ledger_text_size;
alter table public.ledger_entries add constraint ledger_text_size check (
  pg_catalog.char_length(category) between 1 and 200
  and (note is null or pg_catalog.char_length(note) <= 100000)
) not valid;

alter table public.goals drop constraint if exists goals_data_limits;
alter table public.goals add constraint goals_data_limits check (
  pg_catalog.char_length(name) between 1 and 200
  and current <= 1000000000000
  and target <= 1000000000000
  and (unit is null or pg_catalog.char_length(unit) <= 200)
  and (note is null or pg_catalog.char_length(note) <= 100000)
) not valid;

alter table public.notes drop constraint if exists notes_data_limits;
alter table public.notes add constraint notes_data_limits check (
  (title is null or pg_catalog.char_length(title) <= 1000)
  and pg_catalog.char_length(body) between 1 and 100000
  and public.is_bounded_text_array(tags, 50, 100)
  and (image_url is null or (pg_catalog.char_length(image_url) <= 2048 and public.is_safe_external_url(image_url)))
) not valid;

alter table public.practice_problems drop constraint if exists practice_data_limits;
alter table public.practice_problems add constraint practice_data_limits check (
  pg_catalog.char_length(title) between 1 and 1000
  and pg_catalog.char_length(platform) between 1 and 200
  and public.is_bounded_text_array(tags, 50, 100)
  and (url is null or (pg_catalog.char_length(url) <= 2048 and public.is_safe_external_url(url)))
  and (note is null or pg_catalog.char_length(note) <= 100000)
) not valid;

alter table public.workout_sessions drop constraint if exists workout_session_limits;
alter table public.workout_sessions add constraint workout_session_limits check (
  pg_catalog.char_length(body_part) between 1 and 200
  and (duration_min is null or duration_min <= 1440)
  and (note is null or pg_catalog.char_length(note) <= 100000)
) not valid;

alter table public.workout_exercises drop constraint if exists workout_exercise_limits;
alter table public.workout_exercises add constraint workout_exercise_limits check (
  pg_catalog.char_length(name) between 1 and 200
  and sets <= 10000 and reps <= 10000 and weight <= 10000
  and (note is null or pg_catalog.char_length(note) <= 100000)
) not valid;

alter table public.body_metrics drop constraint if exists body_metric_limits;
alter table public.body_metrics add constraint body_metric_limits check (
  (weight is null or weight <= 1000)
  and (body_fat is null or body_fat <= 100)
  and (note is null or pg_catalog.char_length(note) <= 100000)
) not valid;

alter table public.user_preferences drop constraint if exists preferences_data_limits;
alter table public.user_preferences add constraint preferences_data_limits check (
  monthly_budget is null or monthly_budget <= 9999999999.99
) not valid;

alter table public.user_avatars drop constraint if exists avatar_path_size;
alter table public.user_avatars add constraint avatar_path_size
  check (pg_catalog.char_length(storage_path) between 1 and 1024) not valid;

revoke all on function public.is_bounded_text_array(text[], int, int) from public, anon, authenticated;
revoke all on function public.is_safe_external_url(text) from public, anon, authenticated;
