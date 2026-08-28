begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(7);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin)
values('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000019','authenticated','authenticated','preferences@example.test',crypt('not-a-real-password',gen_salt('bf')),now(),now(),now(),'{}','{}',false);
select extensions.ok(exists(select 1 from public.user_preferences where user_id='10000000-0000-0000-0000-000000000019'),'new auth user receives preferences');
select extensions.ok(not pg_catalog.has_table_privilege('authenticated','public.user_preferences','UPDATE'),'authenticated cannot update preferences directly');
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000019',true);
select pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
select extensions.lives_ok($$select public.apply_workbench_preference_v2('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000019',0,'{"timezone":"Asia/Shanghai"}'::jsonb,'{"timezone":"Asia/Shanghai"}'::jsonb,1)$$,'preference V2 update is accepted');
select extensions.throws_ok($$update public.user_preferences set timezone='UTC' where user_id='10000000-0000-0000-0000-000000000019'$$,'permission denied%','direct preference update is denied');
reset role;
select extensions.is((select timezone from public.user_preferences where user_id='10000000-0000-0000-0000-000000000019'),'Asia/Shanghai','preference value is stored');
select extensions.ok((select row_version from public.user_preferences where user_id='10000000-0000-0000-0000-000000000019') > 1,'preference row version increments');
select extensions.is((select count(*) from private.workbench_operation_receipts where operation_id='70000000-0000-0000-0000-000000000001'),1::bigint,'preference command receipt is idempotent');
select * from extensions.finish();
rollback;
