-- Trigram coverage for every column used by search_workbench_v2's ilike
-- '%q%' predicates and similarity() ranking. Previously only todos(text) and
-- notes(title/body) had trigram indexes; the remaining entities fell back to
-- sequential scans.

create index if not exists habits_name_trgm_idx on public.habits using gin (name extensions.gin_trgm_ops);
create index if not exists ledger_entries_note_trgm_idx on public.ledger_entries using gin (note extensions.gin_trgm_ops);
create index if not exists ledger_entries_category_trgm_idx on public.ledger_entries using gin (category extensions.gin_trgm_ops);
create index if not exists goals_name_trgm_idx on public.goals using gin (name extensions.gin_trgm_ops);
create index if not exists practice_problems_title_trgm_idx on public.practice_problems using gin (title extensions.gin_trgm_ops);
create index if not exists practice_problems_note_trgm_idx on public.practice_problems using gin (note extensions.gin_trgm_ops);
create index if not exists workout_sessions_body_part_trgm_idx on public.workout_sessions using gin (body_part extensions.gin_trgm_ops);
create index if not exists workout_sessions_note_trgm_idx on public.workout_sessions using gin (note extensions.gin_trgm_ops);
create index if not exists inbox_items_raw_text_trgm_idx on public.inbox_items using gin (raw_text extensions.gin_trgm_ops);
