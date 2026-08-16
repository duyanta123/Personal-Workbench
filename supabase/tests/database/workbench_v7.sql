begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(17);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin
) values
  ('00000000-0000-0000-0000-000000000000','11000000-0000-0000-0000-000000000001','authenticated','authenticated','v7-a@example.test',crypt('not-a-real-password',gen_salt('bf')),now(),now(),now(),'{}','{}',false),
  ('00000000-0000-0000-0000-000000000000','11000000-0000-0000-0000-000000000002','authenticated','authenticated','v7-b@example.test',crypt('not-a-real-password',gen_salt('bf')),now(),now(),now(),'{}','{}',false)
on conflict(id) do nothing;
insert into public.user_data_revisions(user_id,revision,restore_epoch) values
  ('11000000-0000-0000-0000-000000000001',0,0),('11000000-0000-0000-0000-000000000002',0,0)
on conflict(user_id) do update set revision=0,restore_epoch=0;
insert into public.todos(id,user_id,text) values('12000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000002','other user');

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
select pg_catalog.set_config('request.jwt.claim.role','authenticated',true);

select extensions.is(
  public.apply_workbench_command_v2('13000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001',0,'todo.create','{"text":"original","level":"mid","status":"open","done":false,"pinned":false,"sort_order":1024}'::jsonb)->>'status',
  'applied','V2 create is applied'
);
select extensions.is(
  public.apply_workbench_command_v2('13000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001',0,'todo.create','{"text":"original","level":"mid","status":"open","done":false,"pinned":false,"sort_order":1024}'::jsonb)->>'status',
  'duplicate','duplicate command returns duplicate'
);
select extensions.is((select pg_catalog.count(*) from public.todos where id='12000000-0000-0000-0000-000000000001'),1::bigint,'duplicate create writes one row');

update public.todos set pinned=true where id='12000000-0000-0000-0000-000000000001';
select extensions.is(
  public.apply_workbench_command_v2('13000000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000001',0,'todo.update','{"text":"merged"}'::jsonb,'{"text":"original"}'::jsonb,1)->>'status',
  'applied','different-field remote change auto merges'
);
update public.todos set text='remote' where id='12000000-0000-0000-0000-000000000001';
select extensions.is(
  public.apply_workbench_command_v2('13000000-0000-0000-0000-000000000003','12000000-0000-0000-0000-000000000001',0,'todo.update','{"text":"local"}'::jsonb,'{"text":"merged"}'::jsonb,3)->>'status',
  'conflict','same-field remote change conflicts'
);

select extensions.is(
  public.apply_workbench_command_v2(
    '13000000-0000-0000-0000-000000000005',
    '12000000-0000-0000-0000-000000000005',
    0,
    'avatar.create',
    '{"storage_path":"11000000-0000-0000-0000-000000000001/avatar-v2.webp"}'::jsonb
  )->>'status',
  'applied','V2 avatar create accepts the storage_path payload field'
);
select extensions.is(
  (select storage_path from public.user_avatars
    where user_id='11000000-0000-0000-0000-000000000001' and is_active),
  '11000000-0000-0000-0000-000000000001/avatar-v2.webp',
  'V2 avatar create stores the requested path'
);
select extensions.is(
  (select pg_catalog.count(*) from public.user_avatars
    where user_id='11000000-0000-0000-0000-000000000001'),
  1::bigint,'V2 avatar create writes one avatar row'
);

select extensions.throws_ok(
  $$select public.create_ledger_transaction(
    '13000000-0000-0000-0000-000000000004',0,'14000000-0000-0000-0000-000000000001',
    '{"kind":"expense","category":"测试","amount_minor":1000,"currency_code":"CNY","note":null,"entry_date":"2026-08-15","status":"posted","account_id":null,"payee_id":null}'::jsonb,
    '[{"id":"15000000-0000-0000-0000-000000000001","category":"A","amount_minor":900,"note":null}]'::jsonb
  )$$,'P0001','ledger splits must equal parent amount','unbalanced split transaction is rejected'
);

insert into public.recurrence_rules(id,user_id,entity_type,frequency,interval_count,weekdays,month_day,start_date,timezone,enabled,generation_mode,template)
values('16000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','todo','daily',1,'{}',null,'2026-08-15','Asia/Shanghai',true,'manual','{"text":"daily","level":"mid"}');
select public.materialize_recurrences('2026-08-15','Asia/Shanghai');
select public.materialize_recurrences('2026-08-15','Asia/Shanghai');
select extensions.is((select pg_catalog.count(*) from public.todos where recurrence_rule_id='16000000-0000-0000-0000-000000000001' and occurrence_date='2026-08-15'),1::bigint,'recurrence materialization is unique across retries');

select extensions.throws_ok(
  $$insert into public.entity_links(user_id,source_kind,source_id,target_kind,target_id) values(
    '11000000-0000-0000-0000-000000000001','todo','12000000-0000-0000-0000-000000000001','todo','12000000-0000-0000-0000-000000000002'
  )$$,'P0001','linked entity not owned','cross-user entity link is rejected'
);

insert into public.ledger_entries(id,user_id,kind,category,amount,amount_minor,currency_code,status,entry_date) values
  ('14000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','expense','posted',1,100,'CNY','posted','2026-08-15'),
  ('14000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000001','expense','planned',2,200,'CNY','planned','2026-08-15');
select extensions.is((public.get_ledger_summary('2026-08')->>'expense_minor')::bigint,100::bigint,'planned entries are excluded from actual expense');

select extensions.throws_ok(
  $$insert into public.workbench_templates(user_id,kind,name,payload) values(
    '11000000-0000-0000-0000-000000000001','todo','invalid','{"text":"","level":"mid"}'::jsonb
  )$$,'P0001','invalid todo template','template payload ranges are enforced'
);

select extensions.throws_ok(
  $$insert into public.saved_views(user_id,entity_kind,name,filters,sort) values(
    '11000000-0000-0000-0000-000000000001','ledger','invalid','{}'::jsonb,'[{"column":"user_id","direction":"asc"}]'::jsonb
  )$$,'P0001','invalid saved view sort','saved-view sort fields are allow-listed'
);

insert into public.saved_views(id,user_id,entity_kind,name,filters,sort,is_default) values
  ('17000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','todo','first','{"show_done":false}'::jsonb,'[{"column":"sort_order","direction":"asc"}]'::jsonb,true),
  ('17000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','todo','second','{"show_done":true}'::jsonb,'[{"column":"created_at","direction":"desc"}]'::jsonb,true);
select extensions.is((select pg_catalog.count(*) from public.saved_views where user_id='11000000-0000-0000-0000-000000000001' and entity_kind='todo' and is_default),1::bigint,'only one default view remains');
select extensions.ok((select is_default from public.saved_views where id='17000000-0000-0000-0000-000000000002'),'new default view replaces the previous default');

insert into public.ledger_entries(id,user_id,kind,category,amount,entry_date) values
  ('14000000-0000-0000-0000-000000000004','11000000-0000-0000-0000-000000000001','expense','legacy',12.34,'2026-08-15');
select extensions.is((select amount_minor from public.ledger_entries where id='14000000-0000-0000-0000-000000000004'),1234::bigint,'legacy amount-only writes backfill minor units');

select * from extensions.finish();
rollback;
