begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(12);

select extensions.ok(exists(select 1 from pg_catalog.pg_class where relnamespace='public'::regnamespace and relname='push_subscriptions'),'push subscriptions table exists');
select extensions.ok(not pg_catalog.has_table_privilege('authenticated','public.push_subscriptions','INSERT'),'push subscriptions cannot be inserted directly');
select extensions.ok(pg_catalog.has_function_privilege('authenticated','public.upsert_push_subscription(text,text,text,text)','EXECUTE'),'authenticated can register push subscription via RPC');
select extensions.ok(not pg_catalog.has_function_privilege('anon','public.upsert_push_subscription(text,text,text,text)','EXECUTE'),'anonymous cannot register push subscription');
select extensions.ok(pg_catalog.has_function_privilege('service_role','public.claim_notification(uuid,text)','EXECUTE'),'service role can claim notifications');
select extensions.ok(pg_catalog.has_function_privilege('service_role','public.report_reminder_run(uuid,text,integer,text)','EXECUTE'),'service role can report reminder runs');
select extensions.ok(exists(select 1 from cron.job where jobname='workbench-reminder-dispatch'),'reminder dispatch is scheduled');
select extensions.ok(exists(select 1 from cron.job where jobname='workbench-recurrence-materialization'),'recurrence materialization is scheduled');
select extensions.ok(exists(select 1 from pg_catalog.pg_proc where pronamespace='private'::regnamespace and proname='materialize_recurrences_for_user'),'private per-user materializer exists');
select extensions.ok(not pg_catalog.has_function_privilege('authenticated','private.materialize_recurrences_for_user(uuid,date,text)','EXECUTE'),'per-user materializer is not client callable');
select extensions.ok(exists(select 1 from pg_catalog.pg_extension where extname='supabase_vault'),'Vault extension is installed for scheduler secrets');
select extensions.ok(exists(select 1 from pg_catalog.pg_extension where extname='pg_net'),'pg_net extension is installed for scheduler dispatch');

select * from extensions.finish();
rollback;
