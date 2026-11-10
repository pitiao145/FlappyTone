# Brief 40 — rules review: every pitch claim, true or not

Written 10 Nov 2026 (brief 40). Starts from Phase A report section 10.
Evidence: a scorecard key means `npm run bench` (baseline `39-baseline.json`, Praat reference). Other labels: MEASURED (command), READ IN CODE (file:line), ASSUMED.
Verdicts: **TRUE**, **FALSE**, **UNPROVEN** (nobody measured it, or the test cannot see it). "Fixed in 40" means brief 40 corrected the doc line.
Line numbers are for this branch after brief 40's doc edits.

## CLAUDE.md

| Claim | Verdict | Evidence | Owner |
|---|---|---|---|
| "All pitch math in semitones, never raw Hz" (CLAUDE.md:43) | TRUE | READ IN CODE `src/pitch/math.ts` `hzToSemitones`, `semitonesToChao`. Band edges (`fMin` 70 / `fMax` 400) are in Hz, which is correct for a search band. | — |
| "`src/pitch/` must have zero Web Audio dependencies" (CLAUDE.md:45) | TRUE | The bench runs `PitchTracker` in plain Node (`tracks.mjs`). | — |
| "A gate whose longest voiced run is under `minUtteranceMs` (default 160ms…) is neutral" (CLAUDE.md:52) | TRUE (as code) | READ IN CODE `src/game/tuning.ts:661-662` (160, 150). Whether 160 ms is the right number is UNPROVEN on Praat. | 44/45 re-test |
| "the tone classifier never costs a heart on natural or pair gates" (CLAUDE.md:66) | TRUE (as code) / UNPROVEN (as effect) | PRD §7 and `run.ts` switch the mismatch off there. Not tested on a player board that is off by 2 st: `reader.singlesRight.pct.voice2stLower.natural` = 55.0% vs 89.1% calibrated. Hearts were not simulated. | 45 |
| "Tone classifier and tone accuracy are checked against Jane's real measured contours" (CLAUDE.md:90) | TRUE, but weak | Those contours come from the same listener. They show the reader agrees with the listener, not that either is right (Phase A §10). The scorecard reader lines now use Praat-checked clips. | 45 |
| "Ground truth is `fixtures/captures/jane_*.wav` (… direct mic)" (CLAUDE.md:92) | UNPROVEN as "the" truth | 8 old iPhone clips with wind (Phase A §2). The 829 catalog clips + Praat are the larger set; one sentence added in 40. The rule itself is for Pierre. | Pierre |
| "The synthetic `fixtures/tone*.wav` prove nothing about real voices" (CLAUDE.md:92) | TRUE | No creak, no dropouts, 44.1 kHz (MEASURED: wave header). | — |

## docs/PRD.md §5–§7

| Claim | Verdict | Evidence | Owner |
|---|---|---|---|
| "`f0Center` (median of conversational speech) sits near the bottom of a speaker's range" (PRD:52-53) | FALSE for Jane | Phase A one-ruler preview: middle 195.7 Hz, up 8.8 st, down 7.9 st (2/98 percentiles) — near the middle. | 44 |
| `chao = clamp(3 + (semitones / half) * 2, 1, 5)` (PRD:57) | TRUE | READ IN CODE `src/pitch/math.ts:24`. | — |
| "`rangeUp` bounded to [2, 10]… `rangeDown` to [2, 10]" (PRD:60) | TRUE | READ IN CODE `src/pitch/calibration.ts:49,65,100`. | 44 |
| "Analysis window 2048 samples, 1024-sample hop (~43Hz…)" (PRD:70) | FALSE → fixed in 40 | At 48 kHz: ~47 Hz, 21.3 ms per step (Phase A §3). | 42 (ms-based settings) |
| "Band-limit the search to reject most octave errors" (PRD:72) | TRUE, with a cost | Octave errors are rare (Phase A §4). Cost for deep voices: `deep0.5.underBand.pct.natural.T3` 47.1%, `deep0.5.lowEndLost.med.natural.T4` 3.28 st (stand-in, not a real male voice). | 42 |
| "`clarity >= 0.7` … plus a glide rescue" (PRD:73) | TRUE as chosen value | Clarity 0.9 gave 51 FAIL on the scorecard (brief 40 check). Whether 0.7 is best is not tested. | 42 |
| "Also requires `rms >= noiseFloor * 3`" (PRD:73) | TRUE (as code) | READ IN CODE `src/pitch/math.ts:133`. Cost at a 40% gate: `gate40.T4.lastThirdHeard.pct` 46.5% textbook / 41.3% natural. | Not now (noise) |
| "Median filter, window of 5 frames" (PRD:75) | TRUE | READ IN CODE `PitchTracker.ts` `new MedianFilter(5)`. It is the main source of the delay: `live.delay.ms` = 40 in all groups. | 42 |
| "Slew clamp ~3.0 st/hop, tuned from a native speaker's fastest Tone 4 fall" (PRD:76) | UNPROVEN | Per hop, so it changes with the device rate. T4 low end lost: `live.lowEndLost.med.natural.T4` 0.50 st, p90 2.09. Not split by cause. | 42 |
| "alpha = 0.85 … strictly better than a conservative value on all three" (PRD:77) | UNPROVEN on Praat | Tuned on `fixtures/captures` with `npm run tune`, not on the 829 clips. | 42 |
| Grace 120 ms / 250 ms in T3, drift 5.33 chao/s (PRD:83-84) | TRUE (as code) | READ IN CODE `tuning.ts:703,706`. Feel, not measurable offline. | — |
| Calibration: "upward half anchored off the player's own Tone 1 level… downward off their Tone 3 floor" (PRD:93) | TRUE (as code), wrong idea | Phase A §3: first tone becomes chao 5 by definition, so the top is never measured. Plan decision 2/8: one ruler. | 44 |
| "Corridor centrelines (`DEFAULT_POLYLINES`) are measured from Jane's own citation-form takes (`fixtures/captures/jane_ma*.wav`)" (PRD:100) | UNPROVEN | Not re-measured. Per-word polylines are moved and stretched onto textbook levels (Phase A §5, `clipNormalize.ts:105-115`). | 43 |
| "Every one of the 120 shipped words gets its own polyline" (PRD:100) | FALSE → fixed in 40 | Fallback holds 214 single-syllable rows (MEASURED). | — |
| Fallback shapes: T1 flat ~4.58, T4 falls to ~1.2 … (PRD:106-109) | FALSE as "where she holds" | Her real heights on one ruler: first tone 4.06, fourth tone 4.96 → 1.34 (handover, Phase A preview). Target vs said: `heights.gapChao.med` T1 0.18, T4 0.58 chao; shape matches well (`heights.shapeMatch.med` T2 0.99, T3 0.97, T4 0.98). Heights are off, shapes are right. | 43 |
| "Corridor tolerance starts at 0.11H… widens near each vertex" (PRD:113) | TRUE (as code) | READ IN CODE `tuning.ts:646`, `gates.ts` `corridorToleranceAt`. | — |
| "Collision requires 200ms continuously outside" (PRD:115) | TRUE (as code) | READ IN CODE `tuning.ts:656`. | — |
| Gate durations `{1: 0.55, 2: 1.07, 3: 1.25, 4: 0.6}` (PRD:117) | TRUE (as code) | READ IN CODE `tuning.ts:761`. | — |
| "Creaky voice destroys f0 tracking, and creak concentrates on Tone 3" (PRD:123) | FALSE for Jane | Jane creaks most on T4 and pairs, 0–2.8% of frames; T3 0.0–0.4% (MEASURED `detail.mjs`, creak column). True for other speakers is ASSUMED. | 41 (Pierre's voice) |
| "1.3× wider tolerance for T3" (PRD:126) | TRUE | READ IN CODE `gates.ts:193`. | — |
| "A gate is never scored a failure from signal loss alone… absolute utterance duration" (PRD:127) | TRUE (as code) | READ IN CODE `tuning.ts:661-662`. | — |
| Scoring formula, ratings, combo, hearts (PRD:132-149) | TRUE (as code) | Not a pitch claim; not re-checked. | — |
| Classifier v2: "measures the shape directly, on real time, with fixed thresholds" (PRD:151) | TRUE, but board-dependent | The thresholds are in chao, so a board off by 2 st changes the read: natural singles 89.1% → 55.0%. | 45 |
| "a close call can name a tone but never cost a heart" (PRD:153) | UNPROVEN | Not simulated on the 829 clips. | 45 |
| Tone accuracy "the right tone scores a median 0.85–0.95…" (PRD:172) | UNPROVEN on Praat | Measured on contours from the same listener. | 45 |

## docs/TESTING.md

| Claim | Verdict | Evidence | Owner |
|---|---|---|---|
| "Format: mono WAV, 44.1 kHz" (TESTING:13) | FALSE → fixed in 40 | All real-voice fixtures are 48 kHz (MEASURED). | — |
| Fixture inventory lists only `captures/`, `contours/`, synthetic tones | FALSE (incomplete) → fixed in 40 | Added the 829 local catalog clips. | — |
| `jane_ma1..4.wav` "Ground truth. If the pipeline fails these, the pipeline is wrong" (TESTING:25) | UNPROVEN as the only truth | Same as CLAUDE.md:92. | Pierre |
| "The wind in the first ~1s… every frame of it must come back unvoiced" (TESTING:30) | TRUE | Fixture tests pass (`npm run test`, 1824). | — |
| "A low male voice near the 70Hz band floor" is missing (TESTING, "Still missing") | TRUE | Stand-in shows the risk (`deep0.5.*`). | 41, 42 |

## docs/ARCHITECTURE.md (tone sections)

| Claim | Verdict | Evidence | Owner |
|---|---|---|---|
| Pairs "currently… four words" (ARCH:261) | FALSE → fixed in 40 | 246 two-syllable rows (MEASURED). | — |
| "`multiMergeGapMs` 400ms… a deliberate pause between syllables" (ARCH:266) | UNPROVEN | Pair read splits only 67.3% textbook / 3.9% natural into two (`reader.pairsSplitInTwo.pct`). | 46 |
| `clipCutMulti` is "deliberately shape-agnostic, no per-tone node template" (ARCH:274) | TRUE | Pairs shape match `heights.shapeMatch.med.pairs` 0.96. | 43 |
| Classifier and boost off for `syllables > 1` gates (ARCH:277) | TRUE (as code) | READ IN CODE per ARCH; not re-checked. | 46 |
| Classifier v2 "T1 = flat AND high tail (never ≤ chao 3…)" (ARCH:294) | TRUE (as code), board-dependent | See PRD:151. | 45 |

## Comments in src/pitch/ and src/game/tuning.ts (not edited: brief 40 may not touch these files)

| Claim | Verdict | Evidence | Owner |
|---|---|---|---|
| "3.0 st per ~23ms hop ≈ 130 st/s" (`PitchTracker.ts:22`) | FALSE at 48 kHz | One hop is 21.3 ms → ≈ 141 st/s. | 42 |
| "~115ms at a 1024 hop" (`PitchTracker.ts:38`) | FALSE at 48 kHz | 5 × 21.3 = 107 ms. | 42 |
| "0.8 went deaf… 0.65 admits noisy onsets" (`PitchTracker.ts:28-29`) | UNPROVEN on Praat | Only 0.9 tested (51 FAIL). | 42 |
| "detectWindow 1024… tone bodies keep clarity" (`PitchTracker.ts:44-47`) | UNPROVEN on Praat | Chosen on `fixtures/captures`. | 42 |
| "~22 Hz for a 2048 window @ 44.1k" (`mpm.ts:7`) | FALSE at 48 kHz (small) | ~23 Hz at 48 kHz. | 42 |
| "Tuned on fixtures/captures/Jane-*.wav (… iPhone mic)" (`math.ts:99`) | TRUE as history | Not re-tuned on the 829 clips. | 42 |
| "while the player is waiting and quiet" (`noiseMeter.ts:11`) | UNPROVEN | The meter cannot know (Phase A §10). | Not now (noise) |
| `voiceCapFraction` "NOT YET TUNED" (`tuning.ts:590`) | TRUE | Cost at the cap: `gate40.T4.lastThirdHeard.pct` 46.5 / 41.3%. | Not now (noise) |
| `rescueRmsMult` 10 (`math.ts:108`) | UNPROVEN | Ties the rescue to the floor; in a normal room it asks for more than the typical voice (Phase A §4.3). | Not now (noise) |
| `fMin` 70 / `fMax` 400 (`PitchTracker.ts:42-43`) | Rule to question | Deep stand-in loses the low end (`deep0.5.*`). | 42 |
| `reachToToneSpaceUp/Down` "Flown, not derived" (`tuning.ts:603-615`) | TRUE as history | Replaced by the one-ruler plan. | 44 |
| `gateDurationS` "T1 and T3 no longer match their clip" (`tuning.ts:618-627`) | TRUE | READ IN CODE. | — |
