-- 0011_daily_runs_permanent_only — same guard 0004 and 0006 already carry.
--
-- `daily_runs` only ever holds rows for accounts: a guest is capped on their
-- own device. An anonymous user is `authenticated` in Supabase, so 0010's
-- policy was reachable by one, and the advisor flagged it. Stating the rule in
-- Postgres beats resting on the client never asking.

drop policy if exists runs_select_own on public.daily_runs;

create policy runs_select_own on public.daily_runs
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
