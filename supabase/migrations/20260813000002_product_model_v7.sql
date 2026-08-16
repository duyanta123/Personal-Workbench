-- Product model through Backup V7. All changes are additive and retain legacy columns.

create extension if not exists pg_trgm with schema extensions;

alter table public.todos add column if not exists status text not null default 'open';
alter table public.todos add column if not exists recurrence_rule_id uuid;
alter table public.todos add column if not exists occurrence_date date;
alter table public.todos add column if not exists recurrence_detached boolean not null default false;
update public.todos set status = case when done then 'done' else 'open' end;
alter table public.todos drop constraint if exists todos_status_valid;
alter table public.todos add constraint todos_status_valid check (status in ('open','done','skipped'));

alter table public.habits add column if not exists tracking_type text not null default 'boolean';
alter table public.habits add column if not exists period_days int not null default 1;
alter table public.habits add column if not exists target_count int not null default 1;
alter table public.habits add column if not exists target_value numeric;
alter table public.habits add column if not exists target_mode text not null default 'at_least';
alter table public.habits add column if not exists reminder_time time;
alter table public.habits drop constraint if exists habits_tracking_valid;
alter table public.habits add constraint habits_tracking_valid check (
  tracking_type in ('boolean','numeric') and period_days between 1 and 365
  and target_count between 1 and 365 and target_mode in ('at_least','at_most')
  and (tracking_type = 'boolean' or target_value is not null)
);
alter table public.habit_logs add column if not exists state text not null default 'done';
alter table public.habit_logs add column if not exists value numeric;
alter table public.habit_logs drop constraint if exists habit_logs_state_valid;
alter table public.habit_logs add constraint habit_logs_state_valid check (state in ('done','skipped'));

create table if not exists public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('todo','ledger')),
  frequency text not null check (frequency in ('daily','weekly','monthly','yearly')),
  interval_count int not null default 1 check (interval_count between 1 and 365),
  weekdays smallint[] not null default '{}',
  month_day smallint,
  start_date date not null,
  end_date date,
  timezone text not null default 'Asia/Shanghai',
  local_time time,
  enabled boolean not null default true,
  generation_mode text not null default 'manual' check (generation_mode in ('manual','automatic')),
  template jsonb not null default '{}',
  materialized_through date,
  skipped_before_window int not null default 0,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pg_catalog.cardinality(weekdays) <= 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  check (month_day is null or month_day between 1 and 31),
  check (end_date is null or end_date >= start_date),
  check (pg_catalog.char_length(timezone) between 1 and 100),
  check (pg_catalog.octet_length(template::text) <= 65536)
);
alter table public.todos drop constraint if exists todos_recurrence_rule_fk;
alter table public.todos add constraint todos_recurrence_rule_fk foreign key (recurrence_rule_id) references public.recurrence_rules(id) on delete set null;
create unique index if not exists todos_recurrence_occurrence_unique
  on public.todos(user_id, recurrence_rule_id, occurrence_date) where recurrence_rule_id is not null;

create table if not exists public.ledger_accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, type text not null check (type in ('cash','bank','credit','asset','liability')),
  opening_balance_minor bigint not null default 0, archived boolean not null default false,
  row_version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (pg_catalog.char_length(name) between 1 and 200), unique(user_id, name)
);
create table if not exists public.ledger_payees (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, row_version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (pg_catalog.char_length(name) between 1 and 200), unique(user_id, name)
);

alter table public.ledger_entries add column if not exists amount_minor bigint;
update public.ledger_entries set amount_minor = pg_catalog.round(amount * 100)::bigint where amount_minor is null;
alter table public.ledger_entries alter column amount_minor set not null;
alter table public.ledger_entries add column if not exists currency_code text not null default 'CNY';
alter table public.ledger_entries add column if not exists status text not null default 'posted';
alter table public.ledger_entries add column if not exists account_id uuid references public.ledger_accounts(id) on delete set null;
alter table public.ledger_entries add column if not exists payee_id uuid references public.ledger_payees(id) on delete set null;
alter table public.ledger_entries add column if not exists recurrence_rule_id uuid references public.recurrence_rules(id) on delete set null;
alter table public.ledger_entries add column if not exists occurrence_date date;
alter table public.ledger_entries add column if not exists reconciled_at timestamptz;
alter table public.ledger_entries drop constraint if exists ledger_status_currency_valid;
alter table public.ledger_entries add constraint ledger_status_currency_valid check (
  status in ('planned','posted') and currency_code in ('CNY','USD','EUR','HKD','GBP') and amount_minor >= 0
);
create unique index if not exists ledger_recurrence_occurrence_unique
  on public.ledger_entries(user_id, recurrence_rule_id, occurrence_date) where recurrence_rule_id is not null;

alter table public.user_preferences add column if not exists monthly_budget_minor bigint;
update public.user_preferences set monthly_budget_minor = pg_catalog.round(monthly_budget * 100)::bigint
where monthly_budget is not null and monthly_budget_minor is null;
alter table public.user_preferences add column if not exists currency_code text not null default 'CNY';
alter table public.user_preferences drop constraint if exists preferences_currency_valid;
alter table public.user_preferences add constraint preferences_currency_valid check (currency_code in ('CNY','USD','EUR','HKD','GBP'));

create table if not exists public.ledger_rules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, stage text not null default 'default' check (stage in ('pre','default','post')),
  sort_order bigint not null default 0, enabled boolean not null default true,
  conditions jsonb not null default '{}', actions jsonb not null default '{}', row_version bigint not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (pg_catalog.char_length(name) between 1 and 200),
  check (pg_catalog.octet_length(conditions::text) <= 32768 and pg_catalog.octet_length(actions::text) <= 32768)
);
create table if not exists public.ledger_splits (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_entry_id uuid not null references public.ledger_entries(id) on delete cascade,
  category text not null, amount_minor bigint not null check (amount_minor > 0), note text,
  row_version bigint not null default 1, created_at timestamptz not null default now(),
  check (pg_catalog.char_length(category) between 1 and 200)
);
create table if not exists public.ledger_reconciliations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.ledger_accounts(id) on delete cascade,
  statement_date date not null, balance_minor bigint not null, row_version bigint not null default 1,
  created_at timestamptz not null default now(), unique(user_id, account_id, statement_date)
);

create table if not exists public.inbox_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  raw_text text not null, source text not null default 'manual' check (source in ('quick_capture','share_target','manual')),
  parsed_candidates jsonb not null default '[]', suggested_kind text,
  status text not null default 'pending' check (status in ('pending','routed','archived')),
  routed_kind text, routed_id uuid, row_version bigint not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (pg_catalog.char_length(raw_text) between 1 and 100000),
  check (pg_catalog.octet_length(parsed_candidates::text) <= 262144)
);

create table if not exists public.entity_links (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_kind text not null, source_id uuid not null, target_kind text not null, target_id uuid not null,
  row_version bigint not null default 1, created_at timestamptz not null default now(),
  check (source_kind in ('todo','habit','ledger','goal','note','practice','workout')),
  check (target_kind in ('todo','habit','ledger','goal','note','practice','workout')),
  check (source_kind <> target_kind or source_id <> target_id),
  unique(user_id, source_kind, source_id, target_kind, target_id)
);
create table if not exists public.workbench_templates (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('todo','habit','goal','workout')), name text not null, payload jsonb not null default '{}',
  row_version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (pg_catalog.char_length(name) between 1 and 200), check (pg_catalog.octet_length(payload::text) <= 65536)
);
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('todo','ledger')), name text not null, filters jsonb not null default '{}',
  sort jsonb not null default '[]', is_default boolean not null default false, row_version bigint not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (pg_catalog.char_length(name) between 1 and 200),
  check (pg_catalog.octet_length(filters::text) <= 32768 and pg_catalog.octet_length(sort::text) <= 32768)
);
create unique index if not exists saved_views_one_default
  on public.saved_views(user_id, entity_kind) where is_default;

create or replace function public.sync_todo_done_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'open' and new.done then new.status := 'done'; end if;
    new.done := new.status = 'done';
  elsif new.status is distinct from old.status then
    new.done := new.status = 'done';
  elsif new.done is distinct from old.done then
    new.status := case when new.done then 'done' else 'open' end;
  end if;
  return new;
end; $$;
drop trigger if exists todos_done_status_sync on public.todos;
create trigger todos_done_status_sync before insert or update of done, status on public.todos
for each row execute function public.sync_todo_done_status();

create or replace function public.sync_ledger_minor_amount()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.amount_minor is distinct from old.amount_minor then
    new.amount := new.amount_minor::numeric / 100;
  elsif new.amount is distinct from old.amount then
    new.amount_minor := pg_catalog.round(new.amount * 100)::bigint;
  end if;
  return new;
end; $$;
drop trigger if exists ledger_minor_amount_sync on public.ledger_entries;
create trigger ledger_minor_amount_sync before insert or update of amount, amount_minor on public.ledger_entries
for each row execute function public.sync_ledger_minor_amount();

create or replace function public.sync_budget_minor_amount()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.monthly_budget_minor is not null then new.monthly_budget := new.monthly_budget_minor::numeric / 100;
    elsif new.monthly_budget is not null then new.monthly_budget_minor := pg_catalog.round(new.monthly_budget * 100)::bigint; end if;
  elsif new.monthly_budget_minor is distinct from old.monthly_budget_minor then
    new.monthly_budget := case when new.monthly_budget_minor is null then null else new.monthly_budget_minor::numeric / 100 end;
  elsif new.monthly_budget is distinct from old.monthly_budget then
    new.monthly_budget_minor := case when new.monthly_budget is null then null else pg_catalog.round(new.monthly_budget * 100)::bigint end;
  end if;
  return new;
end; $$;
drop trigger if exists preferences_budget_minor_sync on public.user_preferences;
create trigger preferences_budget_minor_sync before insert or update of monthly_budget, monthly_budget_minor on public.user_preferences
for each row execute function public.sync_budget_minor_amount();

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'recurrence_rules','ledger_accounts','ledger_payees','ledger_rules','ledger_splits',
    'ledger_reconciliations','inbox_items','entity_links','workbench_templates','saved_views'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security', v_table);
    execute pg_catalog.format('drop policy if exists %I on public.%I', 'own ' || v_table, v_table);
    execute pg_catalog.format('create policy %I on public.%I using (user_id = auth.uid()) with check (user_id = auth.uid())', 'own ' || v_table, v_table);
    execute pg_catalog.format('grant select, insert, update, delete on public.%I to authenticated', v_table);
    execute pg_catalog.format('revoke all on public.%I from anon', v_table);
    execute pg_catalog.format('drop trigger if exists %I_revision_guard on public.%I', v_table, v_table);
    execute pg_catalog.format('create trigger %I_revision_guard before insert or update or delete on public.%I for each statement execute function public.guard_user_data_revision()', v_table, v_table);
    execute pg_catalog.format('drop trigger if exists %I_revision on public.%I', v_table, v_table);
    execute pg_catalog.format('create trigger %I_revision before insert or update or delete on public.%I for each row execute function public.bump_user_data_revision()', v_table, v_table);
    execute pg_catalog.format('drop trigger if exists %I_row_version on public.%I', v_table, v_table);
    execute pg_catalog.format('create trigger %I_row_version before update on public.%I for each row execute function public.bump_row_version()', v_table, v_table);
  end loop;
  foreach v_table in array array['recurrence_rules','ledger_accounts','ledger_payees','ledger_rules','inbox_items','workbench_templates','saved_views'] loop
    execute pg_catalog.format('drop trigger if exists %I_set_updated_at on public.%I', v_table, v_table);
    execute pg_catalog.format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', v_table, v_table);
  end loop;
end;
$$;

create index if not exists inbox_items_user_status_idx on public.inbox_items(user_id, status, created_at desc);
create index if not exists recurrence_rules_user_idx on public.recurrence_rules(user_id, enabled, entity_type);
create index if not exists ledger_accounts_user_idx on public.ledger_accounts(user_id, archived, name);
create index if not exists ledger_rules_order_idx on public.ledger_rules(user_id, stage, sort_order, id);
create index if not exists entity_links_source_idx on public.entity_links(user_id, source_kind, source_id);
create index if not exists entity_links_target_idx on public.entity_links(user_id, target_kind, target_id);
create index if not exists todos_text_trgm_idx on public.todos using gin (text extensions.gin_trgm_ops);
create index if not exists notes_title_trgm_idx on public.notes using gin (title extensions.gin_trgm_ops);
create index if not exists notes_body_trgm_idx on public.notes using gin (body extensions.gin_trgm_ops);

revoke all on function public.sync_todo_done_status() from public, anon, authenticated;
revoke all on function public.sync_ledger_minor_amount() from public, anon, authenticated;
revoke all on function public.sync_budget_minor_amount() from public, anon, authenticated;
