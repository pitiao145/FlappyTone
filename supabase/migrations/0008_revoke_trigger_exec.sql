-- 0008_revoke_trigger_exec — take the rename trigger's function off the API.
--
-- 0007's function is SECURITY DEFINER, which it must be: it reads
-- `entitlements`, and the player it runs for cannot see anyone's row but their
-- own. But every function in `public` is also exposed as a PostgREST RPC, so
-- the advisor correctly flagged that anyone could POST to
-- /rest/v1/rpc/enforce_rename_entitlement. Calling it outside a trigger fails
-- on the missing OLD/NEW records rather than doing anything useful, but an
-- unused, definer-rights entry point is surface for nothing.
--
-- Triggers execute as the table owner, not the caller, so revoking EXECUTE
-- does not stop the trigger from firing.

revoke execute on function public.enforce_rename_entitlement() from anon, authenticated;
