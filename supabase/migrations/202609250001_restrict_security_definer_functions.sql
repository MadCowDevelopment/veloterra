-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Require
-- explicit grants for functions created by subsequent migrations.
alter default privileges in schema public
  revoke execute on functions from public;

revoke execute on function public.sync_wallet_progress(bigint, double precision, integer) from public;
revoke execute on function public.sync_wallet_progress(bigint, double precision, integer) from anon;
grant execute on function public.sync_wallet_progress(bigint, double precision, integer) to authenticated;

revoke execute on function public.contribute_to_landmark(uuid, bigint, uuid) from public;
revoke execute on function public.contribute_to_landmark(uuid, bigint, uuid) from anon;
grant execute on function public.contribute_to_landmark(uuid, bigint, uuid) to authenticated;

revoke execute on function public.claim_landmark_discovery(text, smallint) from public;
revoke execute on function public.claim_landmark_discovery(text, smallint) from anon;
grant execute on function public.claim_landmark_discovery(text, smallint) to authenticated;

-- This query only reads relations already protected for authenticated users,
-- so it does not need to run with its owner's privileges.
alter function public.get_landmark_contributors(uuid) security invoker;
revoke execute on function public.get_landmark_contributors(uuid) from public;
revoke execute on function public.get_landmark_contributors(uuid) from anon;
grant execute on function public.get_landmark_contributors(uuid) to authenticated;

-- Supabase may install this event-trigger helper outside repository migrations.
-- Its owner can still execute it; Data API roles must not be able to call it.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public';
    execute 'revoke execute on function public.rls_auto_enable() from anon';
    execute 'revoke execute on function public.rls_auto_enable() from authenticated';
  end if;
end;
$$;