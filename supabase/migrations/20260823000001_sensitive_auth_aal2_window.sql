-- Sensitive operations require both a fresh JWT and the appropriate assurance
-- level.  An old AAL2 session must not become a bypass for the five-minute
-- re-authentication window.
create or replace function private.require_sensitive_auth(p_max_age_seconds integer default 300)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := '{}'::jsonb;
  v_iat bigint;
  v_aal text;
  v_has_verified_factor boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  begin
    v_claims := coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_claims := '{}'::jsonb;
  end;
  begin
    v_iat := coalesce(
      nullif(v_claims->>'iat', '')::bigint,
      nullif(pg_catalog.current_setting('request.jwt.claim.iat', true), '')::bigint
    );
  exception when others then
    v_iat := null;
  end;
  v_aal := coalesce(
    nullif(v_claims->>'aal', ''),
    nullif(pg_catalog.current_setting('request.jwt.claim.aal', true), ''),
    'aal1'
  );

  if v_iat is null
    or pg_catalog.to_timestamp(v_iat) < pg_catalog.now() - pg_catalog.make_interval(secs => p_max_age_seconds)
    or pg_catalog.to_timestamp(v_iat) > pg_catalog.now() + interval '1 minute' then
    raise exception 'recent authentication required';
  end if;

  select exists(
    select 1 from auth.mfa_factors
    where user_id = v_uid and status = 'verified'
  ) into v_has_verified_factor;
  if v_has_verified_factor and v_aal <> 'aal2' then
    raise exception 'aal2 required';
  end if;
end;
$$;

revoke all on function private.require_sensitive_auth(integer) from public, anon, authenticated;
