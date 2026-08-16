begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(2);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin
) values (
  '00000000-0000-0000-0000-000000000000',
  '23000000-0000-0000-0000-000000000001',
  'authenticated','authenticated','detached-unset@example.test',
  crypt('not-a-real-password',gen_salt('bf')),now(),now(),now(),'{}','{}',false
)
on conflict(id) do nothing;
insert into public.user_data_revisions(user_id,revision,restore_epoch) values
  ('23000000-0000-0000-0000-000000000001',0,0)
on conflict(user_id) do update set revision=0,restore_epoch=0;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','23000000-0000-0000-0000-000000000001',true);
select pg_catalog.set_config('request.jwt.claim.role','authenticated',true);

select extensions.ok(
  current_setting('workbench.recurrence_apply', true) is null,
  'recurrence_apply is genuinely unset before a manual edit'
);

insert into public.recurrence_rules(
  id,user_id,entity_type,frequency,interval_count,weekdays,start_date,timezone,enabled,generation_mode,template
) values (
  '23000000-0000-0000-0000-000000000002',
  '23000000-0000-0000-0000-000000000001',
  'todo','daily',1,'{}',current_date,'Asia/Shanghai',true,'manual','{"text":"before","level":"mid"}'::jsonb
);
insert into public.todos(
  id,user_id,text,level,status,done,recurrence_rule_id,occurrence_date,recurrence_detached
) values (
  '23000000-0000-0000-0000-000000000003',
  '23000000-0000-0000-0000-000000000001',
  'before','mid','open',false,
  '23000000-0000-0000-0000-000000000002',current_date,false
);

update public.todos
set text='manual edit'
where id='23000000-0000-0000-0000-000000000003';

select extensions.ok(
  (select recurrence_detached from public.todos where id='23000000-0000-0000-0000-000000000003'),
  'manual edit marks a recurring todo detached when recurrence_apply is unset'
);

select * from extensions.finish();
rollback;
