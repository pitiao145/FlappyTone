-- 0037_weekly_tone_accuracy — the come-back loop (brief 55).
--
-- 1. weekly_tone_accuracy: per player x local week (Monday) x single tone,
--    the heard gates and summed tone accuracy of every counted run. Feeds the
--    weekly headline ("third tone up 9 pts this week") for free AND Pro: a
--    free account's run_log keeps only 5 rows, so it cannot answer "this week
--    vs last week". `week` is date_trunc('week') of the client's local `day`
--    (the same day record_run and counted_runs use), so a week is the
--    player's own Monday-to-Sunday. Single tones only ("1".."4").
--    Sole writer: api/runlog.ts via add_weekly_tone_accuracy(), after
--    record_run() applied a stats run (so a retry never adds twice).
-- 2. counted_runs becomes owner-readable: the client derives runs per day
--    (daily goal: 3 counted runs = bonus XP, src/game/comeBack.ts) and runs
--    per week (the headline's 3-run threshold) from it. Still server-written
--    only (claim_counted_run, 0032).
--
-- Voice-derived numbers, not audio (same as tone_accuracy_stats).
--
-- Rollback:
--   drop policy counted_runs_read on public.counted_runs;
--   revoke select on public.counted_runs from authenticated;
--   drop function public.add_weekly_tone_accuracy(uuid, date, jsonb);
--   drop table public.weekly_tone_accuracy;

create table public.weekly_tone_accuracy (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  week         date not null check (extract(isodow from week) = 1),
  tone         text not null check (tone ~ '^[1-4]$'),
  attempts     bigint not null default 0 check (attempts >= 0),
  sum_accuracy double precision not null default 0 check (sum_accuracy >= 0),
  updated_at   timestamptz not null default now(),
  primary key (user_id, week, tone)
);

alter table public.weekly_tone_accuracy enable row level security;

create policy weekly_tone_read on public.weekly_tone_accuracy
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

revoke all on public.weekly_tone_accuracy from anon, authenticated;
grant select on public.weekly_tone_accuracy to authenticated;
grant all on public.weekly_tone_accuracy to service_role;

comment on table public.weekly_tone_accuracy is
  'Brief 55: heard gates + summed tone accuracy per user x local week (Monday) x single tone, counted runs only. Sole writer: api/runlog.ts (add_weekly_tone_accuracy).';

-- Adds a run's single-tone keys of p_per_key into the week of p_day.
-- p_per_key: {"2": {"gates": n, "accSum": x, ...}, "3-2": {...}} (pairs skipped).
create function public.add_weekly_tone_accuracy(p_user uuid, p_day date, p_per_key jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare k text; v jsonb; g bigint; wk date := date_trunc('week', p_day)::date;
begin
  for k, v in select * from jsonb_each(coalesce(p_per_key, '{}'::jsonb)) loop
    continue when k !~ '^[1-4]$';
    g := coalesce((v->>'gates')::bigint, 0);
    continue when g <= 0;
    insert into public.weekly_tone_accuracy (user_id, week, tone, attempts, sum_accuracy)
    values (p_user, wk, k, g, least(greatest(coalesce((v->>'accSum')::float8, 0), 0), g))
    on conflict (user_id, week, tone) do update set
      attempts     = public.weekly_tone_accuracy.attempts + excluded.attempts,
      sum_accuracy = public.weekly_tone_accuracy.sum_accuracy + excluded.sum_accuracy,
      updated_at   = now();
  end loop;
end $$;

revoke execute on function public.add_weekly_tone_accuracy(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.add_weekly_tone_accuracy(uuid, date, jsonb) to service_role;

-- Owner reads their own per-day run counts (was service-role only).
create policy counted_runs_read on public.counted_runs
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
grant select on public.counted_runs to authenticated;
