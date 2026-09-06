-- 0003_accounts — Ring 2: the tables a real account syncs into.
--
-- Phase 1 gave every player an anonymous identity that writes one thing: a
-- leaderboard score. Phase 2 adds the rest of what an account is for — the
-- player's own stats, carried across devices — and the write path that fills
-- it when an anonymous user upgrades in place by adding an email.
--
-- Nothing here is reachable by a player yet. Accounts are a Pro feature and
-- the UI is dev-gated; this is the plumbing, applied ahead of the product.
--
-- All of it is Lane A: a player owns these rows and row-level security says
-- so. Nothing in this migration is contestable the way a score is, so none of
-- it needs a server function.

-- ------------------------------------------------ lifetime totals on profiles
--
-- The counts the Progress tab already shows from localStorage, given somewhere
-- to live once a player has an account. Defaulted to 0 rather than null so a
-- merge never has to distinguish "no account activity" from "unknown".

alter table public.profiles
  add column best_score     int not null default 0 check (best_score >= 0),
  add column total_runs     int not null default 0 check (total_runs >= 0),
  add column total_gates    int not null default 0 check (total_gates >= 0),
  add column streak_current int not null default 0 check (streak_current >= 0),
  add column streak_best    int not null default 0 check (streak_best >= 0),
  add column synced_at      timestamptz;

-- ---------------------------------------------------------------- tone_stats
--
-- One row per player per tone: the warm aggregate the Progress tab reads,
-- updated as runs finish rather than recomputed from a log of every gate.
-- Raw per-gate events (ARCH's Ring 3) are deliberately not here — per-tone
-- accuracy is answerable without them, and they are the expensive kind of data.
--
-- Columns mirror what the game actually measures. ARCH sketched a `hits`
-- column; there is no definition of a "hit" anywhere in the scoring code, so
-- rather than invent a metric this stores `unheard` — gates where the player
-- could not be heard at all, which is a real and separately meaningful number
-- (see CLAUDE.md's rule that an unclear signal is never scored as wrong).
create table public.tone_stats (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  tone          smallint not null check (tone between 1 and 4),
  attempts      bigint not null default 0 check (attempts >= 0),
  unheard       bigint not null default 0 check (unheard >= 0),
  sum_accuracy  double precision not null default 0 check (sum_accuracy >= 0),
  best_accuracy real not null default 0 check (best_accuracy between 0 and 1),
  updated_at    timestamptz not null default now(),
  primary key (user_id, tone)
);

alter table public.tone_stats enable row level security;

-- Owner-only, and private: unlike the board, nobody else may read these. The
-- policy's column is the leading edge of the primary key, so it is already
-- indexed; `(select auth.uid())` keeps the helper to one evaluation per query
-- rather than one per row.
create policy tone_read on public.tone_stats
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy tone_insert on public.tone_stats
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy tone_update on public.tone_stats
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ------------------------------------------------------- profile updates back
--
-- 0001 deliberately shipped no UPDATE policy on profiles: names were generated
-- and uneditable, so the write path was unused surface. An account changes
-- that — renaming is a Pro feature and accounts are the Pro tier — so the
-- policy returns, restricted to permanent users.
--
-- The `is_anonymous` claim is set by Supabase Auth itself, not by anything the
-- client can write, which is what makes it safe to authorise on. It also keeps
-- the security advisor quiet: an anonymous user cannot reach this policy at
-- all, which was its complaint about the original.
create policy prof_update on public.profiles
  for update to authenticated
  using (
    (select auth.uid()) = id
    and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    (select auth.uid()) = id
    and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- ------------------------------------------------------------------ grants

grant update on public.profiles to authenticated;
grant select, insert, update on public.tone_stats to authenticated;
grant all on public.tone_stats to service_role;
