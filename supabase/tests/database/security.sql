begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(26);
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.todos', 'SELECT'), 'anon cannot select todos');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.habits', 'SELECT'), 'anon cannot select habits');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.habit_logs', 'SELECT'), 'anon cannot select habit logs');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.ledger_entries', 'SELECT'), 'anon cannot select ledger entries');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.goals', 'SELECT'), 'anon cannot select goals');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.notes', 'SELECT'), 'anon cannot select notes');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.practice_problems', 'SELECT'), 'anon cannot select practice problems');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.workout_sessions', 'SELECT'), 'anon cannot select workout sessions');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.workout_exercises', 'SELECT'), 'anon cannot select workout exercises');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.body_metrics', 'SELECT'), 'anon cannot select body metrics');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.pomodoro_sessions', 'SELECT'), 'anon cannot select pomodoro sessions');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.user_preferences', 'SELECT'), 'anon cannot select preferences');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.notes', 'INSERT'), 'anon cannot insert notes');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.user_avatars', 'SELECT'), 'anon cannot enumerate avatars');
select extensions.ok(not pg_catalog.has_table_privilege('anon', 'public.user_data_revisions', 'SELECT'), 'anon cannot select revision state');
select extensions.ok(not pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE'), 'private schema is not exposed');
select extensions.ok(pg_catalog.has_function_privilege('authenticated', 'public.get_user_sync_state()', 'EXECUTE'), 'sync state is available to users');
select extensions.ok(pg_catalog.has_function_privilege('authenticated', 'public.apply_workbench_operation(uuid,bigint,text,jsonb)', 'EXECUTE'), 'operation protocol is available');
select extensions.ok(pg_catalog.has_function_privilege('authenticated', 'public.get_practice_page_cursor(integer,text,text,text,text,boolean,date,timestamp with time zone,uuid)', 'EXECUTE'), 'cursor page RPC is available');
select extensions.ok(not pg_catalog.has_function_privilege('anon', 'public.get_practice_page_cursor(integer,text,text,text,text,boolean,date,timestamp with time zone,uuid)', 'EXECUTE'), 'anonymous cursor page access is revoked');
select extensions.ok(not pg_catalog.has_function_privilege('authenticated', 'public.restore_workbench_backup_v2(jsonb,jsonb)', 'EXECUTE'), 'legacy V2 restore is revoked');
select extensions.ok(not pg_catalog.has_function_privilege('anon', 'public.begin_restore(bigint,integer,jsonb)', 'EXECUTE'), 'anonymous restore is revoked');
select extensions.ok(pg_catalog.has_table_privilege('authenticated', 'public.todos', 'SELECT'), 'authenticated users can read RLS-filtered todos');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin
) values (
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000010',
  'authenticated', 'authenticated', 'idempotency@example.test', crypt('not-a-real-password', gen_salt('bf')),
  now(), now(), now(), '{}', '{}', false
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000010', true);
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
do $idempotency$
begin
  perform public.apply_workbench_operation(
    '40000000-0000-0000-0000-000000000001', 0, 'pomodoro.complete',
    pg_catalog.jsonb_build_object('date', '2026-08-11', 'minutes', 25)
  );
  perform public.apply_workbench_operation(
    '40000000-0000-0000-0000-000000000001', 0, 'pomodoro.complete',
    pg_catalog.jsonb_build_object('date', '2026-08-11', 'minutes', 25)
  );
end
$idempotency$;
reset role;

select extensions.is(
  (select count(*) from private.workbench_operation_receipts
    where user_id = '10000000-0000-0000-0000-000000000010'),
  1::bigint,
  'duplicate operation ID stores one receipt'
);
select extensions.is(
  (select count from public.pomodoro_sessions
    where user_id = '10000000-0000-0000-0000-000000000010' and date = '2026-08-11'),
  1,
  'duplicate operation ID increments once'
);
select extensions.is(
  (select minutes from public.pomodoro_sessions
    where user_id = '10000000-0000-0000-0000-000000000010' and date = '2026-08-11'),
  25,
  'duplicate operation ID records minutes once'
);

select * from extensions.finish();
rollback;
