# B4 — outcome feedback (visual only)

**Date:** 5 Aug 2026
**Spec:** `docs/flappytone-SPEC-unheard-fix-and-gamification.md` §B4
**Status:** implemented

## Why

The 5 Aug playtest resolved 10 gates, three of them collisions, with no
detectable reaction on screen. `drawOutcomeFlash` capped at 0.5 alpha on a
radial gradient over 800ms and was invisible in every extracted frame — a
heart could be lost with nothing happening visually.

**No sound.** B4 as written called for audio; Pierre ruled it out. That also
removes the constraint that shaped the original audio plan (sfx below 400 Hz
would be tracked as pitch by the detector, and `isCueAudible()` deafens the
mic while a clip plays). Feedback is visual only.

## Register

Punchy but coherent: keep the existing palette and typography, add real motion.
Not full arcade — the trail has to stay readable, because the trail is the
product.

## Prerequisite: the trail was not in the world's frame

`drawTrail` positioned samples with `pxPerMs = (width * 0.45) / (trailSeconds
* 1000)` — 126 px/s at 420px wide, against a world scrolling at 220 px/s, and
diverging further as the difficulty ramp raised scroll speed but not the trail.

Two consequences: the flown path could not be drawn along the corridor it was
flown through (which B4 requires), and independently the PRD §8 comparison of
your trace against the dashed ideal was horizontally distorted. Vertical
position was honest; horizontal timing was not.

**Fix:** trail points store `worldX` and the snapshot projects them to screen
via the same `screenX()` the gates use. Correct through speed ramps and cue
pauses alike. `TRAIL_SECONDS` drops 1.5 → 1.0 so on-screen length stays close
to what it was (220px vs 189px at base speed).

## Data flow

`LastOutcome` widens from `{outcome, tone, atMs}` to add `accuracy`, `points`,
`comboMult`, `path` and `hint`. `run.ts` remains the only writer; `world.ts`
remains a pure function of the snapshot.

`path` is snapshotted at resolve rather than sliced from the live trail on
demand: the trail prunes at `TRAIL_SECONDS` (1.0s) and a T3 gate runs 1.33s, so
the start of the contour being celebrated would already be gone.

## The four reactions

| Outcome | Reaction |
|---|---|
| perfect / good / ok | The flown path ignites along the corridor — three passes (bloom, ribbon, hot core) over the player's own captured contour, fast attack and slow decay. Heat by rating: perfect 1.0, good 0.72, ok 0.4. |
| collision | 120ms decaying shake on both axes, red vignette from the edges over 420ms, dot knocked back and eased home. Heart cracks in the HUD. |
| unheard | One soft neutral-grey ring leaving the dot over 900ms. No flash, no shake, no red. |

The ignition is the hero because PRD §8 says the trail "is the whole product":
the reward for a good gate is the player's own contour, not a generic burst.
Nothing is idealised or snapped — these are the same samples the live trail drew.

**Combo escalates it.** Burn time extends by up to 200ms and intensity by up to
1.5× from ×1 to ×3, so a clip builds rather than repeats. ×1 already reads
clearly; combo is headroom above it, not the condition for legibility.

**No hitstop**, despite it being the most effective impact trick available.
Freezing the world mid-gate desynchronises the corridor from the voice or
discards samples the player is still producing — the class of bug Part A fixed.

## The unheard hint

`unheardHint()` is a pure function over the gate's samples:

- no voiced frame at all → `louder`
- a real but short run (≥60ms, under `MIN_UTTERANCE_MS`) → `longer`
- anything else → `generic`

It reasons from voicing alone, since `GateSample` carries no RMS; "louder" is
inferred from the *absence* of voicing rather than measured quietness. That is
the honest reading, and the thresholds are conservative because a wrong hint is
worse than a generic one.

Text lives in the HUD, not the canvas — `world.ts` draws geometry only.

## HUD integration

Score, hearts and combo poll at `HUD_HZ` (4), which would land a reaction up to
250ms after the thing it reacts to. Outcomes are instead pushed from the rAF
loop once per resolved gate, and the same event syncs `setHud` so the score and
the broken heart land on the beat. One `setState` per gate is an event, not a
per-frame render, so the "game loop outside React" rule holds.

`prefers-reduced-motion` disables the shake and the recoil in canvas, and
collapses the CSS animations.

## Testing

Canvas output cannot be verified by eye here, so `world.test.ts` asserts
**differentially**: each frame is drawn with and without the outcome, and the
delta in draw calls is the assertion. Counting raw calls proves nothing — gate
rims and the dot's halo already emit strokes, arcs and gradients, and the first
version of these tests passed with the ignition deleted. Each effect was
mutation-checked to confirm the test fails when the effect is removed.

Also covered: no NaN reaches the canvas (a NaN silently draws nothing, which is
how the old flash stayed invisible), `unheardHint` selection, the outcome
payload, path bounds, path survival past trail pruning, and that the trail
recedes at exactly `scrollSpeed`.

`npm run report` is unchanged — fit 1.12, lag 1ms, wiggle 0.072, voiced% 92,
before and after. `src/pitch/` was not touched.

**Not verified:** whether any of it looks good. That needs a device.
