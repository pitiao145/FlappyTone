# Design decisions

A log of *why*, for decisions whose reasoning would otherwise be lost. CLAUDE.md
states the rules that follow from these; this file is where you look when a
rule seems arbitrary and you want the incident or measurement behind it.
Newest first within each section. Don't add an entry for something that's
just "what the code does" — only for a decision that overturned an earlier
approach, or where the obvious-looking alternative was tried and failed.

## Backend, accounts & persistence

**v1's "no accounts / no gameplay backend / no persistence" was a shipping boundary, and it is now deliberately lifted (5 Sep 2026).** It was the right call for v1 — staying client-only let the game ship and validate fast, and kept the privacy story simple (no server ever sees a voice). It was never a permanent architectural law. Real traction changed the calculus: a leaderboard is inherently shared state that cannot live in one browser, cross-device progress is the honest payoff behind "sign up to save," and the EarlyBird monetisation needs a notion of a paying account. So accounts + a backend are now the decided direction, not a non-goal.

**Chosen stack: Supabase (auth + Postgres) + Cloudflare R2 for object storage.** The deciding factor was auth — Cloudflare has no managed consumer-auth product, so an all-Cloudflare path meant hand-rolling auth on D1; Supabase Auth (incl. anonymous sign-in) covers it first-party, and Postgres fits the tone-analytics roadmap better than D1's SQLite. R2 wins object storage on zero egress and is already the repo's clip-storage plan. Full rationale + the schema/security/scaling design live in `docs/flappytone-ARCH-supabase.md`; the scoped first build in `docs/flappytone-SPEC-supabase-phase1.md`.

**How it's introduced, so it doesn't become slop:** identity via Supabase anonymous sign-in (an anonymous user upgrades in place to a permanent account on email signup — no guest-row migration); personal gameplay stats stay **local-first** and sync up only on signup; the only server write for anonymous users is the leaderboard score, through a server-authoritative Vercel function holding the service-role key (clients never write it). RLS on every table, written performance-correct from line one. Every schema change is a numbered migration. Region Tokyo (permanent). **Not yet shipped — the code is still client-only until each piece lands.** When a piece lands, update CLAUDE.md and PRD.md to match what is actually in the code, not what is planned.

### Phase 1 shipped, and where it departs from its own spec (5 Sep 2026)

Ring 1 landed: `profiles` + `leaderboard_scores`, `api/score.ts`, anonymous
auth, a dev-only magic-link login. Four decisions overruled
`flappytone-SPEC-supabase-phase1.md` while building it, each for a reason worth
keeping:

- **Anonymous sign-in is lazy, not at app load.** The spec called for
  `signInAnonymously()` on boot. But nothing in Phase 1 needs an identity until
  a player joins the board, and signing in at load mints an `auth.users` row for
  every drive-by visitor — most of whom, at a ~6% return rate, never play twice.
  Sign-in now happens inside `joinBoard()`. Concurrent callers share one
  in-flight promise, or two components mounting at once would race and create
  two users.
- **The board is open to everyone, not a free/Pro split.** The spec gave free
  players the top 3 and locked the top 50 behind Pro. A board nobody can see
  cannot make anyone competitive, and this is the first week it has any data at
  all. Gating can come back once there is something worth gating.
- **Display names are generated, never typed.** The spec captured a name in the
  join modal. Choosing a name is now a Pro feature, so the modal shows a
  generated `BraveSparrow42` read-only. This also preserved an existing
  guarantee for free: `src/analytics/session.ts` promises it never sends
  anything the player typed, and there is now still no text input in the game.
- **`runHistory.ts` was left alone.** The spec asked to rename its per-tone
  fields to match the DB columns now, so the Phase 2 sync becomes a plain copy.
  The local shape is `{gates, accSum, unheard}` and the DB's is
  `{attempts, hits, sum_accuracy, best_accuracy}` — not a rename but a real
  mapping, since `hits` and `best_accuracy` aren't tracked locally at all.
  Renaming the persisted shape means bumping `toneflap.history.v1`, which wipes
  every existing player's history and best score to save writing a small
  function in Phase 2. Not worth it.

Three things the build discovered rather than decided, all now folded into
`0001` rather than left as a trail of corrections:

- **A raw-SQL migration must `GRANT` explicitly.** The dashboard's table editor
  does it invisibly; a migration does not. RLS policies narrow access, they do
  not grant it, so correct-looking policies still yield "permission denied for
  table" without the grants.
- **`leaderboard_scores.user_id` points at `profiles`, not `auth.users`.** With
  both tables referencing only `auth.users`, PostgREST saw no relationship
  between them and could not resolve "top scores with each player's name" in
  one query. The constraint also states the invariant the product relies on:
  joining the board is what creates the profile, so a score without one is a
  bug, and now fails in the database rather than rendering as a nameless row.
- **There is no `prof_update` policy.** One was written, and the security
  advisor immediately flagged it for letting an anonymous user edit their
  profile. It wasn't exploitable — it checked `auth.uid() = id` — but it was
  unused, since names can't be edited in Phase 1, and an unused write path is
  only surface. Phase 2 adds it back for permanent accounts, gated on
  `is_anonymous`.

**On squashing:** the three fixes above first landed as migrations 0002 and
0003, then were squashed back into a single `0001` and the remote schema
rebuilt from it. That is only defensible because nothing had shipped, no other
environment had the schema, and both tables held zero rows. Once this is
deployed the ledger is append-only: you fix a migration with another migration,
because someone else's database has already run the old one.

### Phase 2: accounts as the Pro tier, built ahead of the product (6 Sep 2026)

Accounts are **not a free-tier feature**. Signing up is what Pro *is*, so the
plumbing landed first and the features it unlocks come with the paid tier. All
of it — `tone_stats`, the profile aggregates, the sync, the account card — is
dev-gated and unreachable by a player.

That framing resolved a contradiction that had been sitting in the plan:
renaming was marked Pro while accounts were going to be free, which would have
shipped an account that could not do the one thing an account is for. With
accounts *being* Pro, `prof_update` returns, gated on the `is_anonymous` claim
— set by Supabase Auth, unwritable by a client, so it is safe to authorise on.

**Lifetime per-tone stats did not exist, and the docs assumed they did.** The
sync plan said "upload the player's per-tone aggregates at signup", but
`runHistory.ts` only ever kept per-tone data inside `lastRuns`, capped at five.
Uploading that would have made every new account's tone history five runs deep
forever. So `lifetimePerTone` now accumulates locally, added *additively* — the
`toneflap.history.v1` key is unchanged, a store saved before the field seeds it
from `lastRuns`, and nobody's `bestScore` is wiped to gain a field that can be
approximated. `scoring.ts` gained a per-tone `best` alongside it, following the
same unheard-exclusion rule `accSum` already used.

**`tone_stats` has no `hits` column**, though ARCH sketched one. Nothing in the
scoring code defines what a "hit" is, and inventing a metric to fill a column
is how a number nobody trusts gets onto a chart. It stores `unheard` instead —
a real measurement, and a meaningful one given the rule that an unclear signal
is never scored as wrong.

**Sync is merge-by-max, in both directions, and it is the same operation on
signup as on a second device.** These aggregates are monotonic records of
things the player did — a count of runs, a best score, a longest streak — so
taking the larger of each cannot lose an achievement, needs no clocks to agree
and needs no conflict UI. It over-counts only if one run is recorded on both
sides, which is far cheaper than deleting a week of practice. Because signup
and second-device sign-in are the same merge, there is no separate "claim your
guest data" path to get wrong. The server is written first and local updated
only on success, so a half-done sync leaves the device still holding
everything. `lastRuns` and `lastPlayedDate` stay local: one is a display cache
of *this* device, the other decides whether today continues the streak, and
neither has an honest cross-device answer.

## Clip pipeline

**Clips are the whole take, not the voiced window (9 Aug 2026).** Cutting on
voicing dropped a median of 360ms of audible material, worst on Tone 3 where
creak reads as unvoiced — `yuan3` shipped as 453ms of a 1495ms recording.
`make-clips` now copies the recording verbatim (15ms fade at each end only).
The corridor is still measured over the voiced window alone — only the
*audio* moved, not the shape. See `src/dev/clipCut.ts`.

**Three clocks on one cue, and they must not be folded together:**

| manifest field | `run.ts` field | what it is |
|---|---|---|
| `clipS` | `durationMs` | the whole file — how long the world freezes and the mic stays shut |
| `onsetS` | `sweepDelayMs` | file start → tone start; the dot holds through it |
| `durationS` | `sweepMs` | the tone window; the gate and the corridor |

`clipS` is not `onsetS + durationS` — there's 106–832ms of audio after the
tone window ends. Reading the cue's length off the tone window let a cue play
into a live mic; `onsetS` is bounded by `clipS`, never by `durationS`, since
seven words have more lead-in than tone.

**Tone 3 corridors are measured, not synthetic (16 Aug 2026).** 22 of 30 raw
T3 takes used to measure as a falling third that never rises — not because
her speech lacked the rise, but because `clipCut.ts`'s voicing rescue and
run-merge gap were both too narrow for T3's creaky trough, discarding the
rise before it was ever measured. Fixing that let all 30 T3 words measure a
real dip-and-rise; `shapeForWord` no longer special-cases tone 3.

**Word ids are a registry, not a recomputation.** `src/record/wordlist.ts` is
merged into by the importer — an id, once minted, never moves, even if the
word is dropped from the list. With 是/事/市 all `shì`, recomputing ids from
list order turned `shi4b` from 事 into 试 the moment a word was inserted.
`id` is the blob key, the clip filename, and the manifest key — moving it
relabels audio that's already recorded.

## Gate duration vs. clip length — known, unresolved

`GATE_DURATION_S`/`tuning().gateDurationS` started as each clip's own length
(`durationS` from the manifest), so demo, corridor, and scorer ran on one
clock. **T1 and T3 no longer match their clips** — T1 is tuned to 0.55s
against an 880ms `ma1.wav`; T3 to 1.25s against a 1.33s clip. This was a
deliberate tuning move (T1 was the worst-scoring tone in play, because it
asked for a note longer than the flat part of one) but it breaks the
"demo length == gate length" invariant the clip pipeline was built to hold:
the demo now visibly holds longer than the gate scores, for those two tones.
Not fixed — see `tuning.ts`'s `gateDurationS` doc comment. Retune from the
Lab if this gets revisited; don't just restore the clip length without
re-checking T1's scores.

## Tone-mismatch collision / classifier boost (25–29 Aug 2026)

`src/game/toneClassifier.ts` is a standalone correlation-based tone
recognizer, originally built for the Visualiser tab. It's now also wired
into scoring two ways (`src/game/scoring.ts`):

- **`isDrasticToneMismatch`** — a confident classifier read of a drastically
  wrong tone (T1/T4 confused with anything, or a confident T2↔T3 mixup)
  forces a wall-style collision. Enabled off a played-back Lab session where
  it reliably caught correct-shape T2/T3 attempts flying into the wrong
  gate. Known, accepted gaps: a shape with correct timing shifted ~80ms late
  can still read as a confident wrong tone; a brief off-corridor wobble too
  short to be a real wall hit can read as a confident mismatch on its own.
  A softer sibling that *capped* (rather than collided) any mismatch existed
  earlier and was removed (26 Aug 2026) — it fired on far more borderline
  cases and was never separately validated in play.
- **`applyClassifierBoost`** — the mirror case: a confident (≥0.9) read of
  the *correct* tone can raise a gate's accuracy, since corridor tracking
  punishes timing/precision the classifier doesn't care about. Ships on by
  default — a false positive here only over-rewards, it doesn't cost a
  heart, unlike the mismatch-collision side.

## Calibration flow rewrites

Calibration has been redesigned twice; both changes are recorded in
`src/pitch/calibration.ts`'s own doc comments (`REACH_TO_TONE_SPACE_UP`/
`_DOWN`, `RANGE_UP_SEMITONES_MIN`) rather than here, because the code *is*
the current spec and a second prose copy would drift from it. Summary: the
original three-`mā` and later quiet/talk/high/low-sweep flows are both gone.
Since 29 Aug 2026, the board's upward half is anchored off an actual Tone 1
the player flies in the calibration tutorial, and the downward half off an
actual Tone 3 floor — not off a deliberate reach — so `reachToToneSpaceUp/Down`
are both 1 (no claw-back). Read `calibration.ts` directly before touching any
of this; the file explains its own history better than a summary would.

## Analytics: Blob → PostHog (Aug 2026)

Gameplay and traffic analytics used to flow through a Vercel Blob-backed
pipeline: one JSON file per session, pulled with `pull-analytics` and
summarized with `report-runs`. That hit Blob's Hobby-plan "advanced
operations" cap as player volume grew, because every flush was a `put()`.
Both scripts are gone; read funnel/per-tone/quit-histogram numbers as live
PostHog Insights instead.

**Accepted reliability gap:** PostHog's JS SDK doesn't persist a queue across
a tab close, force-quit, or offline period, unlike the old Blob pipeline's
localStorage-backed retry-on-load. Mitigated with a short batch window
(`request_queue_config.flush_interval_ms`, 250ms) plus `send_instantly` on
`run_end`, which shrinks the loss window to "the last event or two before a
crash." This is a deliberate trade for not maintaining that machinery, not
an oversight — don't rebuild the old durability queue on top of PostHog.

**PostHog project is shared across several of Pierre's apps**, not
FlappyTone-specific (project id 426310, "Default project"). Its
`anonymize_ips` setting is left as the other apps had it, not changed for
FlappyTone specifically — check the current value with `project-get` before
assuming either way, and raise any change with Pierre first since it's
project-wide.

## Landing/game split (Aug 2026)

The single-page app was split into three Vite entries (`/`, `/app`,
`/record`) so the marketing page stops shipping the game engine to visitors
who are just reading the pitch. `index.html` still carries a redirect for
home-screen installs saved before the split (`/` or `/?app=1`) — its own
comment says it's safe to delete once those installs have aged out; not yet.

## `?intent=visualiser` ignored first-time arrivals (fixed 2 Sep 2026)

A share link to the visualiser (`?intent=visualiser`, see CLAUDE.md's landing
split rule 2) silently dropped an uncalibrated visitor onto the Play home
screen instead: `GameApp.tsx`'s initial `screen` state only honoured the
intent when `settings` already existed (`initialIntent() === "visualiser" &&
settings`), reasoning that `<Visualiser>` can't render without a calibrated
grid. True, but the fix should have been "route to calibration first," not
"ignore the intent" — a share link's whole premise is a session that has
never opened the app before.

Compounding it: `pendingRef`, the ref meant to remember "go back to X once
calibration finishes," was write-only. `openVisualiser()` set it to
`"visualiser"` before sending an uncalibrated player into `calibrate`, but
nothing ever read it back — `onCalibrated` unconditionally routed into the
range-measuring tutorial flight, which unconditionally routed into the
guided teaching tutorial, which unconditionally landed on Play. So even the
*manual* path (tap Visualiser in the nav while uncalibrated → mic prompt →
calibrate → tutorial) never actually reached the Visualiser; the player had
to finish the whole onboarding funnel and tap Visualiser again themselves.

Fixed by: honouring the intent in `screen`'s initial state regardless of
`settings` (the tap-gate render branch already knew how to route an
uncalibrated arrival through `openVisualiser` → `calibrate`, it just never
got the chance); preserving `pendingRef` across `onCalibrated` specifically
for `"visualiser"` (every other intent still drops it, unchanged); and
reading it once the range-measuring flight ends (`onRunOver`'s calibratingRef
branch). `goHome()` now clears `pendingRef` on every path back to Play
(cancel, quit, mic error) so a stale `"visualiser"` can never leak into an
unrelated later onboarding and misroute it.

**Skips the guided teaching tutorial for this path (2 Sep 2026, same day,
follow-up).** The first fix above still routed a visualiser-bound player
through the full onboarding funnel — measuring flight *and* the guided
teaching tutorial ("fixed short sequence... text cue per gate", PRD §8) —
before landing them on the Visualiser, on the reasoning that "finish
calibration" meant finishing that whole funnel. It doesn't: the teaching
tutorial exists to teach the scored game, which a Visualiser-bound player
never asked for. `TutorialDone` gained a third variant,
`"calibrationVisualiser"` — same "Your grid is ready" moment as the ordinary
`"calibration"` variant, different body/button copy, and its `onDone`
(`finishCalibrationForVisualiser`) goes straight to `openVisualiser()`
instead of `startTutorialFromCalibration()`. `onRunOver` picks the variant by
checking `pendingRef.current === "visualiser"` right when the measuring
flight ends, before the guided tutorial would otherwise start. The
pre-calibration tap gate also grew a conditional line — "Before you can use
the visualiser, we need to personalize the grid to your voice." — shown only
when `!settings`, so a returning calibrated player still sees the plain "Tap
to start" and isn't told they need to do something they already did.

## Gate width / difficulty ramp simplification (16 Aug 2026)

`scrollSpeed` used to climb with the difficulty ramp. Fixed it instead,
because gate width in px is `scrollSpeed * shape.durationS` — that only
renders a word's own recorded timing accurately if `scrollSpeed` holds
still. Difficulty still climbs via tolerance tightening and rest-interval
shrinking. The player-selectable pace setting (relaxed/normal/fast) was
removed entirely in the same pass — once scrollSpeed stopped varying, pace's
only remaining effect was stretching the rest interval, not enough to
justify a menu control. `baseRestMs`/`restMsFloor` in `tuning.ts` were
doubled at removal to absorb the old "relaxed" default's ×2.0 multiplier.
