begin;
create extension if not exists pgtap with schema extensions;

-- 边界测试：月末压尾、闰年、weekday/间隔过滤（直接对匹配函数断言，可覆盖任意日期），
-- 以及物化窗口按规则时区推进、游标/跳过累计、幂等、end_date 截止、延期历史与 detached。
select extensions.plan(20);

-- ---------- 匹配算法：monthly month_day=31 压尾 ----------
select extensions.is(
  public.recurrence_occurrence_matches('monthly',1,'{}'::smallint[],31,'2026-01-31','2027-02-28'),
  true,'monthly day-31 clamps to Feb 28 in a common year');
select extensions.is(
  public.recurrence_occurrence_matches('monthly',1,'{}'::smallint[],31,'2026-01-31','2028-02-29'),
  true,'monthly day-31 clamps to Feb 29 in a leap year');
select extensions.is(
  public.recurrence_occurrence_matches('monthly',1,'{}'::smallint[],31,'2026-01-31','2026-04-30'),
  true,'monthly day-31 clamps to Apr 30');
select extensions.is(
  public.recurrence_occurrence_matches('monthly',1,'{}'::smallint[],31,'2026-01-31','2026-03-31'),
  true,'monthly day-31 matches a real 31st');
select extensions.is(
  public.recurrence_occurrence_matches('monthly',1,'{}'::smallint[],31,'2026-01-31','2026-03-30'),
  false,'monthly day-31 does not match the 30th of a 31-day month');

-- ---------- 匹配算法：yearly 2/29 规则（闰年与平年压尾） ----------
select extensions.is(
  public.recurrence_occurrence_matches('yearly',1,'{}'::smallint[],null,'2024-02-29','2028-02-29'),
  true,'yearly Feb-29 rule matches the leap year');
select extensions.is(
  public.recurrence_occurrence_matches('yearly',1,'{}'::smallint[],null,'2024-02-29','2027-02-28'),
  true,'yearly Feb-29 rule clamps to Feb 28 in common years');

-- ---------- 匹配算法：weekly 隔周 + weekday 过滤 ----------
select extensions.is(
  public.recurrence_occurrence_matches('weekly',2,array[1]::smallint[],null,'2026-08-03','2026-08-17'),
  true,'biweekly rule matches two weeks apart on Monday');
select extensions.is(
  public.recurrence_occurrence_matches('weekly',2,array[1]::smallint[],null,'2026-08-03','2026-08-10'),
  false,'biweekly rule skips the in-between week');
select extensions.is(
  public.recurrence_occurrence_matches('weekly',1,array[1]::smallint[],null,'2026-08-03','2026-08-11'),
  false,'weekly Monday rule does not match Tuesday');

-- ---------- 物化：规则时区、游标、跳过累计、幂等、end_date ----------
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin
) values
  ('00000000-0000-0000-0000-000000000000','21000000-0000-0000-0000-000000000001','authenticated','authenticated','recurrence-a@example.test',crypt('not-a-real-password',gen_salt('bf')),now(),now(),now(),'{}','{}',false)
on conflict(id) do nothing;
insert into public.user_data_revisions(user_id,revision,restore_epoch) values
  ('21000000-0000-0000-0000-000000000001',0,0)
on conflict(user_id) do update set revision=0,restore_epoch=0;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','21000000-0000-0000-0000-000000000001',true);
select pg_catalog.set_config('request.jwt.claim.role','authenticated',true);

-- 三条规则：上海 daily（起点很早，用于游标/跳过累计）、纽约 daily、已结束 daily。
insert into public.recurrence_rules(id,user_id,entity_type,frequency,interval_count,weekdays,month_day,start_date,timezone,enabled,generation_mode,template) values
  ('22000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','todo','daily',1,'{}',null,'2026-01-01','Asia/Shanghai',true,'manual','{"text":"sh","level":"mid"}'),
  ('22000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','todo','daily',1,'{}',null,'2026-01-01','America/New_York',true,'manual','{"text":"ny","level":"mid"}'),
  ('22000000-0000-0000-0000-000000000003','21000000-0000-0000-0000-000000000001','todo','daily',1,'{}',null,'2026-01-01','Asia/Shanghai',true,'manual','{"text":"old","level":"mid"}');
-- end_date 必须满足 end_date >= start_date 约束；取 start_date 次日，
-- 仍远早于物化窗口（now-7），所以不会物化任何实例。
update public.recurrence_rules set end_date='2026-01-02' where id='22000000-0000-0000-0000-000000000003';

select public.materialize_recurrences(current_date,'Asia/Shanghai');

select extensions.is(
  (select materialized_through from public.recurrence_rules where id='22000000-0000-0000-0000-000000000001'),
  ((pg_catalog.now() at time zone 'Asia/Shanghai')::date + 30),
  'Shanghai rule advances its cursor by the Shanghai timezone today');
select extensions.is(
  (select materialized_through from public.recurrence_rules where id='22000000-0000-0000-0000-000000000002'),
  ((pg_catalog.now() at time zone 'America/New_York')::date + 30),
  'New York rule advances its cursor by the rule timezone today');

select extensions.ok(
  (select skipped_before_window from public.recurrence_rules where id='22000000-0000-0000-0000-000000000001') > 0,
  'occurrences missed before the window are counted, not materialized');
select extensions.is(
  (select pg_catalog.count(*) from public.todos where recurrence_rule_id='22000000-0000-0000-0000-000000000001'
    and occurrence_date < ((pg_catalog.now() at time zone 'Asia/Shanghai')::date - 7)),
  0::bigint,'no instances are created before the materialization window');

select extensions.is(
  (select pg_catalog.count(*) from public.todos where recurrence_rule_id='22000000-0000-0000-0000-000000000003'),
  0::bigint,'rules past their end_date materialize nothing');

-- 幂等：重复执行不重复生成。
select public.materialize_recurrences(current_date,'Asia/Shanghai');
select extensions.is(
  (select pg_catalog.count(*) from public.todos where recurrence_rule_id='22000000-0000-0000-0000-000000000001'
    and occurrence_date = ((pg_catalog.now() at time zone 'Asia/Shanghai')::date)),
  1::bigint,'repeated materialization keeps exactly one instance per occurrence');

-- ---------- 延期：历史记录 + detached + 规则编辑保留 ----------
update public.todos set occurrence_date = occurrence_date + 1, due_date = due_date + 1
  where recurrence_rule_id='22000000-0000-0000-0000-000000000001'
    and occurrence_date = ((pg_catalog.now() at time zone 'Asia/Shanghai')::date);
select extensions.is(
  (select pg_catalog.count(*) from public.todo_status_history h
    join public.todos t on t.id = h.todo_id
    where t.recurrence_rule_id='22000000-0000-0000-0000-000000000001' and h.action='postponed'),
  1::bigint,'postponing an occurrence records history');
select extensions.ok(
  (select pg_catalog.bool_and(recurrence_detached) from public.todos
    where recurrence_rule_id='22000000-0000-0000-0000-000000000001'
      and occurrence_date = ((pg_catalog.now() at time zone 'Asia/Shanghai')::date + 1)),
  'postponed instance is marked detached');

-- 规则编辑：未来未完成且未 detached 的实例被重置，延期实例保留。
update public.recurrence_rules set template = jsonb_set(template,'{text}','"edited"')
  where id='22000000-0000-0000-0000-000000000001';
select extensions.is(
  (select pg_catalog.count(*) from public.todos
    where recurrence_rule_id='22000000-0000-0000-0000-000000000001'
      and recurrence_detached),
  1::bigint,'rule edits keep detached (postponed) instances');
select extensions.is(
  (select pg_catalog.count(*) from public.todos
    where recurrence_rule_id='22000000-0000-0000-0000-000000000001'
      and not recurrence_detached and occurrence_date > current_date),
  0::bigint,'rule edits reset future open instances');

select * from extensions.finish();
rollback;
