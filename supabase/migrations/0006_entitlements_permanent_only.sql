-- 0006_entitlements_permanent_only — restrict the entitlements read to
-- permanent accounts, the same guard 0004 put on tone_stats.
--
-- 0005 shipped `ent_select_own` open to `authenticated`, and in Supabase an
-- anonymous user is authenticated. The security advisor flagged it. It was not
-- exploitable — the policy is select-own and an anonymous user can never have a
-- row, since a purchase requires sign-in — but the product rule is that Pro is
-- an account's property, and stating it in Postgres beats resting on that.
--
-- 0005 is fixed here rather than edited because it has already been applied to
-- the live project; the ledger is append-only from the first deploy.

drop policy if exists ent_select_own on public.entitlements;

create policy ent_select_own on public.entitlements
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
