-- 0026_player_tone_shapes — a Pro player's own average tone shape, per tone
-- and per pair combo, in daily buckets (spec B,
-- docs/SPECS/flappytone-SPEC-player-tone-average.md).
--
-- Each row holds the element-wise SUM of every heard attempt's line on that
-- day, resampled to the 61-point grid averagePolyline uses, plus the count.
-- An average up to a day D, or over a period, is Σ sum ÷ Σ count over the
-- rows in range — so any period can be answered without one row per attempt.
--
-- Keys use the same format as tone_accuracy_stats (0025): "1".."4" or a
-- toneComboKey "3-2", so the two tables join on (user_id, key = target).
-- Neutral combos are never stored.
--
-- Writes are server-only. Sums must ADD across runs (merge-by-max cannot
-- work for a sum), and the value must be bounded and gated on Pro — none of
-- which a client may decide. api/shapes.ts is the sole writer, through
-- add_tone_shapes() below; the table has no client write policy at all.

create table public.player_tone_shapes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  key        text not null check (key ~ '^[1-4](-[1-4])?$'),
  day        date not null,
  sum        double precision[] not null check (array_length(sum, 1) = 61),
  count      integer not null check (count > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, key, day)
);

alter table public.player_tone_shapes enable row level security;

-- Owner-only read, permanent accounts only (same guard as 0025). user_id
-- leads the primary key, so the policy column is already indexed.
create policy tone_shapes_read on public.player_tone_shapes
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

-- Supabase's default privileges hand ALL on a new public table to anon and
-- authenticated (0023). Revoke, then grant back only the read.
revoke all on public.player_tone_shapes from anon, authenticated;
grant select on public.player_tone_shapes to authenticated;
grant all on public.player_tone_shapes to service_role;

-- The additive upsert. PostgREST's upsert can only replace a column, not add
-- two arrays element-wise, so the add lives here, in one statement.
-- `rows` is a jsonb array of {key, sum: number[61], count}; api/shapes.ts has
-- already validated every entry. Service role only: EXECUTE is revoked from
-- PUBLIC (not just anon/authenticated — 0009's lesson: those roles reach a
-- new function through PUBLIC's default grant).
create function public.add_tone_shapes(p_user_id uuid, p_day date, p_rows jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.player_tone_shapes as t (user_id, key, day, sum, count)
  select
    p_user_id,
    r ->> 'key',
    p_day,
    array(select (v)::double precision from jsonb_array_elements_text(r -> 'sum') with ordinality as e(v, i) order by i),
    (r ->> 'count')::integer
  from jsonb_array_elements(p_rows) as r
  on conflict (user_id, key, day) do update
    set sum = array(
          select a + b
          from unnest(t.sum, excluded.sum) as u(a, b)
        ),
        count = t.count + excluded.count,
        updated_at = now();
$$;

revoke all on function public.add_tone_shapes(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.add_tone_shapes(uuid, date, jsonb) to service_role;

comment on table public.player_tone_shapes is
  'Pro only (spec B): per-day element-wise sum of a player''s resampled 61-point tone lines, per tone ("1".."4") or combo ("3-2"). Voice-derived, not audio. Sole writer: api/shapes.ts via add_tone_shapes().';
