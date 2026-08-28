begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(4);

select extensions.ok(pg_catalog.has_function_privilege('service_role','public.get_legacy_rpc_retirement_evidence(date)','EXECUTE'),'service role can read retirement evidence');
select extensions.ok(not pg_catalog.has_function_privilege('authenticated','public.get_legacy_rpc_retirement_evidence(date)','EXECUTE'),'authenticated cannot read private retirement evidence');

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role','service_role',true);
select extensions.is((public.get_legacy_rpc_retirement_evidence(current_date)->>'required_days')::bigint,30::bigint,'retirement gate requires thirty days');
select extensions.is((public.get_legacy_rpc_retirement_evidence(current_date)->>'eligible')::boolean,false,'insufficient evidence fails closed');
reset role;

select * from extensions.finish();
rollback;
