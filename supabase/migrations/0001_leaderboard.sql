-- 0001_leaderboard — Ring 1 of docs/flappytone-ARCH-supabase.md.
--
-- Identity + the weekly leaderboard. Two tables, both RLS-enabled, with the
-- write split that the architecture doc calls "two lanes":
--
--   Lane A  profiles            client writes its own row, RLS enforces ownership
--   Lane B  leaderboard_scores  NO client write policy at all; only api/score.ts,
--                               holding the service-role key, may write it.
--
-- Policies follow the four RLS performance rules (ARCH §2): auth helpers wrapped
-- in a subquery so they evaluate once per query rather than once per row, an
-- explicit TO role list so the policy never runs for a role that can't use it,
-- and an index behind every column a policy filters on.
--
-- Applied through the Supabase MCP `apply_migration`, never by hand in the
-- dashboard, so the schema stays reproducible from this file.

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 24),
  is_public     boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Names are shown on a public board, so reads are open to everyone including
-- signed-out visitors.
create policy prof_read on public.profiles
  for select to authenticated, anon
  using (true);

create policy prof_insert on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy prof_update on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ------------------------------------------------------ leaderboard_scores

-- Current best single run per player per ISO week. Warm data: written rarely
-- (only when a player beats their own week), read on every board view.
create table public.leaderboard_scores (
  user_id     uuid not null references auth.users (id) on delete cascade,
  week_id     text not null check (week_id ~ '^\d{4}-W\d{2}$'),
  best_score  int not null check (best_score between 0 and 1000000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, week_id)
);

alter table public.leaderboard_scores enable row level security;

-- Serves both queries the board makes: the top N of a week, and a player's
-- rank within it (count of scores above theirs).
create index lb_week_rank on public.leaderboard_scores (week_id, best_score desc);

create policy lb_read on public.leaderboard_scores
  for select to authenticated, anon
  using (true);

-- Deliberately no insert/update/delete policy. A score is contestable, so the
-- client must not be able to write one even with a valid session; api/score.ts
-- uses the service role, which bypasses RLS.

-- ------------------------------------------------------------------ grants
--
-- Creating tables through raw SQL does not grant table privileges the way the
-- dashboard's Table Editor does. Without these, every client query fails with
-- "permission denied for table" even though the RLS policies above are correct
-- — RLS narrows what a role may touch, it does not grant access in the first
-- place.

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.leaderboard_scores to anon, authenticated;

grant all on public.profiles to service_role;
grant all on public.leaderboard_scores to service_role;
