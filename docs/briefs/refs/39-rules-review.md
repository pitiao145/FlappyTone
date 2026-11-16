# Brief 40 — rules review: every pitch claim, true or not

Written 10 Nov 2026 (brief 40). Starts from Phase A report section 10.
Evidence: a scorecard key means `npm run bench` (baseline `39-baseline.json`, Praat reference). Other labels: MEASURED (command), READ IN CODE (file:line), ASSUMED.
Verdicts: **TRUE**, **FALSE**, **UNPROVEN** (nobody measured it, or the test cannot see it). "Fixed in 40" means brief 40 corrected the doc line.
Line numbers are for this branch after brief 40's doc edits. The last column is each row's final state after briefs 41–48: FIXED (code or doc), TRUE (re-tested or unchanged), or STILL UNPROVEN with the reason.

## CLAUDE.md

| Claim | Verdict | Evidence | Owner | Final state (brief 48) |
|---|---|---|---|---|
| "All pitch math in semitones, never raw Hz" (CLAUDE.md:43) | TRUE | READ IN CODE `src/pitch/math.ts` `hzToSemitones`, `semitonesToChao`. Band edges (`fMin` 70 / `fMax` 400) are in Hz, which is correct for a search band. | — | TRUE, unchanged. |
| "`src/pitch/` must have zero Web Audio dependencies" (CLAUDE.md:45) | TRUE | The bench runs `PitchTracker` in plain Node (`tracks.mjs`). | — | TRUE, unchanged. |
| "A gate whose longest voiced run is under `minUtteranceMs` (default 160ms…) is neutral" (CLAUDE.md:52) | TRUE (as code) | READ IN CODE `src/game/tuning.ts:661-662` (160, 150). Whether 160 ms is the right number is UNPROVEN on Praat. | 44/45 re-test | TRUE as code. 160 ms kept; UNPROVEN as the best value: 130 of 406 natural pair syllables are under it and read "?" (brief 46). Owner: natural pair-reader brief. |
| "the tone classifier never costs a heart on natural or pair gates" (CLAUDE.md:66) | TRUE (as code) / UNPROVEN (as effect) | PRD §7 and `run.ts` switch the mismatch off there. Not tested on a player board that is off by 2 st: `reader.singlesRight.pct.voice2stLower.natural` = 55.0% vs 89.1% calibrated. Hearts were not simulated. | 45 | TRUE as code; MEASURED by brief 45 review: 1–3 decisive wrong reads in 211 natural clips, harmless while the rule holds. Voice 2 st low, natural: 55.0% → 80.7% on the ruler (91.2% after learning). Re-check before the rule ever changes. |
| "Tone classifier and tone accuracy are checked against Jane's real measured contours" (CLAUDE.md:90) | TRUE, but weak | Those contours come from the same listener. They show the reader agrees with the listener, not that either is right (Phase A §10). The scorecard reader lines now use Praat-checked clips. | 45 | FIXED in docs (brief 48): CLAUDE.md now says these contours show agreement, not truth, and `npm run bench` checks listener and reader against Praat. |
| "Ground truth is `fixtures/captures/jane_*.wav` (… direct mic)" (CLAUDE.md:92) | UNPROVEN as "the" truth | 8 old iPhone clips with wind (Phase A §2). The 829 catalog clips + Praat are the larger set; one sentence added in 40. The rule itself is for Pierre. | Pierre | STILL UNPROVEN: Pierre's rule. TESTING.md now says the 4 captures are the fixture-test truth and the Praat bench is the larger reference. Pierre decides whether the rule changes. |
| "The synthetic `fixtures/tone*.wav` prove nothing about real voices" (CLAUDE.md:92) | TRUE | No creak, no dropouts, 44.1 kHz (MEASURED: wave header). | — | TRUE, unchanged. |

## docs/PRD.md §5–§7

| Claim | Verdict | Evidence | Owner | Final state (brief 48) |
|---|---|---|---|---|
| "`f0Center` (median of conversational speech) sits near the bottom of a speaker's range" (PRD:52-53) | FALSE for Jane | Phase A one-ruler preview: middle 195.7 Hz, up 8.8 st, down 7.9 st (2/98 percentiles) — near the middle. | 44 | FIXED in PRD §5.1 (brief 48): reason corrected; old and new foundation both described. |
| `chao = clamp(3 + (semitones / half) * 2, 1, 5)` (PRD:57) | TRUE | READ IN CODE `src/pitch/math.ts:24`. | — | TRUE, unchanged. |
| "`rangeUp` bounded to [2, 10]… `rangeDown` to [2, 10]" (PRD:60) | TRUE | READ IN CODE `src/pitch/calibration.ts:49,65,100`. | 44 | TRUE, unchanged (also the clamp for the learned grid: 3–10 st per half on the ruler). |
| "Analysis window 2048 samples, 1024-sample hop (~43Hz…)" (PRD:70) | FALSE → fixed in 40 | At 48 kHz: ~47 Hz, 21.3 ms per step (Phase A §3). | 42 (ms-based settings) | FIXED in 40; ms-based time settings shipped in 42 (PRD §5.2). Frame/hop/window still in samples: 16–24 kHz devices still get a later line (open, own small brief). |
| "Band-limit the search to reject most octave errors" (PRD:72) | TRUE, with a cost | Octave errors are rare (Phase A §4). Cost for deep voices: `deep0.5.underBand.pct.natural.T3` 47.1%, `deep0.5.lowEndLost.med.natural.T4` 3.28 st (stand-in, not a real male voice). | 42 | TRUE, cost fixed in 42: floor follows the speaker (clamp(0.6 × centre, 55, 70) Hz). Deep stand-in natural T4 low end lost 3.28 → −0.05 st. Real deep voice still missing (TESTING.md). |
| "`clarity >= 0.7` … plus a glide rescue" (PRD:73) | TRUE as chosen value | Clarity 0.9 gave 51 FAIL on the scorecard (brief 40 check). Whether 0.7 is best is not tested. | 42 | TRUE as chosen value; still not compared with other values on Praat beyond 0.9 (UNPROVEN as "best"). PRD unchanged. |
| "Also requires `rms >= noiseFloor * 3`" (PRD:73) | TRUE (as code) | READ IN CODE `src/pitch/math.ts:133`. Cost at a 40% gate: `gate40.T4.lastThirdHeard.pct` 46.5% textbook / 41.3% natural. | Not now (noise) | TRUE as code; not now (noise out of scope). Kept on the scorecard (`gate40.*`). |
| "Median filter, window of 5 frames" (PRD:75) | TRUE | READ IN CODE `PitchTracker.ts` `new MedianFilter(5)`. It is the main source of the delay: `live.delay.ms` = 40 in all groups. | 42 | FALSE → FIXED in 42 and PRD §5.2: median of 3, line 20 ms late (was 40). |
| "Slew clamp ~3.0 st/hop, tuned from a native speaker's fastest Tone 4 fall" (PRD:76) | UNPROVEN | Per hop, so it changes with the device rate. T4 low end lost: `live.lowEndLost.med.natural.T4` 0.50 st, p90 2.09. Not split by cause. | 42 | FIXED in 42: stored as 140.6 st/s (PRD §5.2). Fourth-tone low end lost p90 natural 2.09 → 0.73 st. |
| "alpha = 0.85 … strictly better than a conservative value on all three" (PRD:77) | UNPROVEN on Praat | Tuned on `fixtures/captures` with `npm run tune`, not on the 829 clips. | 42 | STILL UNPROVEN on Praat: not re-tuned. PRD §5.2 now says so. |
| Grace 120 ms / 250 ms in T3, drift 5.33 chao/s (PRD:83-84) | TRUE (as code) | READ IN CODE `tuning.ts:703,706`. Feel, not measurable offline. | — | TRUE as code, unchanged (feel, not measurable offline). |
| Calibration: "upward half anchored off the player's own Tone 1 level… downward off their Tone 3 floor" (PRD:93) | TRUE (as code), wrong idea | Phase A §3: first tone becomes chao 5 by definition, so the top is never measured. Plan decision 2/8: one ruler. | 44 | FIXED behind the flag (brief 44): middle step + grid learning; PRD §5.4 describes both. Production keeps the old flow until go-live. |
| "Corridor centrelines (`DEFAULT_POLYLINES`) are measured from Jane's own citation-form takes (`fixtures/captures/jane_ma*.wav`)" (PRD:100) | UNPROVEN | Not re-measured. Per-word polylines are moved and stretched onto textbook levels (Phase A §5, `clipNormalize.ts:105-115`). | 43 | STILL UNPROVEN: `DEFAULT_POLYLINES` not re-measured; PRD §6 says so. New foundation swaps untouched defaults for `DEFAULT_POLYLINES_V2` (measured on the ruler, brief 45). |
| "Every one of the 120 shipped words gets its own polyline" (PRD:100) | FALSE → fixed in 40 | Fallback holds 214 single-syllable rows (MEASURED). | — | FIXED in 40. |
| Fallback shapes: T1 flat ~4.58, T4 falls to ~1.2 … (PRD:106-109) | FALSE as "where she holds" | Her real heights on one ruler: first tone 4.06, fourth tone 4.96 → 1.34 (handover, Phase A preview). Target vs said: `heights.gapChao.med` T1 0.18, T4 0.58 chao; shape matches well (`heights.shapeMatch.med` T2 0.99, T3 0.97, T4 0.98). Heights are off, shapes are right. | 43 | FIXED behind the flag (brief 43): heights gap T1 0.13, T2 0.12, T3 0.21, T4 0.28, pairs 0.18 chao on the ruler (production 0.18 / 0.24 / 0.36 / 0.59 / 0.41). PRD §6 describes both. |
| "Corridor tolerance starts at 0.11H… widens near each vertex" (PRD:113) | TRUE (as code) | READ IN CODE `tuning.ts:646`, `gates.ts` `corridorToleranceAt`. | — | TRUE, unchanged. Brief 47 draws the same tolerance as the Visualiser band. |
| "Collision requires 200ms continuously outside" (PRD:115) | TRUE (as code) | READ IN CODE `tuning.ts:656`. | — | TRUE, unchanged. |
| Gate durations `{1: 0.55, 2: 1.07, 3: 1.25, 4: 0.6}` (PRD:117) | TRUE (as code) | READ IN CODE `tuning.ts:761`. | — | TRUE, unchanged (T1/T3 gap with their clips is a known limitation). |
| "Creaky voice destroys f0 tracking, and creak concentrates on Tone 3" (PRD:123) | FALSE for Jane | Jane creaks most on T4 and pairs, 0–2.8% of frames; T3 0.0–0.4% (MEASURED `detail.mjs`, creak column). True for other speakers is ASSUMED. | 41 (Pierre's voice) | FALSE for Jane and Pierre → PRD §6 corrected (brief 48). The T3 mitigations stay; ASSUMED useful for learners. |
| "1.3× wider tolerance for T3" (PRD:126) | TRUE | READ IN CODE `gates.ts:193`. | — | TRUE, unchanged. |
| "A gate is never scored a failure from signal loss alone… absolute utterance duration" (PRD:127) | TRUE (as code) | READ IN CODE `tuning.ts:661-662`. | — | TRUE, unchanged. |
| Scoring formula, ratings, combo, hearts (PRD:132-149) | TRUE (as code) | Not a pitch claim; not re-checked. | — | TRUE as code, not re-checked (not a pitch claim). |
| Classifier v2: "measures the shape directly, on real time, with fixed thresholds" (PRD:151) | TRUE, but board-dependent | The thresholds are in chao, so a board off by 2 st changes the read: natural singles 89.1% → 55.0%. | 45 | FIXED behind the flag (brief 45): ruler reader reads without absolute height; textbook voice ±2 st 89.3–100%, natural 80.7–87.7%. PRD §7 says the production reader is board-dependent. |
| "a close call can name a tone but never cost a heart" (PRD:153) | UNPROVEN | Not simulated on the 829 clips. | 45 | TRUE as measured (brief 45 review): unsure reads take no heart; a wrong tone is still flagged 78% (old 75%); textbook wall hits 0 in every grid case. |
| Tone accuracy "the right tone scores a median 0.85–0.95…" (PRD:172) | UNPROVEN on Praat | Measured on contours from the same listener. | 45 | FIXED in PRD §7 (brief 48): Praat-checked numbers added (production 0.77 / 0.70, new 0.84 / 0.79 median, held-out half); the old sentence is marked as same-listener agreement. |

## docs/TESTING.md

| Claim | Verdict | Evidence | Owner | Final state (brief 48) |
|---|---|---|---|---|
| "Format: mono WAV, 44.1 kHz" (TESTING:13) | FALSE → fixed in 40 | All real-voice fixtures are 48 kHz (MEASURED). | — | FIXED in 40. |
| Fixture inventory lists only `captures/`, `contours/`, synthetic tones | FALSE (incomplete) → fixed in 40 | Added the 829 local catalog clips. | — | FIXED in 40. |
| `jane_ma1..4.wav` "Ground truth. If the pipeline fails these, the pipeline is wrong" (TESTING:25) | UNPROVEN as the only truth | Same as CLAUDE.md:92. | Pierre | STILL UNPROVEN: Pierre's rule (same as CLAUDE.md:92). TESTING.md wording updated in 48. |
| "The wind in the first ~1s… every frame of it must come back unvoiced" (TESTING:30) | TRUE | Fixture tests pass (`npm run test`, 1824). | — | TRUE, unchanged (fixture tests pass, 1882). |
| "A low male voice near the 70Hz band floor" is missing (TESTING, "Still missing") | TRUE | Stand-in shows the risk (`deep0.5.*`). | 41, 42 | TRUE, partly covered: Pierre's voice (41) and the deep stand-in rows (42). A real deep voice is still missing; TESTING.md updated in 48. |

## docs/ARCHITECTURE.md (tone sections)

| Claim | Verdict | Evidence | Owner | Final state (brief 48) |
|---|---|---|---|---|
| Pairs "currently… four words" (ARCH:261) | FALSE → fixed in 40 | 246 two-syllable rows (MEASURED). | — | FIXED in 40. |
| "`multiMergeGapMs` 400ms… a deliberate pause between syllables" (ARCH:266) | UNPROVEN | Pair read splits only 67.3% textbook / 3.9% natural into two (`reader.pairsSplitInTwo.pct`). | 46 | STILL UNPROVEN as a value; no longer used for reading pairs (46: `findSyllables`, 99.0% / 49.3% split). ARCHITECTURE.md says so (48). |
| `clipCutMulti` is "deliberately shape-agnostic, no per-tone node template" (ARCH:274) | TRUE | Pairs shape match `heights.shapeMatch.med.pairs` 0.96. | 43 | TRUE, unchanged. New foundation adds a refined pair fit (`refinedMultiSyllablePolyline`, dev pipeline) that is still template-free. |
| Classifier and boost off for `syllables > 1` gates (ARCH:277) | TRUE (as code) | READ IN CODE per ARCH; not re-checked. | 46 | TRUE as code, unchanged. |
| Classifier v2 "T1 = flat AND high tail (never ≤ chao 3…)" (ARCH:294) | TRUE (as code), board-dependent | See PRD:151. | 45 | TRUE as code; ruler version documented in ARCHITECTURE.md (45). Production read stays board-dependent until go-live. |

## Comments in src/pitch/ and src/game/tuning.ts (not edited: brief 40 may not touch these files)

| Claim | Verdict | Evidence | Owner | Final state (brief 48) |
|---|---|---|---|---|
| "3.0 st per ~23ms hop ≈ 130 st/s" (`PitchTracker.ts:22`) | FALSE at 48 kHz | One hop is 21.3 ms → ≈ 141 st/s. | 42 | FIXED in 42 (setting is per second; comment explains). |
| "~115ms at a 1024 hop" (`PitchTracker.ts:38`) | FALSE at 48 kHz | 5 × 21.3 = 107 ms. | 42 | FIXED in 42 (stale reset in ms, 107). |
| "0.8 went deaf… 0.65 admits noisy onsets" (`PitchTracker.ts:28-29`) | UNPROVEN on Praat | Only 0.9 tested (51 FAIL). | 42 | STILL UNPROVEN on Praat; comment unchanged (only 0.9 tested: 51 FAIL). |
| "detectWindow 1024… tone bodies keep clarity" (`PitchTracker.ts:44-47`) | UNPROVEN on Praat | Chosen on `fixtures/captures`. | 42 | STILL UNPROVEN on Praat; comment unchanged. 1536 and 2048 windows tested in 42 for deep voices: no gain, more CPU. |
| "~22 Hz for a 2048 window @ 44.1k" (`mpm.ts:7`) | FALSE at 48 kHz (small) | ~23 Hz at 48 kHz. | 42 | TRUE as written (the comment names 44.1 kHz); at 48 kHz ~23 Hz. Harmless, not edited. |
| "Tuned on fixtures/captures/Jane-*.wav (… iPhone mic)" (`math.ts:99`) | TRUE as history | Not re-tuned on the 829 clips. | 42 | TRUE as history, unchanged. |
| "while the player is waiting and quiet" (`noiseMeter.ts:11`) | UNPROVEN | The meter cannot know (Phase A §10). | Not now (noise) | STILL UNPROVEN; not now (noise out of scope). Brief 47 measures the room once per mic session. |
| `voiceCapFraction` "NOT YET TUNED" (`tuning.ts:590`) | TRUE | Cost at the cap: `gate40.T4.lastThirdHeard.pct` 46.5 / 41.3%. | Not now (noise) | TRUE, unchanged; not now (noise). |
| `rescueRmsMult` 10 (`math.ts:108`) | UNPROVEN | Ties the rescue to the floor; in a normal room it asks for more than the typical voice (Phase A §4.3). | Not now (noise) | STILL UNPROVEN; not now (noise). |
| `fMin` 70 / `fMax` 400 (`PitchTracker.ts:42-43`) | Rule to question | Deep stand-in loses the low end (`deep0.5.*`). | 42 | FIXED in 42: speaker floor 55–70 Hz; fMax 400 kept (Praat frames above 350 Hz: 0.26% textbook). |
| `reachToToneSpaceUp/Down` "Flown, not derived" (`tuning.ts:603-615`) | TRUE as history | Replaced by the one-ruler plan. | 44 | TRUE as history; replaced behind the flag by the one ruler (44). Fields stay for production. |
| `gateDurationS` "T1 and T3 no longer match their clip" (`tuning.ts:618-627`) | TRUE | READ IN CODE. | — | TRUE, unchanged (known limitation). |
