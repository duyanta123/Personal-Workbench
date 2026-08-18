begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(11);

select extensions.is((select public from storage.buckets where id='avatars'),false,'avatar bucket is private');
select extensions.ok(pg_catalog.has_function_privilege('authenticated','public.set_ledger_base_currency_v2(uuid,bigint,text)','EXECUTE'),'authenticated can set empty-ledger currency');
select extensions.ok(not pg_catalog.has_function_privilege('anon','public.set_ledger_base_currency_v2(uuid,bigint,text)','EXECUTE'),'anonymous cannot set ledger currency');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin)
values('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000018','authenticated','authenticated','phase1@example.test',crypt('not-a-real-password',gen_salt('bf')),now(),now(),now(),'{}','{}',false);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000018',true);
select pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
select pg_catalog.set_config('request.jwt.claim.iat',(extract(epoch from now())::bigint-600)::text,true);
select extensions.throws_ok($$select public.begin_restore(0,7,'{}'::jsonb)$$,'recent authentication required','stale session cannot begin restore');
select pg_catalog.set_config('request.jwt.claim.iat',extract(epoch from now())::bigint::text,true);
select extensions.lives_ok($$select public.begin_restore(0,7,'{}'::jsonb)$$,'recent session can begin restore');
select extensions.lives_ok($$select public.set_ledger_base_currency_v2('60000000-0000-0000-0000-000000000001',0,'CNY')$$,'empty ledger accepts base currency');
insert into public.ledger_entries(id,user_id,kind,category,amount,amount_minor,currency_code,entry_date)
values('61000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000018','expense','test',1,100,'CNY','2026-08-18');
select extensions.throws_ok($$select public.set_ledger_base_currency_v2('60000000-0000-0000-0000-000000000002',0,'USD')$$,'ledger base currency is immutable after the first entry','existing ledger currency is immutable');
select extensions.throws_ok($$insert into public.ledger_entries(id,user_id,kind,category,amount,amount_minor,currency_code,entry_date) values('61000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000018','expense','test',1,100,'USD','2026-08-18')$$,'ledger currency must match base currency','entries use base currency');
reset role;

select extensions.is((select count(*) from private.legacy_rpc_usage_daily where observed_on=current_date),9::bigint,'snapshot records all legacy RPCs');
select extensions.ok((select bool_and(coverage_valid) from private.legacy_rpc_usage_daily where observed_on=current_date),'initial observation is valid');
select extensions.ok(exists(select 1 from cron.job where jobname='workbench-legacy-rpc-usage-daily'),'snapshot is scheduled daily');
select * from extensions.finish();
rollback;
