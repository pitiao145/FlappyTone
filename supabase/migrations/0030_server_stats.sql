-- 0030_server_stats — the server owns an account's progress (brief 05).
--
-- Additive and safe for old clients: nothing is dropped or revoked here
-- (that is 0031, applied only after the new client is deployed). An old tab
-- still max-merges through the existing policies; a new client posts every
-- run once to api/runlog.ts, which calls record_run() below.
--
-- record_run() ADDS one run to the account, idempotent by a client-minted
-- run_id. Two flags, decided by the API from the run's mode and outcome so
-- they mirror the local recordRun()/recordPlay() exactly:
--   p_stats  — counters, best score, words, lifetime tone accuracy
--              (game/drill/pairs; finished, out_of_hearts or quit)
--   p_streak — the daily streak (game/drill/pairs; finished or out_of_hearts)
-- p_ring: null keeps every row (Pro); 5 trims a free account's log to its
-- latest 5 rows.
--
-- adopt_guest() ADDS a guest's local totals once, on the guest -> account
-- step, idempotent by a client-minted adopt id (the adoptions table).
--
-- Both functions: security invoker (the service role bypasses RLS anyway),
-- search_path '', execute for service_role only (0009's lesson: revoke from
-- PUBLIC, not only the named roles).

alter table public.run_log add column run_id uuid;
create unique index run_log_user_run_idx on public.run_log (user_id, run_id);

alter table public.profiles
  add column streak_last_day date,
  add column words_played text[] not null default '{}'
    check (cardinality(words_played) <= 5000);

create table public.adoptions (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  adopt_id   uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, adopt_id)
);
alter table public.adoptions enable row level security;
-- No policy: nobody but the service role reads or writes it.
revoke all on public.adoptions from anon, authenticated;
grant all on public.adoptions to service_role;
comment on table public.adoptions is
  'Brief 05: one row per guest->account adoption, so adopt_guest() adds a device''s local totals once. Service role only.';

-- Adds per-key tone accuracy into tone_accuracy_stats.
-- p_per_key: {"2": {"gates": n, "accSum": x, "unheard": n, "best": x}, ...}
create function public.add_tone_accuracy(p_user uuid, p_per_key jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare k text; v jsonb; g bigint; u bigint;
begin
  for k, v in select * from jsonb_each(coalesce(p_per_key, '{}'::jsonb)) loop
    g := coalesce((v->>'gates')::bigint, 0);
    u := coalesce((v->>'unheard')::bigint, 0);
    continue when g + u = 0;
    insert into public.tone_accuracy_stats (user_id, target, attempts, unheard, sum_accuracy, best_accuracy)
    values (p_user, k, g, u, coalesce((v->>'accSum')::float8, 0), coalesce((v->>'best')::real, 0))
    on conflict (user_id, target) do update set
      attempts      = public.tone_accuracy_stats.attempts + excluded.attempts,
      unheard       = public.tone_accuracy_stats.unheard + excluded.unheard,
      sum_accuracy  = public.tone_accuracy_stats.sum_accuracy + excluded.sum_accuracy,
      best_accuracy = greatest(public.tone_accuracy_stats.best_accuracy, excluded.best_accuracy),
      updated_at    = now();
  end loop;
end $$;

-- Union of two word lists, distinct, capped under the column's check.
create function public.merge_words(p_a text[], p_b text[])
returns text[] language sql immutable security invoker set search_path = '' as $$
  select coalesce(array(
    select w from (select distinct unnest(coalesce(p_a, '{}') || coalesce(p_b, '{}')) w) s
    order by w limit 5000), '{}')
$$;

create function public.record_run(
  p_user uuid, p_run uuid, p_day date, p_mode text, p_score integer, p_gates integer,
  p_outcome text, p_tone_acc real, p_per_key jsonb, p_words text[],
  p_stats boolean, p_streak boolean, p_ring integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare prev date; cur integer;
begin
  -- Lock the profile first: two runs of one player posted at once must not
  -- both read the same streak_last_day.
  select streak_last_day, streak_current into prev, cur
    from public.profiles where id = p_user for update;
  if not found then raise exception 'no profile for %', p_user; end if;

  insert into public.run_log (user_id, run_id, day, mode, score, gates, outcome, tone_acc, per_key)
  values (p_user, p_run, p_day, p_mode, p_score, p_gates, p_outcome, p_tone_acc, coalesce(p_per_key, '{}'))
  on conflict (user_id, run_id) do nothing;
  if not found then return false; end if;  -- a retry: already applied

  if p_stats then
    update public.profiles set
      total_runs   = total_runs + 1,
      total_gates  = total_gates + p_gates,
      best_score   = greatest(best_score, p_score),
      words_played = public.merge_words(words_played, p_words),
      synced_at    = now()
    where id = p_user;
    perform public.add_tone_accuracy(p_user, p_per_key);
  end if;

  if p_streak then
    -- prev null: first counted day. Same day: unchanged. Next day: +1.
    -- A gap: restart at 1. An older day than the last one (a late outbox
    -- post): changes nothing, the streak never moves backwards.
    if prev is null or p_day - prev > 1 then cur := 1;
    elsif p_day - prev = 1 then cur := cur + 1;
    end if;
    update public.profiles set
      streak_current  = cur,
      streak_best     = greatest(streak_best, cur),
      streak_last_day = greatest(coalesce(prev, p_day), p_day)
    where id = p_user;
  end if;

  if p_ring is not null then
    delete from public.run_log where user_id = p_user and id not in
      (select id from public.run_log where user_id = p_user order by played_at desc, id desc limit p_ring);
  end if;
  return true;
end $$;

-- p_per_key: lifetime per key, {"2": {"gates": attempts, "accSum": x, "unheard": n, "best": x}}.
create function public.adopt_guest(
  p_user uuid, p_adopt uuid, p_runs integer, p_gates integer, p_best integer,
  p_streak_current integer, p_streak_best integer, p_streak_last_day date,
  p_per_key jsonb, p_words text[])
returns boolean language plpgsql security invoker set search_path = '' as $$
declare prev date;
begin
  select streak_last_day into prev from public.profiles where id = p_user for update;
  if not found then raise exception 'no profile for %', p_user; end if;

  insert into public.adoptions (user_id, adopt_id) values (p_user, p_adopt)
  on conflict do nothing;
  if not found then return false; end if;

  update public.profiles set
    total_runs   = total_runs + p_runs,
    total_gates  = total_gates + p_gates,
    best_score   = greatest(best_score, p_best),
    words_played = public.merge_words(words_played, p_words),
    streak_best  = greatest(streak_best, p_streak_best, p_streak_current),
    -- The guest streak wins only when it was played more recently.
    streak_current  = case when p_streak_last_day is not null
                            and (prev is null or p_streak_last_day > prev)
                           then p_streak_current else streak_current end,
    streak_last_day = case when p_streak_last_day is not null
                            and (prev is null or p_streak_last_day > prev)
                           then p_streak_last_day else prev end,
    synced_at = now()
  where id = p_user;
  perform public.add_tone_accuracy(p_user, p_per_key);
  return true;
end $$;

revoke execute on function public.add_tone_accuracy(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.merge_words(text[], text[]) from public, anon, authenticated;
revoke execute on function public.record_run(uuid, uuid, date, text, integer, integer, text, real, jsonb, text[], boolean, boolean, integer) from public, anon, authenticated;
revoke execute on function public.adopt_guest(uuid, uuid, integer, integer, integer, integer, integer, date, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.add_tone_accuracy(uuid, jsonb) to service_role;
grant execute on function public.merge_words(text[], text[]) to service_role;
grant execute on function public.record_run(uuid, uuid, date, text, integer, integer, text, real, jsonb, text[], boolean, boolean, integer) to service_role;
grant execute on function public.adopt_guest(uuid, uuid, integer, integer, integer, integer, integer, date, jsonb, text[]) to service_role;

comment on table public.run_log is
  'One row per run (brief 05): every mode for Pro (never trimmed); a free account keeps its latest 5 counted runs. Voice-derived accuracy numbers, not audio. Sole writer: api/runlog.ts via record_run().';
