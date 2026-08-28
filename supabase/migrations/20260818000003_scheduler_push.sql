-- Phase 2: server-side materialization and Web Push delivery records.

-- pg_net is non-relocatable and creates its own stable `net` schema.  Keep the
-- official installation form so hosted and local Supabase use the same API.
create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint),
  check (char_length(endpoint) between 1 and 4096),
  check (char_length(p256dh) between 1 and 512),
  check (char_length(auth_key) between 1 and 512)
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
revoke all on table public.push_subscriptions from anon, authenticated;
grant select on table public.push_subscriptions to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

create table if not exists private.reminder_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','timeout')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  sent_count integer not null default 0,
  error_code text,
  request_id bigint
);
create index if not exists reminder_runs_requested_idx on private.reminder_runs(requested_at desc);

create table if not exists private.reminder_timeout_alerts (
  run_id uuid primary key references private.reminder_runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  request_id bigint
);

create table if not exists private.notification_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_key text not null,
  status text not null default 'claimed' check (status in ('claimed','sent','failed')),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  error_code text,
  primary key(user_id, receipt_key)
);
create index if not exists notification_receipts_cleanup_idx on private.notification_receipts(claimed_at);

create or replace function public.upsert_push_subscription(
  p_endpoint text, p_p256dh text, p_auth_key text, p_user_agent text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if pg_catalog.length(p_endpoint) not between 1 and 4096
    or pg_catalog.length(p_p256dh) not between 1 and 512
    or pg_catalog.length(p_auth_key) not between 1 and 512 then raise exception 'invalid push subscription'; end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth_key,user_agent,enabled,updated_at)
  values(v_uid,p_endpoint,p_p256dh,p_auth_key,left(p_user_agent,500),true,pg_catalog.now())
  on conflict(user_id,endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key,
    user_agent=excluded.user_agent,enabled=true,updated_at=pg_catalog.now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint;
end;
$$;

create or replace function public.claim_notification(p_user_id uuid, p_receipt_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  insert into private.notification_receipts(user_id,receipt_key,status,claimed_at)
    values(p_user_id,p_receipt_key,'claimed',pg_catalog.now())
    on conflict (user_id, receipt_key) do update
      set status='claimed', claimed_at=pg_catalog.now(), error_code=null
      where private.notification_receipts.status='failed'
        or private.notification_receipts.claimed_at < pg_catalog.now()-interval '15 minutes';
  return found;
end;
$$;

create or replace function public.report_reminder_run(
  p_run_id uuid, p_status text, p_sent_count integer default 0, p_error_code text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  update private.reminder_runs set status=p_status, sent_count=greatest(p_sent_count,0),
    error_code=left(p_error_code,200), started_at=case when p_status='running' then coalesce(started_at,pg_catalog.now()) else started_at end,
    finished_at=case when p_status in ('completed','failed','timeout') then pg_catalog.now() else finished_at end
  where id=p_run_id;
end;
$$;

create or replace function public.finish_notification(
  p_user_id uuid, p_receipt_key text, p_status text, p_error_code text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  update private.notification_receipts set status=p_status, sent_at=case when p_status='sent' then pg_catalog.now() else sent_at end,
    error_code=left(p_error_code,200) where user_id=p_user_id and receipt_key=p_receipt_key;
end;
$$;

create or replace function private.enqueue_reminder_run()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_url text; v_secret text; v_request bigint;
begin
  insert into private.reminder_runs default values returning id into v_id;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='workbench_send_reminders_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='workbench_scheduler_secret';
  if v_url is null or v_secret is null then
    update private.reminder_runs set status='failed',error_code='scheduler_secret_not_configured',finished_at=pg_catalog.now() where id=v_id;
    return v_id;
  end if;
  select net.http_post(
    url:=v_url,
    headers:=pg_catalog.jsonb_build_object('Content-Type','application/json','x-workbench-scheduler-secret',v_secret),
    body:=pg_catalog.jsonb_build_object('run_id',v_id::text)
  ) into v_request;
  update private.reminder_runs set request_id=v_request where id=v_id;
  return v_id;
exception when others then
  update private.reminder_runs set status='failed',error_code='scheduler_http_error',finished_at=pg_catalog.now() where id=v_id;
  return v_id;
end;
$$;

create or replace function private.materialize_recurrences_for_user(
  p_user_id uuid, p_today date, p_timezone text default 'Asia/Shanghai'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_rule public.recurrence_rules;
  v_date date;
  v_rule_today date;
  v_from date;
  v_to date;
  v_skip_from date;
  v_matches boolean;
  v_skipped int;
  v_todos int := 0;
  v_ledger int := 0;
begin
  if p_user_id is null then raise exception 'user required'; end if;
  if p_today is null then raise exception 'today required'; end if;
  perform p_today::timestamp at time zone p_timezone;
  perform pg_catalog.set_config('workbench.recurrence_apply','on',true);
  for v_rule in select * from public.recurrence_rules where user_id=p_user_id and enabled order by id for update loop
    v_skipped := 0;
    begin
      v_rule_today := (pg_catalog.now() at time zone v_rule.timezone)::date;
    exception when others then continue;
    end;
    v_from := v_rule_today - 7;
    v_to := v_rule_today + 30;
    v_skip_from := greatest(v_rule.start_date,coalesce(v_rule.materialized_through+1,v_rule.start_date));
    if v_skip_from < v_from then
      for v_date in select d::date from pg_catalog.generate_series(v_skip_from::timestamp,(v_from-1)::timestamp,interval '1 day') d loop
        v_matches := public.recurrence_occurrence_matches(v_rule.frequency,v_rule.interval_count,v_rule.weekdays,v_rule.month_day,v_rule.start_date,v_date);
        if v_matches and (v_rule.end_date is null or v_date<=v_rule.end_date) then v_skipped:=v_skipped+1; end if;
      end loop;
    end if;
    for v_date in select d::date from pg_catalog.generate_series(greatest(v_rule.start_date,v_from)::timestamp,least(coalesce(v_rule.end_date,v_to),v_to)::timestamp,interval '1 day') d loop
      v_matches := public.recurrence_occurrence_matches(v_rule.frequency,v_rule.interval_count,v_rule.weekdays,v_rule.month_day,v_rule.start_date,v_date);
      if v_matches and v_rule.entity_type='todo' then
        insert into public.todos(user_id,text,level,done,status,pinned,due_date,recurrence_rule_id,occurrence_date)
        values(p_user_id,v_rule.template->>'text',coalesce(v_rule.template->>'level','mid'),false,'open',coalesce((v_rule.template->>'pinned')::boolean,false),v_date,v_rule.id,v_date)
        on conflict (user_id,recurrence_rule_id,occurrence_date) where recurrence_rule_id is not null and not recurrence_detached do nothing;
        if found then v_todos:=v_todos+1; end if;
      elsif v_matches and v_rule.entity_type='ledger' then
        insert into public.ledger_entries(user_id,kind,category,amount,amount_minor,currency_code,note,entry_date,status,recurrence_rule_id,occurrence_date)
        values(p_user_id,v_rule.template->>'kind',v_rule.template->>'category',(v_rule.template->>'amount_minor')::numeric/100,(v_rule.template->>'amount_minor')::bigint,coalesce(v_rule.template->>'currency_code','CNY'),v_rule.template->>'note',v_date,case when v_rule.generation_mode='automatic' then 'posted' else 'planned' end,v_rule.id,v_date)
        on conflict (user_id,recurrence_rule_id,occurrence_date) where recurrence_rule_id is not null do nothing;
        if found then v_ledger:=v_ledger+1; end if;
      end if;
    end loop;
    update public.recurrence_rules set materialized_through=greatest(coalesce(materialized_through,start_date),v_to),skipped_before_window=skipped_before_window+v_skipped where id=v_rule.id and user_id=p_user_id;
  end loop;
  perform pg_catalog.set_config('workbench.recurrence_apply','off',true);
  return pg_catalog.jsonb_build_object('todos',v_todos,'ledger_entries',v_ledger,'through',v_to);
end;
$$;

revoke all on function private.materialize_recurrences_for_user(uuid,date,text) from public,anon,authenticated;

create or replace function public.materialize_recurrences(p_today date,p_timezone text default 'Asia/Shanghai')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  return private.materialize_recurrences_for_user(v_uid,p_today,p_timezone);
end;
$$;

revoke all on function public.materialize_recurrences(date,text) from public,anon;
grant execute on function public.materialize_recurrences(date,text) to authenticated;

create or replace function private.materialize_recurrences_batch()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_user record; v_count integer := 0;
begin
  for v_user in select user_id, timezone from public.user_preferences loop
    perform private.materialize_recurrences_for_user(v_user.user_id,current_date,coalesce(v_user.timezone, 'Asia/Shanghai'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.expire_reminder_runs()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_run uuid; v_url text; v_token text; v_request bigint;
begin
  v_count := 0;
  for v_run in update private.reminder_runs
    set status='timeout', error_code='run_timeout', finished_at=pg_catalog.now()
    where status in ('queued','running') and requested_at < pg_catalog.now()-interval '15 minutes'
    returning id loop
    insert into private.reminder_timeout_alerts(run_id) values(v_run) on conflict do nothing;
    if found then
      v_count := v_count + 1;
      begin
        select decrypted_secret into v_url from vault.decrypted_secrets where name='workbench_sentry_alert_url';
        select decrypted_secret into v_token from vault.decrypted_secrets where name='workbench_sentry_alert_token';
        if v_url is not null then
          select net.http_post(
            url:=v_url,
            headers:=case when v_token is null
              then pg_catalog.jsonb_build_object('Content-Type','application/json')
              else pg_catalog.jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_token)
            end,
            body:=pg_catalog.jsonb_build_object('event','workbench.reminder_timeout','run_id',v_run::text)
          ) into v_request;
          update private.reminder_timeout_alerts set request_id=v_request where run_id=v_run;
        end if;
      exception when others then null;
      end;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.upsert_push_subscription(text,text,text,text) from public, anon;
revoke all on function public.remove_push_subscription(text) from public, anon;
revoke all on function public.claim_notification(uuid,text) from public, anon, authenticated;
revoke all on function public.report_reminder_run(uuid,text,integer,text) from public, anon, authenticated;
revoke all on function public.finish_notification(uuid,text,text,text) from public, anon, authenticated;
revoke all on function private.enqueue_reminder_run() from public, anon, authenticated;
revoke all on function private.materialize_recurrences_batch() from public, anon, authenticated;
revoke all on function private.materialize_recurrences_for_user(uuid,date,text) from public, anon, authenticated;
revoke all on function private.expire_reminder_runs() from public, anon, authenticated;
grant execute on function public.upsert_push_subscription(text,text,text,text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;
grant execute on function public.claim_notification(uuid,text) to service_role;
grant execute on function public.report_reminder_run(uuid,text,integer,text) to service_role;
grant execute on function public.finish_notification(uuid,text,text,text) to service_role;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='workbench-reminder-dispatch';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('workbench-reminder-dispatch','*/5 * * * *','select private.enqueue_reminder_run();');
  select jobid into v_job from cron.job where jobname='workbench-recurrence-materialization';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('workbench-recurrence-materialization','13 * * * *','select private.materialize_recurrences_batch();');
  select jobid into v_job from cron.job where jobname='workbench-reminder-timeouts';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('workbench-reminder-timeouts','*/5 * * * *','select private.expire_reminder_runs();');
end;
$$;
