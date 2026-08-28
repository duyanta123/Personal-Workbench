begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(15);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin)
values('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000020','authenticated','authenticated','capacity@example.test',crypt('not-a-real-password',gen_salt('bf')),now(),now(),now(),'{}','{}',false);

select extensions.ok(not pg_catalog.has_table_privilege('authenticated','private.workbench_restore_limits','SELECT'),'restore limits stay private');
select extensions.ok(pg_catalog.has_function_privilege('authenticated','public.get_backup_health()','EXECUTE'),'health RPC is executable');
select extensions.ok(not pg_catalog.has_function_privilege('anon','public.get_backup_health()','EXECUTE'),'anonymous health access is denied');

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000020',true);
select pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
select extensions.is((public.get_backup_health()->>'total_rows')::bigint,1::bigint,'default preferences row is counted');
select extensions.is((public.get_backup_health()->>'max_table_rows')::bigint,500000::bigint,'default per-table limit is exposed');
select extensions.is((public.get_backup_health()->>'max_total_rows')::bigint,2000000::bigint,'default total limit is exposed');
select extensions.is(public.get_backup_health()#>>'{table_rows,user_preferences}','1','per-table counts are returned');
select extensions.ok('todo_status_history' = any(private.workbench_backup_tables_v7()),'restore allow-list includes status history');
select extensions.ok((public.get_backup_health()->>'estimated_export_bytes')::bigint >= 65536,'export size estimate includes archive overhead');
select extensions.ok(
  exists(select 1 from pg_catalog.pg_constraint c join pg_catalog.pg_class r on r.oid = c.conrelid
    where r.relnamespace = 'private'::regnamespace and r.relname = 'workbench_restore_jobs'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%<= 8%'),
  'restore jobs distinguish the V8 source marker'
);
select extensions.ok(
  pg_catalog.has_function_privilege('authenticated','public.begin_restore(bigint,integer,jsonb)','EXECUTE'),
  'authenticated clients can start V8 restores'
);
select extensions.ok(
  exists(select 1 from pg_catalog.pg_proc where pronamespace = 'public'::regnamespace
    and proname = 'finalize_restore'),
  'finalize restore exposes the staged V8 entry point'
);
select extensions.ok(
  exists(select 1 from pg_catalog.pg_proc where pronamespace = 'private'::regnamespace
    and proname = 'restore_v8_insert_chunk'),
  'V8 finalization has a bounded chunk insert helper'
);
select extensions.ok(
  exists(select 1 from pg_catalog.pg_proc where pronamespace = 'private'::regnamespace
    and proname = 'finalize_restore_v8_unchecked'),
  'V8 finalization is separated from the legacy parser'
);
select extensions.ok(
  pg_catalog.pg_get_functiondef((select oid from pg_catalog.pg_proc
    where pronamespace = 'private'::regnamespace and proname = 'finalize_restore_v8_unchecked'
    limit 1)) not like '%jsonb_agg%',
  'V8 finalization does not aggregate all rows into one JSONB value'
);

select * from extensions.finish();
rollback;
