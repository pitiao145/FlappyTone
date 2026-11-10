# Report: 42 Listener: less delay, a wider voice band, settings in milliseconds
- Result: **blocked** at step 2 (delay). Step 1 is done and committed. Steps 3 and 4 not started.

## Step 1 — settings in ms: done
- Changed (commit "wip(pitch): brief 42 step 1, time settings in ms"):
  - `src/pitch/types.ts`, `src/pitch/PitchTracker.ts`: new `hopSize` (1024). Frame-count fields replaced by time fields: `maxSlewSemitonesPerSec` 140.625 (was `maxSlewSemitones` 3.0/hop), `rescueMaxMs` 64 (was 3 frames), `staleUnvoicedMs` 107 (was 5), `minVoicedRunMs` 0 (was `minVoicedRun` 1). `derivedFrames()` turns them into frames from `hopSize / sampleRate`.
  - `src/game/tuning.ts`: `minVoicedRun: 3` → `minVoicedRunMs: 64`. Callers updated: `Game.tsx`, `Visualiser.tsx`, `Calibration.tsx`, `landing/miniGame.ts`, `site/checker/engine.ts`.
  - `src/dev/clipCut.ts` TONE_3_RESCUE `rescueMaxFrames: 8` → `rescueMaxMs: 171`. `src/dev/report.ts` `--set slew=` is now st/s. Bench scripts (`src/dev/bench39/*.mjs`) use the ms names.
  - New test `src/pitch/msSettings.test.ts` (48 kHz = old values exactly; 44.1 kHz: slew 3.27 st/hop, rescue 3, stale 5, minVoicedRun 3, T3 rescue 7 frames).
- MEASURED: `npm run bench` → 209 numbers, 0 FAIL, **no number moved** (value = baseline on every line). `npm run report` summary identical before/after (fit 0.97, lag 0, wiggle 0.063, voiced 97%). `npm run test` 1827 passed. `npm run typecheck` clean. `npm run classifier-check`: wall hits 0. Build + dev-tool grep: nothing found.
- Still per hop (not in this brief's list, and "no change to the rescue rule"): `rescueMaxSemitones` (3 st per elapsed hop). READ IN CODE `src/pitch/math.ts:144`.

## Step 2 — delay: blocked
Each option was a temporary change to `DEFAULT_CONFIG`, then `npm run bench` (Praat reference). The trial code is reverted.

| Option | Delay (all groups) | Bench result | Numbers outside tolerance |
|---|---|---|---|
| baseline: median 5 | 40 ms | 0 FAIL | — |
| (a) median 3 | **20 ms** | 6 FAIL | see below |
| (b) median 3 + octave check | — | not run | READ IN CODE: `correctOctave` already runs before the median on every frame (`PitchTracker.ts`), so (b) is the same code as (a). |
| (c) median 5, newest value if within 1 st | 0 ms (T1–T3, pairs), **40 ms (T4)** | 34 FAIL | delay-removed error p90 0.23–0.42 → 0.84–2.11 st; T4 median 0.10 → 0.21 |

Option (a), MEASURED (`npm run bench`):
- Passes every check this brief names: delay 40 → 20 ms in every group, both styles. Error with delay removed better everywhere (example: natural T4 median 0.11 → 0.08, p90 0.44 → 0.28; textbook T1 p90 0.22 → 0.09). Error as drawn about halved (natural T4 p90 2.58 → 1.33). Voice heard and "voice where Praat is silent": unchanged (not on the moved list). Low end lost better (natural T4 median 0.50 → 0.09, p90 2.09 → 0.73). Deep 0.5 natural T4 3.28 → 2.63 (step 3 is meant to fix the rest).
- But 6 scorecard numbers this brief does not name move past their tolerance:
  - `live.highEndLost.p90`: textbook T1 0.26 → 0.33, textbook T4 0.29 → 0.38, textbook pairs 0.44 → 0.47, natural T4 0.45 → 0.48 (st).
  - `deep0.5.lowEndLost.med.natural.T2` 0.48 → 0.54 st.
  - `reader.singlesRight.pct.voice2stLower.textbook` 92.3 → 90.1% (natural with the same shift: 55.0 → 59.2, better; calibrated: textbook 97.8 → 98.9, natural 89.1 → 91.0, better).
- The plan's rule says a brief may only change baseline numbers its acceptance section names. So (a) does not pass, and the brief says to stop at the first option that passes. None does. Not improvised further.

## Why blocked, in plain words
A 3-frame median makes the line half as late (20 ms) and closer to Praat. The cost: the very top of some tones is drawn slightly lower in the worst 10% of clips (≤ 0.09 semitone), and the reader gets 2 of about 90 textbook words wrong when the voice is shifted 2 semitones lower. Whether that trade is OK is Pierre's call.

## Needs Pierre's eyes
Decide one:
1. Accept (a) median 3: allow the 6 numbers above to move (they would be rewritten in the baseline by brief 42), then rerun 42 from step 2 (a) and go on to step 3.
2. Keep median 5 (delay stays 40 ms, acceptance "≤ 25 ms" dropped) and go to step 3.
3. Something else (a new filter is outside this brief).

## Checks run (state committed)
`npm run bench` 0 FAIL; `npm run test` 1827 passed; `npm run typecheck` clean; `npm run report` same before/after; `npm run classifier-check` wall hits 0; build + grep clean.

## Snapshots moved
None (step 1 moves no number). Step 2 trial outputs: not kept in the repo.

## Follow-ups
- Steps 3 (band, `fMin` 55, window, CPU) and 4 (`fMax` count) wait on the decision.
- Brief 41 is done; the Pierre low-end check belongs to step 3.
- Strong-model review still needed before 42 is done.
