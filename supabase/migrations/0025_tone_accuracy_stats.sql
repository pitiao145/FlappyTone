-- 0025_tone_accuracy_stats — per-tone and per-combo TONE ACCURACY, replacing
-- tone_stats as what the account syncs.
--
-- Spec A (docs/SPECS/flappytone-SPEC-tone-accuracy.md): the per-tone numbers
-- stopped meaning corridor accuracy (the score's fit, on the gate's clock) and
-- started meaning tone accuracy (did the voice make the right tone, timing-
-- free). Old and new numbers must never mix, and the sync is merge-by-max in
-- both directions — so clearing tone_stats in place would not hold: any
-- device still carrying an old lifetime total (or a tab still running the old
-- code) would push it straight back up on its next sync.
--
-- A new table makes that impossible by construction. The new client reads and
-- writes only this one; tone_stats is left in place, untouched and no longer
-- read, so an old tab writing to it harms nothing. Drop it in a later
-- migration once no client can still be writing it.
--
-- One row per player per TARGET: a single tone ("1".."4") or a two-syllable
-- combo in toneComboKey form ("3-2"). Neutral combos are never stored (the
-- client has no reference to measure them against), so the check allows only
-- tones 1-4. Same columns and meaning as tone_stats otherwise: attempts and
-- sum_accuracy count heard gates only, unheard is tallied apart (CLAUDE.md
-- rule 8 — an unclear signal is never scored as wrong).

create table public.tone_accuracy_stats (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  target        text not null check (target ~ '^[1-4](-[1-4])?$'),
  attempts      bigint not null default 0 check (attempts >= 0),
  unheard       bigint not null default 0 check (unheard >= 0),
  sum_accuracy  double precision not null default 0 check (sum_accuracy >= 0),
  best_accuracy real not null default 0 check (best_accuracy between 0 and 1),
  updated_at    timestamptz not null default now(),
  primary key (user_id, target)
);

alter table public.tone_accuracy_stats enable row level security;

-- Owner-only, permanent accounts only — the same guard 0004 put on
-- tone_stats: an anonymous player's stats stay on their device. The policy
-- column leads the primary key, so it is already indexed; the helpers are
-- wrapped in their own subqueries so they evaluate once per query (0004).
create policy tone_acc_read on public.tone_accuracy_stats
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy tone_acc_insert on public.tone_accuracy_stats
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy tone_acc_update on public.tone_accuracy_stats
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

-- A raw-SQL migration must grant explicitly (DECISIONS.md, Phase 1): RLS
-- narrows access, it does not grant it. And Supabase's default privileges
-- hand ALL on a new public table to anon and authenticated (0023), so revoke
-- those first and grant back only what the sync uses: no anon access, no
-- delete, same as tone_stats.
revoke all on public.tone_accuracy_stats from anon, authenticated;
grant select, insert, update on public.tone_accuracy_stats to authenticated;
grant all on public.tone_accuracy_stats to service_role;

comment on table public.tone_stats is
  'Deprecated by 0025 (tone_accuracy_stats): per-tone CORRIDOR accuracy from before spec A. No longer read or written by the current client; kept only so an old open tab has somewhere harmless to write. Drop in a later migration.';
comment on table public.tone_accuracy_stats is
  'Per-player tone accuracy (spec A, timing-free), per single tone ("1".."4") or two-syllable combo ("3-2"). Synced merge-by-max by src/data/account.ts.';
