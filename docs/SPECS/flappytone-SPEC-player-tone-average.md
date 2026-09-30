# SPEC B — Player tone average (Pro)

**Status:** ready after spec A (`flappytone-SPEC-tone-accuracy.md`) ships.
**Suggested model:** Opus — new table, RLS/grants, and a server function that
must add correctly.

## 1. What

A Pro player sees **their own average shape per tone and per pair combo**,
drawn over Jane's average (the existing landing/Progress tone charts), and
can compare **their average at two points in time** ("two months ago vs
now"). This is the "See how your tones evolve over time" card on Progress,
which today is a Pro teaser.

## 2. Nothing exists yet

Today no player polyline is stored anywhere: gate frames live in memory only
during a gate, the visualiser keeps only counts, run history keeps per-tone
numbers, and PostHog must never get per-frame pitch (analytics rule 1).
**A Pro player starts from zero** when they upgrade — no backfill.

## 3. Data

Reuse spec A's alignment step: every heard gate already produces the
player's utterance resampled to N points. Resample that to the same 61-point
grid `averagePolyline` uses (`src/game/toneAverage.ts`) so the player's line
and Jane's are drawn by the same chart code.

**Daily buckets, not one row per attempt:**

```
player_tone_shapes (
  user_id   uuid  references profiles(id),
  key       text,          -- 't1'..'t4' or a combo key like '3+2'
  day       date,          -- player's local day, bounded like api/run.ts
  sum       real[61],      -- element-wise sum of resampled lines
  count     int,
  primary key (user_id, key, day)
)
```

- Average up to date D = Σ sum ÷ Σ count over days ≤ D.
- Average in a period (e.g. September vs October) = same over that range.
- Small: one row per key per day played.

**Which attempts:** all heard gates, all modes. The visualiser was included at first (Pierre:
"see if this pollutes the averages") and was removed 30 Sep 2026. Wall hits and mismatches count too.
Neutral-tone combos: excluded (same as spec A). Unheard gates: excluded.

## 4. Pro only — nothing computed or stored otherwise

- Capture only when `getTier() === "pro"` (synchronous tier store, same seam
  the run pool uses). Guest and free: no computation, no storage.
- The table has **no client write policy**. Writes go through a new server
  function (e.g. `api/shapes.ts`, service-role key) that:
  - verifies the session, rejects anonymous, checks `entitlements.has_access`;
  - **adds** the run's per-key sums/counts into the day's row
    (`insert … on conflict do update set sum = sum + excluded.sum,
    count = count + excluded.count`) — merge-by-max does not work for sums;
  - bounds `day` to ±1 day of server UTC, like `api/run.ts`;
  - validates array length (61) and value range (chao 0.5..5.5).
- Client: one POST per finished run (fire-and-forget, never throws, a failure
  loses that run's shape data only). (The visualiser no longer captures shapes — removed 30 Sep 2026.)
- Read: RLS `select` where `auth.uid() = user_id`.
- Migration via Supabase MCP `apply_migration` with explicit GRANTs,
  regenerate `database.types.ts`, run `get_advisors`. Test file naming in
  `api/` must be `_*.test.ts`.

## 5. UI (Progress → "See how your tones evolve over time")

- Pro: per tone (and per combo the player has data for), Jane's average and
  the player's average on one chart. A control to pick a comparison point
  ("1 month ago", "2 months ago", or a date) → draw the earlier average as a
  third, fainter line.
- Show the count behind each line ("based on 142 attempts"). Hide a line with
  fewer than ~5 attempts.
- Free/guest: keep the existing Pro teaser. Pro with no data yet: an empty
  state ("Play a few runs to see your own shape").

## 6. Privacy

This is voice-derived data on our server. Update the privacy text
(`src/ui/LegalPage.tsx`) in this slice: what is stored (a per-day average of
your pitch shape per tone, not audio), that it is Pro-only, and how to delete
it. Deleting the account must delete these rows (FK `on delete cascade`).

## 7. Verification

- Unit tests for the accumulation (client-side sum building) and the average
  maths (up-to-date, in-period).
- `api/shapes.ts` tests: anonymous → 403, non-Pro → 403, add is additive on
  repeat, day bounds, bad array → 400.
- `npm run dev:api` end-to-end with a Pro test account; check the rows.
- Update CLAUDE.md (a fourth sole-writer function in `api/`) and PRD.
