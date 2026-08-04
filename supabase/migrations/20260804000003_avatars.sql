-- ============================================================
-- 个人工作台 · 用户头像（user_avatars + storage 桶 + RPC）
-- 说明：每个用户最多保留 5 张头像，超限自动淘汰最旧的非当前头像。
-- ============================================================

-- ---------- 头像记录表 ----------
create table if not exists public.user_avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, storage_path)
);
create index if not exists user_avatars_user_idx on public.user_avatars (user_id);

alter table public.user_avatars enable row level security;

drop policy if exists "own avatars" on public.user_avatars;
create policy "own avatars" on public.user_avatars
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- storage 桶：avatars（公开读） ----------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars insert own" on storage.objects;
create policy "avatars insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- RPC：上传后登记新头像（自动切换 active、超限淘汰最旧） ----------
create or replace function public.upsert_avatar(p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_avatar_id uuid;
  v_evicted text[] := '{}';
  v_old record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- 路径必须以自己的 uid 开头，防止越权使用他人路径
  if left(p_path, length(v_uid::text) + 1) <> v_uid::text || '/' then
    raise exception 'invalid path';
  end if;

  -- 清除旧的 active，把新头像设为当前
  update public.user_avatars set is_active = false where user_id = v_uid;
  insert into public.user_avatars (user_id, storage_path, is_active)
  values (v_uid, p_path, true)
  returning id into v_avatar_id;

  -- 超过上限（5）时，从旧到新淘汰非当前的头像
  for v_old in
    select id, storage_path, is_active
    from public.user_avatars
    where user_id = v_uid
    order by created_at asc
  loop
    if (select count(*) from public.user_avatars where user_id = v_uid) > 5
       and not v_old.is_active then
      v_evicted := array_append(v_evicted, v_old.storage_path);
      delete from public.user_avatars where id = v_old.id;
    end if;
  end loop;

  return jsonb_build_object('avatar_id', v_avatar_id, 'evicted_paths', v_evicted);
end;
$$;

-- ---------- RPC：切换历史头像为当前使用 ----------
create or replace function public.set_active_avatar(p_avatar_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_avatars set is_active = false where user_id = auth.uid();
  update public.user_avatars set is_active = true
  where id = p_avatar_id and user_id = auth.uid();
$$;

-- ---------- RPC：删除历史头像（当前使用的不可删），返回 storage 路径 ----------
create or replace function public.delete_avatar(p_avatar_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  select storage_path into v_path
  from public.user_avatars
  where id = p_avatar_id and user_id = auth.uid() and not is_active;

  if v_path is null then
    return null;
  end if;

  delete from public.user_avatars
  where id = p_avatar_id and user_id = auth.uid();

  return v_path;
end;
$$;

-- ---------- 授权 ----------
grant all on table public.user_avatars to anon, authenticated, service_role;
grant execute on function public.upsert_avatar(text) to authenticated;
grant execute on function public.set_active_avatar(uuid) to authenticated;
grant execute on function public.delete_avatar(uuid) to authenticated;
