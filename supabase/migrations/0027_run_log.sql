-- 0027_run_log — a Pro player's all-time run history (spec C,
-- docs/SPECS/flappytone-SPEC-pro-run-history.md).
--
-- One row per finished/quit/restarted run, every mode, written only while the
-- player is Pro (the log starts the moment they upgrade; no backfill). The
-- daily accuracy trend is computed from per_key: Σ accSum ÷ Σ gates per key
-- per day.
--
-- per_key uses the same keys as tone_accuracy_stats (0025) and
-- player_tone_shapes (0026): "1".."4" or a toneComboKey "3-2"; neutral combos
-- are never stored. Value: {"gates": int, "accSum": number}.
--
-- Writes are server-only: api/runlog.ts is the sole writer (it checks Pro,
-- takes played_at from the server, and bounds every value). No client write
-- policy exists.

create table public.run_log (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  played_at timestamptz not null default now(),
  day       date not null,
  mode      text not null check (mode in ('game','tutorial','single','drill','learn','pairs')),
  score     integer not null check (score between 0 and 1000000),
  gates     integer not null check (gates between 0 and 500),
  outcome   text not null check (outcome in ('finished','out_of_hearts','quit','restart')),
  tone_acc  real check (tone_acc between 0 and 1),
  per_key   jsonb not null default '{}'::jsonb check (jsonb_typeof(per_key) = 'object')
);

create index run_log_user_played_idx on public.run_log (user_id, played_at desc);

alter table public.run_log enable row level security;

create policy run_log_read on public.run_log
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

-- Supabase's default privileges grant ALL to anon/authenticated (0023).
revoke all on public.run_log from anon, authenticated;
grant select on public.run_log to authenticated;
grant all on public.run_log to service_role;

comment on table public.run_log is
  'Pro only (spec C): one row per run, all modes. Voice-derived accuracy numbers, not audio. Sole writer: api/runlog.ts.';
