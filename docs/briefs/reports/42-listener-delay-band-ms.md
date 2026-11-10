# Report: 42 Listener: less delay, a wider voice band, settings in milliseconds
- Result: **blocked** at step 3 (band), second run. Steps 1 and 2 done and committed. Step 4 measured. First run blocked at step 2; Pierre chose median 3 (see "Second run").

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


---

# Second run (after Pierre's decision: median 3) — 10 Nov 2026

## Step 2 — median 3: done
- Changed (commit "feat(pitch): brief 42 step 2, median of 3"): new config field `medianFrames` (3). Kept in **frames**, not ms: the median removes a lone wrong frame, whatever the hop. READ IN CODE `src/pitch/PitchTracker.ts`, `types.ts`.
- MEASURED `npm run bench`: same numbers as the option (a) trial. Delay 40 → 20 ms in every group.
- Pierre's 6 allowed numbers (before → after): `live.highEndLost.p90.textbook.T1` 0.26 → 0.33; `.textbook.T4` 0.29 → 0.38; `.textbook.pairs` 0.44 → 0.47; `.natural.T4` 0.45 → 0.48; `deep0.5.lowEndLost.med.natural.T2` 0.48 → 0.54; `reader.singlesRight.pct.voice2stLower.textbook` 92.3 → 90.1.
- Also rewritten (numbers this brief was meant to move, all better): every `live.delay.ms.*` (40 → 20) and every `*.err.delayRemoved.*`. Full list of 56 changes:
  - live.highEndLost.p90.textbook.T1: 0.26 → 0.33
  - live.highEndLost.p90.textbook.T4: 0.291 → 0.38
  - live.highEndLost.p90.textbook.pairs: 0.439 → 0.47
  - live.highEndLost.p90.natural.T4: 0.447 → 0.48
  - deep0.5.lowEndLost.med.natural.T2: 0.479 → 0.54
  - reader.singlesRight.pct.voice2stLower.textbook: 92.31 → 90.1
  - live.err.delayRemoved.med.textbook.T1: 0.023 → 0.01
  - live.err.delayRemoved.p90.textbook.T1: 0.217 → 0.09
  - live.delay.ms.textbook.T1: 40 → 20.0
  - pipe.err.delayRemoved.med.textbook.T1: 0.021 → 0.01
  - pipe.err.delayRemoved.p90.textbook.T1: 0.228 → 0.1
  - live.err.delayRemoved.med.textbook.T2: 0.047 → 0.04
  - live.err.delayRemoved.p90.textbook.T2: 0.226 → 0.15
  - live.delay.ms.textbook.T2: 40 → 20.0
  - pipe.err.delayRemoved.med.textbook.T2: 0.047 → 0.04
  - pipe.err.delayRemoved.p90.textbook.T2: 0.231 → 0.17
  - live.err.delayRemoved.med.textbook.T3: 0.069 → 0.05
  - live.err.delayRemoved.p90.textbook.T3: 0.315 → 0.19
  - live.delay.ms.textbook.T3: 40 → 20.0
  - pipe.err.delayRemoved.med.textbook.T3: 0.069 → 0.06
  - pipe.err.delayRemoved.p90.textbook.T3: 0.32 → 0.22
  - live.err.delayRemoved.med.textbook.T4: 0.099 → 0.07
  - live.err.delayRemoved.p90.textbook.T4: 0.381 → 0.25
  - live.delay.ms.textbook.T4: 40 → 20.0
  - pipe.err.delayRemoved.med.textbook.T4: 0.099 → 0.07
  - pipe.err.delayRemoved.p90.textbook.T4: 0.374 → 0.28
  - live.err.delayRemoved.med.textbook.pairs: 0.055 → 0.04
  - live.err.delayRemoved.p90.textbook.pairs: 0.31 → 0.2
  - live.delay.ms.textbook.pairs: 40 → 20.0
  - pipe.err.delayRemoved.med.textbook.pairs: 0.055 → 0.04
  - pipe.err.delayRemoved.p90.textbook.pairs: 0.315 → 0.21
  - live.err.delayRemoved.med.natural.T1: 0.021 → 0.01
  - live.err.delayRemoved.p90.natural.T1: 0.124 → 0.06
  - live.delay.ms.natural.T1: 40 → 20.0
  - pipe.err.delayRemoved.med.natural.T1: 0.019 → 0.01
  - pipe.err.delayRemoved.p90.natural.T1: 0.114 → 0.06
  - live.err.delayRemoved.med.natural.T2: 0.049 → 0.04
  - live.err.delayRemoved.p90.natural.T2: 0.212 → 0.14
  - live.delay.ms.natural.T2: 40 → 20.0
  - pipe.err.delayRemoved.med.natural.T2: 0.049 → 0.04
  - pipe.err.delayRemoved.p90.natural.T2: 0.229 → 0.15
  - live.err.delayRemoved.med.natural.T3: 0.059 → 0.05
  - live.err.delayRemoved.p90.natural.T3: 0.259 → 0.17
  - live.delay.ms.natural.T3: 40 → 20.0
  - pipe.err.delayRemoved.med.natural.T3: 0.06 → 0.05
  - pipe.err.delayRemoved.p90.natural.T3: 0.282 → 0.2
  - live.err.delayRemoved.med.natural.T4: 0.108 → 0.08
  - live.err.delayRemoved.p90.natural.T4: 0.444 → 0.28
  - live.delay.ms.natural.T4: 40 → 20.0
  - pipe.err.delayRemoved.med.natural.T4: 0.103 → 0.08
  - pipe.err.delayRemoved.p90.natural.T4: 0.383 → 0.27
  - live.err.delayRemoved.med.natural.pairs: 0.066 → 0.04
  - live.err.delayRemoved.p90.natural.pairs: 0.382 → 0.21
  - live.delay.ms.natural.pairs: 40 → 20.0
  - pipe.err.delayRemoved.med.natural.pairs: 0.066 → 0.05
  - pipe.err.delayRemoved.p90.natural.pairs: 0.416 → 0.25
- Tolerance: every `live.lowEndLost.p90.*` and `live.highEndLost.p90.*` (20 numbers) now 0.10 st (Pierre's decision). Medians stay 0.02.
- After: `npm run bench` 209 numbers, 0 FAIL.

### Tests and snapshots moved by median 3 (each updated in the step 2 commit)
- `src/dev/clipPipeline.test.ts`, golden polylines of the 4 anchors (stored numbers). ma1 3.528 → 3.527 (flat). ma2 turn point 0.2794 → 0.2395, end 3.896 → 3.919. ma3 turns 0.5554/0.7841 → 0.5227/0.7677, low 2.394 → 2.389, end 4.516 → 4.531. ma4 peak 0.3913 → 0.3557 at 4.847 → 4.857, end 2.404 → 2.385. Why: less delay, so the turns come earlier and the ends reach a little further. Frame counts and durations did not move.
- `src/dev/clipCutMulti.test.ts`, guard on corridor error: limit 0.35 → **0.45** chao. Measured: xiaoshi 0.37, yiqian 0.43 (median 5: about 0.30 / 0.31). Why: median 3 lets more frame-to-frame wiggle through. Still under the 0.47 tightest corridor that the test names as the real limit. **Loosened guard: needs review.**
- `src/game/toneAccuracy.fixtures.test.ts`, guard: own-tone score > 0.55 → **> 0.45**. Measured (median 5 → 3): jane_ma1 0.920 → 0.893, ma2 **0.593 → 0.496**, ma3 0.931 → 0.916, ma4 0.771 → 0.814. ma2's lead over the next tone grew (0.418 → 0.440), so it is still clearly read as a second tone, with less certainty. **Loosened guard: needs review.**
- `npm run test` 1827 passed after the updates. `npm run report` (fixtures/captures) and `npm run classifier-check`: see below.

## Step 3 — band: blocked
Explorer (scratch script, not committed): pooled low end lost over all 788 clips, Pierre's 40 tone clips (brief 41, creak rule 10 st under his talk median), CPU = median over clips of time per frame (Node, this Mac), share of the 21.3 ms hop. MEASURED.

| Option | Deep 0.6 lost med / p90 | Deep 0.5 lost med / p90 | Pierre lost med / p90 | CPU normal | CPU deep 0.5 |
|---|---|---|---|---|---|
| today, fMin 70 | 0.00 / 0.31 | **1.25 / 3.30** | 0.01 / 0.61 | 2.2% | 2.2% |
| fMin 55, window 1024 | −0.01 / 0.17 | −0.01 / 0.16 | −0.01 / 0.47 | 2.4% | 2.4% |
| fMin 55, 1536 under 110 Hz | 0.00 / 0.25 | 0.00 / 0.17 | 0.01 / 0.61 | 2.6% | 3.7% |
| fMin 55, 2048 under 110 Hz | 0.00 / 0.23 | 0.00 / 0.18 | 0.01 / 0.84 | 2.7% | 5.1% |

("Today" reproduces the brief's 1.2 median; its p90 is 3.3 here with median 3, the brief said 3.5 with median 5.)
The wider windows give no gain and cost more CPU, so fMin 55 with 1024 went to the full bench. MEASURED `npm run bench`: 12 FAIL. **Misses on this brief's own acceptance checks:**
- "Voice where Praat is silent ≤ baseline + 0.3 points": textbook T1 1.6 → 2.7, textbook T4 2.3 → 3.5, natural T1 2.0 → 3.1, natural T4 2.4 → 3.3, textbook pairs 2.0 → 2.6, textbook T3 0.8 → 1.6, natural pairs 1.0 → 1.6.
- "Pitch error, delay removed, p90 ≤ baseline + 0.05": textbook T4 0.25 → 0.36, natural T4 0.28 → 0.35 (pipeline: 0.28 → 0.43, 0.27 → 0.32).
- Also failing (not in the acceptance list): reader singles textbook 97.8 → 93.4, natural 89.1 → 86.7, voice2stLower textbook 90.1 → 84.6, pairs split 67.3 → 64.4, pairs both right 55.3 → 51.0.
- Passing: deep 0.5 every group ≈ 0 (natural T4 3.28 → −0.05); deep 0.6 no worse; Pierre ≤ 0.4; CPU 2.4%; voice heard not lower; low end lost better everywhere.
- In plain words: with the floor at 55 Hz, the listener also "finds" very low pitches in Jane's voice where there is none. These show at the quiet edges of first and fourth tones, mostly where Praat hears silence. That adds fake line pieces and drags the bottom of fourth tones down. The deep voice is fixed, but Jane's line gets dirtier.
- ASSUMED (not measured): the wider low-pitch windows would not fix this, because they turn on only after a voiced pitch under 110 Hz, and Jane's false frames come at the edges of normal-pitch syllables. Their full bench was not run.
- Code reverted to fMin 70. Nothing from step 3 is committed.

## Step 4 — fMax: measured only
Praat trusted voiced frames above 350 Hz (MEASURED, `ref-praat` cache): textbook 101 of 38,493 (0.26%), natural 2 of 31,770 (0.006%). Above today's 400 Hz cap: textbook 6 (0.016%), natural 2. Highest: 587 / 576 Hz. fMax not changed (brief 41 shows no need: Pierre's top is 185 Hz).

## Checks at the committed state (steps 1 + 2)
`npm run bench` 0 FAIL; `npm run test` 1827 passed; `npm run typecheck` clean; `npm run report` (fixtures/captures) before → after median 3: fit 0.97 → 0.95 (worse), lag 0 → 0, wiggle 0.063 → 0.061 (better), voiced 97% → 97%. `npm run classifier-check`: wall hits on a correct speaker 0 in every row. Build + dev-tool grep: nothing found.

## Needs Pierre's eyes
1. Step 3 decision. Options: (a) accept more fake voice at the low edge for deep voices (breaks the "+0.3 points" rule); (b) a smaller step, e.g. fMin 62 (not tried: outside the brief); (c) only lower the floor once a voice has shown it is low (calibration centre under some value; a new rule, outside this brief); (d) keep 70 and leave deep voices open.
2. The two loosened test guards above (corridor 0.45, ma2 own-tone 0.45).
3. Strong-model review still needed.

---

# Third run (Pierre's decision: floor follows the speaker) — 10 Nov 2026 — blocked

## What was built (not committed; full diff in `docs/briefs/reports/42-step3-speaker-floor.patch`)
- `speakerFloorHz(f0Center, low = 55, high = 70)` in `src/pitch/math.ts`: clamp(centre / 2, 55, 70); no centre → 70. Unit test `src/pitch/speakerFloor.test.ts`.
- `tuning()`: `pitchFloorLowHz` 55, `pitchFloorHighHz` 70, and `speakerFMin(centre)`. Used where a tracker gets a calibrated centre: Game, Visualiser, landing mini game, public checker (play tracker; its calibration tracker stays 70), Calibration preview, clipCut (3 sites, speaker's centre) and clipCutMulti. Calibration "talk" step: 70.
- Bench: `cachedRun` passes `fMin = speakerFloorHz(centre × factor)` (Jane 70, deep 0.6 and 0.5 → 55, Pierre 64.5). `BENCH_FLOOR=<Hz>` forces one floor for comparison. Scorecard: new rows per group for both stand-ins: `deep{k}.voiceWherePraatSilent.pct`, `deep{k}.err.delayRemoved.p90` (stand-in time t ↔ Jane's t·k, pitch ÷ k), `deep{k}.lowEndLost.p90`.
- Window 1024. `npm run test` 1827 + 2 passed, typecheck clean.

## Acceptance (MEASURED, `npm run bench`; "70" = same code with `BENCH_FLOOR=70`)
- Jane: **pass**. All 209 values identical to the step 2 run.
- Deep 0.5 low end lost: **pass**, every group. Median −0.05…0.00 (at 70: up to 2.63), p90 ≤ 0.33 (at 70: up to 4.06).
- Deep 0.6 low end lost: **pass** (no worse; p90 better, e.g. natural T4 0.64 → 0.30).
- CPU: **pass** (2.4% of the hop, step 3 explorer).
- Deep "voice where Praat is silent" ≤ Jane + 0.3: **miss in 7 groups, all at 0.6**. textbook T1 2.0 (Jane 1.6), T2 1.2 (0.6), T3 1.3 (0.8), T4 3.6 (2.3), pairs 2.4 (2.0); natural T2 1.0 (0.5), T3 0.9 (0.5), pairs 1.6 (1.0). At 70 the same stand-in was at or under Jane everywhere (e.g. textbook T4 2.1), so the floor causes it. Deep 0.5 passes everywhere (textbook T4 2.5 vs 2.3 + 0.3).
- Deep error delay-removed p90 ≤ Jane + 0.05: **miss in 9 groups**. Example 0.6 textbook T2 0.19 (Jane 0.15), T3 0.24 (0.19), T4 0.32 (0.25). **But the stand-in misses this at 70 too** (0.6 textbook T2 0.19, T3 0.24, T4 0.31): the slowed-down replay is itself less clean than Jane's real audio. So this check compares the stand-in with Jane, not the floor with no floor. The floor itself moves these p90s by −0.05…+0.07 (0.5 natural T4 0.26 → 0.33).
- Pierre (floor 64.5 from his saved centre 129): low end lost median ≤ 0.4 **pass** (≈ 0). "Other numbers no worse than at 70": **miss**. T3 voice heard 81.7 → 81.0%, T4 error p90 0.30 → 0.33, pairs read right (calibration a/b/c) 5/16 → 4/16. Creak drawn 10% → 14% of his creak frames (drawn an octave high less often: 100% → 67%).

## Calibration "talk" step at 70 (MEASURED, natural clips replayed as talk, centre 120, live settings)
| Voice | Tracker centre at 70 | Praat | Off by | At 55 |
|---|---|---|---|---|
| Jane | 178.2 Hz | 180.4 | −0.22 st | −0.39 |
| deep 0.6 | 107.8 | 108.2 | −0.07 | −0.21 |
| deep 0.5 | **97.9** | 90.2 | **+1.42 st** | −0.16 |
In plain words: a very deep voice (centre ~90 Hz) loses its lowest talk frames at 70 Hz, so calibration measures its middle 1.4 semitones too high. Its floor still comes out at 55 (half of 98 is under 55), so the floor rule works. But the grid is set 1.4 st too high: the player has to go lower than the game thinks to hit the bottom. This belongs to brief 44.

## In plain words
The floor that follows the speaker does what it should for the low end: a deep voice is no longer cut off, and Jane does not change at all. The cost: a voice around 109 Hz (0.6) draws about twice as many fake bits of line in silence as before, near the quiet edges of syllables. Your own fourth tones get slightly worse at the floor of 64.5 Hz, and one pair word is read wrong.

## Needs Pierre's eyes
1. Is the deep error p90 check fair? At 70 Hz the stand-in already fails it. Options: compare each stand-in with itself at 70 instead of with Jane.
2. Fake voice at 0.6 (up to +1.3 points). Accept it, or narrow the rule (for example the floor only goes under 70 for centres under ~100 Hz, so the 0.6 voice keeps 70 and the 0.5 voice gets 55)? Not tried: outside this decision.
3. Pierre: −0.7 points heard on T3, +0.03 st on T4 p90, one pair word. Accept or not.
4. Strong-model review still needed.

---

# Fourth run (floor = clamp(0.6 × centre, 55, 70)) — 10 Nov 2026 — blocked

## What was built (not committed; diff in `docs/briefs/reports/42-step3-speaker-floor-0.6.patch`)
The third-run patch, with the factor as a parameter: `speakerFloorHz(centre, low 55, high 70, factor 0.6)`, and `tuning().pitchFloorFactor` 0.6. Unit test updated. `npm run test` 1830 passed, typecheck clean. Floors: Jane 181.3 → 70; **Pierre 129.1 (saved calibration centre) → 77.5 → 70**; deep 0.6 (108.8) → 65.3; deep 0.5 (90.65) → 54.4 → 55.

## Acceptance (MEASURED, `npm run bench`; "at 70" = same code with `BENCH_FLOOR=70`)
- Jane: **pass**, all 209 values identical to step 2.
- Pierre: **pass**, his whole block identical (floor 70).
- CPU: **pass** (2.4% of the hop at 55 Hz, step 3 explorer).
- Deep 0.6 (floor 65): **pass** in all 10 groups. Fake voice at most +0.3 points over itself at 70 (textbook T4 2.1 → 2.4); error p90 at most +0.01; low end lost p90 better (textbook T4 0.79 → 0.39, natural pairs 0.50 → 0.35).
- Deep 0.5 (floor 55): low end lost **pass** in every group (median ≤ 0.0, p90 ≤ 0.33; at 70 up to 2.63 / 4.06). **Miss in 4 groups:**

| Group | Fake voice at 70 → 55 (limit +0.5) | Error p90 at 70 → 55 (limit +0.05) |
|---|---|---|
| textbook T4 | 0.6 → **2.5** | 0.27 → 0.31 |
| textbook pairs | 1.5 → **2.5** | 0.23 → 0.23 |
| natural T4 | 0.3 → **1.8** | 0.26 → **0.33** |
| natural pairs | 0.2 → **1.0** | 0.22 → 0.23 |

Other deep 0.5 groups pass (e.g. textbook T1 1.4 → 1.9, natural T3 errors better 0.25 → 0.19).
The factor does not change deep 0.5 (54.4 → 55 either way), so these are the same numbers as the third run.

## In plain words
At 70 Hz the 0.5 voice lost the whole bottom of its fourth tones, so it drew few frames there, real or fake. At 55 Hz the bottom comes back (low end lost 2.6 → 0.0 semitone), and with it some fake line where Praat hears silence, right after the fall ends. The rise is 1–2 points of all drawn frames. Some of it may be the voice trailing off into creak that Praat calls silent. Not measured.

## Needs Pierre's eyes
- Accept the 4 deep-0.5 misses (the fourth-tone bottom comes back, at the cost of 1–2 points of fake line at the end of falls), or keep 70 for now.
- Not tried, as instructed: another factor or limit.
- Calibration talk step stays at 70 (a 90 Hz voice is measured 1.4 st too high, note for brief 44).
