begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(13);

select extensions.ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.restore_workbench_backup_v2(jsonb,jsonb)', 'EXECUTE'),
  'legacy V2 restore remains revoked for clients'
);
select extensions.ok(
  pg_catalog.has_function_privilege('authenticated', 'public.restore_workbench_backup_v3(jsonb,jsonb,bigint)', 'EXECUTE'),
  'V3 restore remains available behind the recent-authentication guard'
);
select extensions.ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.restore_workbench_backup_v7(jsonb,jsonb,bigint)', 'EXECUTE'),
  'legacy V7 restore remains revoked for clients'
);
select extensions.ok(
  not pg_catalog.has_function_privilege('authenticated', 'private.restore_workbench_backup_v7_unchecked(jsonb,jsonb,bigint)', 'EXECUTE'),
  'unchecked V7 implementation is not client callable'
);
select extensions.ok(
  exists(select 1 from pg_catalog.pg_proc where pronamespace = 'private'::regnamespace
    and proname = 'require_sensitive_auth'),
  'all sensitive restore paths share the recent-authentication guard'
);
select extensions.ok(
  pg_catalog.has_function_privilege('authenticated', 'public.begin_restore(bigint,integer,jsonb)', 'EXECUTE'),
  'staged begin entry point is callable only through its guarded wrapper'
);
select extensions.ok(
  not pg_catalog.has_function_privilege('authenticated', 'private.begin_restore_unchecked(bigint,integer,jsonb)', 'EXECUTE'),
  'unchecked staged begin implementation is not client callable'
);
select extensions.ok(
  not pg_catalog.has_function_privilege('authenticated', 'private.finalize_restore_unchecked(uuid,jsonb)', 'EXECUTE'),
  'unchecked staged finalize implementation is not client callable'
);
select extensions.ok(
  pg_catalog.has_function_privilege('authenticated', 'public.stage_restore_chunk(uuid,text,integer,jsonb)', 'EXECUTE'),
  'staged chunk entry point is callable only through its guarded wrapper'
);
select extensions.ok(
  pg_catalog.has_function_privilege('authenticated', 'public.finalize_restore(uuid,jsonb)', 'EXECUTE'),
  'staged finalize entry point is callable only through its guarded wrapper'
);
select extensions.ok(
  not pg_catalog.has_function_privilege('authenticated', 'private.stage_restore_chunk_unchecked(uuid,text,integer,jsonb)', 'EXECUTE'),
  'unchecked staged chunk implementation is not client callable'
);
select extensions.ok(
  pg_catalog.has_function_privilege('authenticated', 'public.abort_restore(uuid)', 'EXECUTE'),
  'staged abort entry point is callable only through its guarded wrapper'
);
select extensions.ok(
  not pg_catalog.has_function_privilege('authenticated', 'private.abort_restore_unchecked(uuid)', 'EXECUTE'),
  'unchecked staged abort implementation is not client callable'
);

select * from extensions.finish();
rollback;
