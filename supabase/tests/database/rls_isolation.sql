begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(20);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'rls-a@example.test', crypt('not-a-real-password', gen_salt('bf')), now(), now(), now(), '{}', '{}', false),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'rls-b@example.test', crypt('not-a-real-password', gen_salt('bf')), now(), now(), now(), '{}', '{}', false)
on conflict (id) do nothing;

insert into public.todos (id, user_id, text) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A todo'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'B todo');
insert into public.habits (id, user_id, name) values
  ('21000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A habit'),
  ('21000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'B habit');
insert into public.habit_logs (id, habit_id, user_id, log_date) values
  ('22000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-10'),
  ('22000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '2026-08-10');
insert into public.ledger_entries (id, user_id, kind, category, amount, entry_date) values
  ('23000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'expense', 'A', 1, '2026-08-10'),
  ('23000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'expense', 'B', 1, '2026-08-10');
insert into public.goals (id, user_id, name, target) values
  ('24000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A goal', 10),
  ('24000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'B goal', 10);
insert into public.notes (id, user_id, body) values
  ('25000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A note'),
  ('25000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'B note');
insert into public.practice_problems (id, user_id, title) values
  ('26000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A problem'),
  ('26000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'B problem');
insert into public.workout_sessions (id, user_id, date, body_part) values
  ('27000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-10', 'full'),
  ('27000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '2026-08-10', 'full');
insert into public.workout_exercises (id, session_id, name) values
  ('28000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'A exercise'),
  ('28000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000002', 'B exercise');
insert into public.body_metrics (id, user_id, date, weight) values
  ('29000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-10', 60),
  ('29000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '2026-08-10', 70);
insert into public.pomodoro_sessions (id, user_id, date, count, minutes) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-10', 1, 25),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '2026-08-10', 1, 25);
insert into public.user_preferences (user_id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');
insert into public.user_avatars (id, user_id, storage_path) values
  ('31000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001/a.webp'),
  ('31000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002/b.webp');
insert into public.user_data_revisions (user_id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002')
on conflict (user_id) do nothing;

-- The seed inserts above intentionally exercise revision triggers. Reset the
-- two isolated test accounts before assuming the authenticated role so the
-- sync-state assertion tests the RPC contract instead of seed order/count.
insert into public.user_data_revisions (user_id, revision, restore_epoch, updated_at) values
  ('10000000-0000-0000-0000-000000000001', 0, 0, pg_catalog.now()),
  ('10000000-0000-0000-0000-000000000002', 0, 0, pg_catalog.now())
on conflict (user_id) do update
set revision = excluded.revision,
    restore_epoch = excluded.restore_epoch,
    updated_at = excluded.updated_at;

grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.is((select count(*) from public.todos), 1::bigint, 'user A sees only own todos');
select extensions.is((select count(*) from public.habits), 1::bigint, 'user A sees only own habits');
select extensions.is((select count(*) from public.habit_logs), 1::bigint, 'user A sees only own habit logs');
select extensions.is((select count(*) from public.ledger_entries), 1::bigint, 'user A sees only own ledger entries');
select extensions.is((select count(*) from public.goals), 1::bigint, 'user A sees only own goals');
select extensions.is((select count(*) from public.notes), 1::bigint, 'user A sees only own notes');
select extensions.is((select count(*) from public.practice_problems), 1::bigint, 'user A sees only own practice problems');
select extensions.is((select count(*) from public.workout_sessions), 1::bigint, 'user A sees only own workout sessions');
select extensions.is((select count(*) from public.workout_exercises), 1::bigint, 'user A sees only own workout exercises');
select extensions.is((select count(*) from public.body_metrics), 1::bigint, 'user A sees only own body metrics');
select extensions.is((select count(*) from public.pomodoro_sessions), 1::bigint, 'user A sees only own pomodoro sessions');
select extensions.is((select count(*) from public.user_preferences), 1::bigint, 'user A sees only own preferences');
select extensions.is((select count(*) from public.user_avatars), 1::bigint, 'user A sees only own avatar records');
select extensions.is((select count(*) from public.user_data_revisions), 1::bigint, 'user A sees only own sync state');
select extensions.is(
  (public.get_practice_page_cursor()->>'total')::bigint,
  1::bigint,
  'cursor RPC cannot enumerate another user'
);
select extensions.is(
  (public.get_user_sync_state()->>'revision')::bigint,
  0::bigint,
  'sync RPC returns current user state'
);

update public.todos set text = 'tampered' where id = '20000000-0000-0000-0000-000000000002';
select extensions.throws_ok(
  $$insert into public.todos (user_id, text) values ('10000000-0000-0000-0000-000000000002', 'cross-user')$$,
  '42501',
  null,
  'user A cannot insert rows for user B'
);

select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select extensions.is((select count(*) from public.todos), 1::bigint, 'user B sees only own todos');
select extensions.is((select count(*) from public.workout_exercises), 1::bigint, 'user B sees only own indirect workout rows');

reset role;
select extensions.is(
  (select text from public.todos where id = '20000000-0000-0000-0000-000000000002'),
  'B todo',
  'cross-user update changed no rows'
);

select * from extensions.finish();
rollback;
