# SPEC C — Pro run history + daily accuracy trend

**Status:** ready after spec A (`flappytone-SPEC-tone-accuracy.md`) ships —
it needs A's tone accuracy numbers.
**Suggested model:** Sonnet is enough (patterns exist: `daily_runs`,
`api/run.ts`, Chart.js already lazy-loaded). Use Opus for a careful review of
the server function if wanted.

## 1. What

- **Run history:** free players keep what they have today — the last 5 runs,
  device-local. **Pro players see their all-time run history.** Each run:
  date, score, average tone accuracy, number of gates, end reason
  (`finished` / `out_of_hearts` / `quit`) — the same fields as today's
  `RunHistoryEntry`, plus per-tone and per-combo tone accuracy for the trend.
- **Daily trend:** Pro sees tone accuracy **per day**, per tone and per pair
  combo, replacing the random mock data in `Progress.tsx`'s "Accuracy
  progress" tab. Pair combos are included (A gives them a real accuracy).

## 2. Storage starts at Pro

Free runs are **not** stored server-side. When a player becomes Pro, the
server log starts from that moment (Pierre: "when they go pro, we start
saving their full history"). No backfill beyond the local last 5.

## 3. Data

```
run_log (
  id          bigint generated always as identity primary key,
  user_id     uuid references profiles(id) on delete cascade,
  played_at   timestamptz,      -- server time
  day         date,             -- player's local day, bounded like api/run.ts
  mode        text,
  score       int,
  gates       int,
  outcome     text check (outcome in ('finished','out_of_hearts','quit')),
  tone_acc    real,             -- run's average tone accuracy, null if no scored gate
  per_key     jsonb             -- { "t1": {gates, accSum}, "3+2": {...}, ... }
)
index on (user_id, played_at desc)
```

- The daily trend is computed from `run_log` (group by `day`, sum `accSum` ÷
  sum `gates` per key). A view or RPC is fine; no second table needed unless
  it gets slow.
- **No client write policy.** Writes through a server function — either
  extend `api/run.ts` (already called per run for accounts) or a new
  `api/runlog.ts`. It verifies the session, requires `has_access`, bounds
  values (score like `api/score.ts`, gates, accuracies 0..1), and takes time
  from the server.
- Read: RLS `select` where `auth.uid() = user_id`.
- Migration via Supabase MCP with explicit GRANTs; regenerate types; run
  `get_advisors`.

## 4. UI (`src/ui/Progress.tsx`)

- **Run history card:** Pro → paginated all-time list (same row design as
  today) with a total count; free/guest → today's last-5 + the existing Pro
  CTA. Pro with no server rows yet → local last 5 plus a note that full
  history starts now.
- **Accuracy progress tab:** Pro → real per-day chart from `run_log`; pills
  for T1–T4 plus the combos the player has data for (only played ones).
  Free/guest → keep the locked teaser with mock data, clearly labelled
  "example data" (already the case).
- Remove the "Soon" badge for Pro on these two cards.

## 5. Verification

- Server function tests: anonymous/non-Pro → 403, bounds, server time used.
- Trend maths unit test (per-day aggregation from `per_key`).
- `npm run dev:api` end-to-end with a Pro test account.
- Update CLAUDE.md (sole writers list, tiers bullet), PRD §7.2 / §8.
