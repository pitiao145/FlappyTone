-- 0009_revoke_trigger_exec_public — finish what 0008 started.
--
-- 0008 revoked EXECUTE from `anon` and `authenticated` and the advisor still
-- flagged the function. Postgres grants EXECUTE on a new function to PUBLIC by
-- default, and `anon`/`authenticated` were reaching it through that grant, not
-- through one of their own — so revoking from the named roles removed nothing
-- (`proacl` still read `=X/postgres`). PUBLIC is the grant that has to go.

revoke execute on function public.enforce_rename_entitlement() from public;
