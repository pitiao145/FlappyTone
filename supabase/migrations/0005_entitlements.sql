-- 0005_entitlements — the Pro flag, written only by the server.
--
-- `has_access` unlocks paid value, so it is contestable in a way a profile
-- field is not. `profiles` is client-writable under RLS, so a column there
-- could be flipped to true from devtools in one call. This table follows the
-- `leaderboard_scores` pattern instead: the player may select their own row
-- and there is no client write policy at all. Only the Lemon Squeezy webhook
-- (service-role key, like api/score.ts) writes it.
--
-- `user_id` references `profiles`, not `auth.users`, so PostgREST can resolve
-- the relationship if a joined read is ever needed — the same reason 0001
-- pointed `leaderboard_scores` at `profiles`.

create table if not exists public.entitlements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  has_access boolean not null default false,
  source text,
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;

-- Read-your-own. No insert/update/delete policy is the enforcement.
drop policy if exists ent_select_own on public.entitlements;

create policy ent_select_own on public.entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- RLS narrows access, it does not grant it. A raw-SQL migration must say this
-- explicitly; the dashboard's table editor adds it invisibly.
grant select on public.entitlements to authenticated;
