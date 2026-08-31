# Design decisions

A log of *why*, for decisions whose reasoning would otherwise be lost. CLAUDE.md
states the rules that follow from these; this file is where you look when a
rule seems arbitrary and you want the incident or measurement behind it.
Newest first within each section. Don't add an entry for something that's
just "what the code does" — only for a decision that overturned an earlier
approach, or where the obvious-looking alternative was tried and failed.

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
