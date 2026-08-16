begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(9);
select extensions.ok(not pg_catalog.has_table_privilege('authenticated', 'public.todos', 'INSERT'), 'direct todo inserts are revoked after rollout');
select extensions.ok(not pg_catalog.has_table_privilege('authenticated', 'public.pomodoro_sessions', 'INSERT'), 'direct pomodoro inserts are revoked after rollout');
select extensions.ok(not pg_catalog.has_function_privilege('authenticated', 'public.complete_pomodoro(date,integer)', 'EXECUTE'), 'legacy pomodoro RPC is revoked');
select extensions.ok(
  (select not public from storage.buckets where id = 'avatars'),
  'avatar bucket is private'
);
select extensions.ok(
  (
    select file_size_limit = 5242880
      and allowed_mime_types = array['image/webp']::text[]
    from storage.buckets
    where id = 'avatars'
  ),
  'avatar bucket enforces WebP and 5 MiB limit'
);

-- Full lockdown matrix: no direct INSERT/UPDATE/DELETE remains on any
-- workbench table whose writes must flow through the V2 command RPCs.
select extensions.is(
  (
    select count(*) from unnest(array[
      'todos', 'habits', 'habit_logs', 'ledger_entries', 'goals', 'notes',
      'practice_problems', 'workout_sessions', 'workout_exercises',
      'pomodoro_sessions', 'user_avatars', 'body_metrics',
      'inbox_items', 'recurrence_rules', 'ledger_accounts', 'ledger_payees',
      'ledger_rules', 'ledger_splits', 'ledger_reconciliations',
      'workbench_templates', 'saved_views', 'entity_links'
    ]) as tbl
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) as priv
    where pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', tbl), priv)
  ),
  0::bigint,
  'direct INSERT/UPDATE/DELETE are revoked on all locked workbench tables'
);

insert into storage.objects (bucket_id, name) values
  ('avatars', '10000000-0000-0000-0000-000000000001/a.webp'),
  ('avatars', '10000000-0000-0000-0000-000000000002/b.webp')
on conflict (bucket_id, name) do nothing;

grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.is(
  (select count(*) from storage.objects where bucket_id = 'avatars'),
  1::bigint,
  'user A can list only own avatar objects'
);
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('avatars', '10000000-0000-0000-0000-000000000002/cross.webp')$$,
  '42501',
  null,
  'user A cannot insert into user B avatar directory'
);
select extensions.throws_ok(
  $$delete from storage.objects
    where bucket_id = 'avatars' and name = '10000000-0000-0000-0000-000000000002/b.webp'$$,
  'P0001',
  'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'direct storage table deletion is blocked'
);
reset role;

select * from extensions.finish();
rollback;
