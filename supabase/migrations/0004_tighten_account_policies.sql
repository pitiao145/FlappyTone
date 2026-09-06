-- 0004_tighten_account_policies — restrict tone_stats to permanent accounts,
-- and fix an RLS expression that re-evaluated per row.
--
-- Two problems the advisors caught in 0003, both worth fixing properly rather
-- than silencing.
--
-- 1. `tone_stats` was open to any `authenticated` role, and in Supabase an
--    anonymous user *is* authenticated. That contradicts the architecture's
--    central rule: an anonymous player's stats stay on their device, and the
--    server only ever holds a leaderboard score for them. Syncing is what an
--    account buys. The policies now carry the same `is_anonymous = false`
--    guard `prof_update` does, so the rule is enforced in Postgres instead of
--    resting on the client never calling these tables.
--
-- 2. `prof_update`'s anonymity check was written
--    `(select auth.jwt() ->> 'is_anonymous')::boolean`, casting outside the
--    subquery, so the planner treated it as a per-row expression rather than a
--    once-per-query InitPlan. The helper has to be wrapped on its own —
--    `(select auth.jwt()) ->> ...` — for it to be evaluated once; burying it
--    inside a coalesce() or a cast does not count.
--
-- The claim itself is set by Supabase Auth and cannot be written by a client,
-- which is what makes it safe to authorise on.

drop policy if exists prof_update on public.profiles;

create policy prof_update on public.profiles
  for update to authenticated
  using (
    (select auth.uid()) = id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    (select auth.uid()) = id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

drop policy if exists tone_read on public.tone_stats;
drop policy if exists tone_insert on public.tone_stats;
drop policy if exists tone_update on public.tone_stats;

create policy tone_read on public.tone_stats
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy tone_insert on public.tone_stats
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy tone_update on public.tone_stats
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
