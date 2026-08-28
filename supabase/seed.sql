-- CI/local-only seed. Supabase production never runs db seed files.
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,
  raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,email_change,email_change_token_new,recovery_token
)
values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000001','authenticated','authenticated','ci-owner@example.test',crypt('WorkbenchCI!2026',gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{}',false,'','','',''),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000002','authenticated','authenticated','ci-peer@example.test',crypt('WorkbenchCI!2026',gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{}',false,'','','','')
on conflict (id) do nothing;

insert into auth.identities(id,user_id,provider,identity_data,provider_id,last_sign_in_at,created_at,updated_at)
values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','email','{"sub":"10000000-0000-0000-0000-000000000001","email":"ci-owner@example.test"}','10000000-0000-0000-0000-000000000001',now(),now(),now()),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','email','{"sub":"10000000-0000-0000-0000-000000000002","email":"ci-peer@example.test"}','10000000-0000-0000-0000-000000000002',now(),now(),now())
on conflict (id) do nothing;

insert into public.todos(user_id,text,level,done,status,pinned)
values('10000000-0000-0000-0000-000000000001','CI owner private row','mid',false,'open',false)
on conflict do nothing;
