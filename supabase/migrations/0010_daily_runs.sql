-- 0010_daily_runs — the run cap, for players who have an identity worth
-- counting against.
--
-- A guest's cap stays on their device: clearing storage mints a new anonymous
-- identity, so there is nothing durable to count against and a server table
-- would only be theatre. An account is durable, so the free tier's cap can be
-- real, and this is where it lives.
--
-- Written only by `api/run.ts` under the service-role key. No client write
-- policy, same enforcement shape as `leaderboard_scores` and `entitlements`:
-- if the client could decide the value and the value matters, it goes through
-- a function.
--
-- `day` is the player's own local date, sent by the client and bounded by the
-- server to ±1 day of UTC. A device clock can shift the boundary; it cannot
-- invent days. Storing UTC instead would reset a Taiwan player's runs at 8am,
-- which is worse than the spoofing this allows.

create table if not exists public.daily_runs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.daily_runs enable row level security;

drop policy if exists runs_select_own on public.daily_runs;

create policy runs_select_own on public.daily_runs
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.daily_runs to authenticated;
grant all on public.daily_runs to service_role;
