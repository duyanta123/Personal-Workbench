begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(8);
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
