-- Per-day count of the runs that added to an account's stats (and so to its
-- XP, src/game/xp.ts). The only bound on how many run results one account can
-- submit in a day: `daily_runs` counts started-and-finished runs from
-- api/run.ts (quits are not in it, and a failed request skips it), and a free
-- account's run_log keeps only 5 rows, so neither can be counted.
-- Sole writer: api/runlog.ts via claim_counted_run(), service role only.

create table public.counted_runs (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.counted_runs enable row level security;
-- No client policy at all: nobody but the service role reads or writes it.
revoke all on public.counted_runs from anon, authenticated;
grant all on public.counted_runs to service_role;

comment on table public.counted_runs is
  'Runs per user per local day that added to stats. Written only by api/runlog.ts (claim_counted_run).';

-- Takes one slot for (user, day) if fewer than p_limit are used; true if taken.
-- Atomic: two posts at once cannot both take the last slot.
create or replace function public.claim_counted_run(p_user uuid, p_day date, p_limit integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  taken integer;
begin
  insert into public.counted_runs as c (user_id, day, count)
  values (p_user, p_day, 1)
  on conflict (user_id, day) do update
    set count = c.count + 1
    where c.count < p_limit
  returning c.count into taken;
  return taken is not null and taken <= p_limit;
end;
$$;

-- 0009's lesson: revoke from PUBLIC, not only the named roles.
revoke execute on function public.claim_counted_run(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.claim_counted_run(uuid, date, integer) to service_role;
