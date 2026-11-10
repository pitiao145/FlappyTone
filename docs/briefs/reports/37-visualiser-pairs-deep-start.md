# Report: 37 Visualiser: tone pairs need a much deeper start than the game (investigate)
- Result: done (diagnosis only; no code or tuning changed)
- Branch: `research/37-visualiser-pairs-deep-start`

## Update (follow-up with Pierre): shapes, and the room-noise measurement
Pierre's read: Foorgol meant the drawn shapes, not the Tone card. The bird is the same in the game and the Visualiser. Pierre asked to check the room-noise measurement that runs before a run or a Visualiser visit.

**Finding: the room-noise measurement can explain "the line will not go low unless I go much deeper".** It is the only per-session input that differs between the two screens, and a high value removes exactly the low parts of a contour.

How it works (same code on both screens, `src/game/sessionNoise.ts`, `src/pitch/noiseMeter.ts`):
- Skip the first 200ms of mic audio, then take the median loudness of the next 400ms. That is the room's noise floor (`noiseSkipMs`/`noiseMeasureMs`, `tuning.ts:753-754`).
- Any frame quieter than floor × 3 is "not voice" (`src/pitch/math.ts:133`). The bird stops following it and holds its last height.
- The floor is capped so the gate is at most 40% of the player's voice loudness from calibration (`voiceCapFraction` 0.4, `sessionNoise.ts:20-24`). The cap is marked "NOT YET TUNED" in `tuning.ts`.
- It is measured once per game run or Visualiser visit, and is not logged anywhere. We cannot see Foorgol's value. PostHog has only the calibration floor (`posthog.ts:359`).

When it is measured (the difference):
- **Game:** each new run (`Game.tsx:567`, effect deps include `runGen`). The 600ms falls inside the warm-up hold (`warmupMinMs` 650ms, `tuning.ts:752`). The world is still and the player waits, so the room is usually quiet.
- **Visualiser:** the first 600ms of mic audio after the screen's effect starts (`Visualiser.tsx:536`). There is no hold and no "stay quiet" moment. The effect also restarts, and **measures again**, every time the canvas changes size (deps `[settings, canvasW, canvasH]`, `Visualiser.tsx:685`; size from a ResizeObserver, `Visualiser.tsx:503-511`). That happens once right after mount, and again on rotation, on a window resize, or whenever the stage changes height. If the player is speaking, or the room is louder at that moment, the floor goes up to the cap and stays there for the whole visit.

What a high floor does to the line. Our native speaker's direct-mic captures, run through the real `PitchTracker` with the gate set to a share of her own median voice loudness:

| clip | gate ≈ 0 | gate 10% | gate 20% | gate 30–40% (cap) |
|---|---|---|---|---|
| ma4 (T4): lowest point reached | **1.22** | 1.92 | **4.70** (fall gone) | 4.70 |
| ma4: voiced ms | 418 | 325 | 279 | 209 |
| ma3 natural (T3): lowest point | 1.00 | 1.05 | 1.36 | 1.36 |
| ma3 natural: voiced ms | 372 | 279 | 255 | 255 |
| ma2 (T2): voiced ms | 1068 | 1045 | 859 | 813 |
| ma1 (T1): voiced ms | 766 | 743 | 697 | 627 |
| ma3 textbook: lowest point | 1.19 | 1.19 | 1.19 | 1.19 |

- The quiet part of a word is its low end: the bottom of a T4 fall, a T3 dip in fast speech, the tail of any word. A higher gate removes these first. With the gate at 20% of her loudness, her T4 is drawn as a short flat line at the top; the fall never appears.
- Slow, loud textbook T3 survives. Fast, soft speech does not.
- **Pairs are hit harder than single tones.** A pair's second syllable is quieter and lower (declination), and many pairs end in a fall or a low half-third tone. With a high floor the learner's line stops before it gets low and the bird holds high. To make the line reach the target, the learner must push lower and louder: "start with a much deeper voice". In the game the same voice is still inside the corridor (±0.7 chao), or that part is not scored, so it feels fine there.
- Limits of this test: these are direct-mic single-tone captures, not phone audio. The pair claim is reasoning from the single-tone numbers. Correction: 4 pair WAVs exist in `fixtures/tonepairs/wav/` (hao_wan, mei_guo, xiao_shi, yi_qian); they were not used here and are the next thing to run through this test.

Proposed fixes for this part (smallest first):
1. **Measure once per Visualiser visit, not on every resize.** Create the meter outside the canvas-size effect (a ref), so a resize keeps the floor it has. Small change in `Visualiser.tsx`; no golden snapshots; game untouched.
2. **Measure only while the player is quiet**: discard the measurement and try again if the frames look like voice (clarity high), or reuse the last game run's floor when it is recent. Small, in `src/game/sessionNoise.ts`; it also helps the game.
3. **Log the session floor** (and the gate as a share of `voiceRms`) on `visualiser_*` and run-end events, so the next report like this can be checked. This is a room number, not voice audio, but it is new derived data: check the privacy policy wording first (hard rule 12).
4. Re-tune `voiceCapFraction` (0.4 now, marked not tuned). At 0.2 her T4 fall is already gone, so even 0.4 at the cap is too high to be safe. This changes the game too, so it needs `npm run report` before/after and Lab flying.

Extra question for Foorgol: phone or computer, and did they rotate the phone or resize the window while in the Visualiser? Was there noise (talking, TV, fan) when they opened it?

## Short answer (first pass, before the follow-up above)
- **A calibration or height offset is not the cause.** The app Visualiser, the public /tools/tone-visualizer and the game use the same calibration, the same voice-to-height mapping and the same target heights. A lower voice does not make pairs read better. On our native speaker's own pairs it makes some read worse.
- **What is broken is the pair read** (the "T4 · T1" Tone card). It fails on our native speaker's own perfect recordings: 56% right for Standard (textbook) pairs, **0% for Spoken (natural) pairs**. A learner who sees "wrong" or "couldn't detect both tones" again and again tries other things, for example a deeper voice.
- **Second, smaller cause: the Visualiser draws only a thin target line.** The game draws a corridor about ±0.7 chao wide. A voice 0.5 chao above the target is "inside" in the game, but in the Visualiser it is clearly above the line. This can explain "I would have to start deeper", and it is true for single tones too.

## Q1: Is the same calibration in effect at run time?
Yes, on all three surfaces.
- Game: `src/ui/Game.tsx:572-580` builds `PitchTracker` from `settings.f0Center`, `rangeSemitones`, `rangeDownSemitones`.
- App Visualiser: `src/ui/Visualiser.tsx:542-551`, the same fields of the same `settings` object (`src/app/GameApp.tsx:1354-1355`). The effect re-runs when `settings` changes (`Visualiser.tsx:685`), so a recalibration is not left stale.
- Public page: `src/site/checker/engine.ts:117-121` uses the app's saved calibration when there is one (`loadSettings()`), else the quick calibration (`quickCal.ts`, geometric middle of a high "mā" and a low "mǎ"). If Foorgol was on the public page with no app calibration on that browser, the centre can differ from the game. Ask (see below).
- Both draw `smoothedChao` (alpha 0.85, almost no lag, `PitchTracker.ts:21,202`).

## Q2: Screen height and where the pair target starts
- Same: `chaoToY` and `corridorChaoAt(shapeForWord(word))` in both (`src/render/visualiser.ts:162-185`, `src/game/gates.ts:488-505`).
- Pair targets do not start lower than single tones. Measured from the shipped catalog (`wordsFallback.json`, textbook, 477 words, mean chao):

| target | start | lowest | highest |
|---|---|---|---|
| single T2 | 2.84 | 2.11 | 4.94 |
| single T3 | 3.30 | 1.42 | 4.79 |
| single T4 | 4.11 | 1.37 | 4.77 |
| pairs 2+x | 2.35–2.83 | 1.25–2.20 | 4.68–4.89 |
| pairs 3+x | 2.64–2.96 | 1.36–1.57 | 4.31–4.78 |
| pairs 4+x | 4.37–4.46 | 1.27–1.47 | 4.70–4.85 |

- Difference that matters: the game draws a corridor of ±`toleranceChao` (base 0.11 H → **0.73 chao**, ×1.3 = 0.95 when the pair has a T3; `gates.ts:206-209`), and it widens toward the end. The Visualiser draws a 2px dashed centre line only (`visualiser.ts:173-184`). The same voice that is comfortably inside in the game is visibly off the line in the Visualiser.

## Q3: Do pairs use different targets from single tones?
- Targets: no. Both are the word's own recorded line (`shapeForWord`). Tone accuracy uses that same line (`Visualiser.tsx:582-583`).
- Read: yes. Single tones get one `classifyToneV2` read. Pairs get `readContourSyllables` (`freeAttempts.ts:76-79`): split the attempt at silences longer than `mergeGapMs` (150ms), drop pieces under `minUtteranceMs` (160ms), then classify each piece alone. The UI shows "couldn't detect both tones" when the split does not give two pieces (`Visualiser.tsx:878-893`).

## Q4: Drawing or reading?
Mostly the **reading**. Measured with our native speaker's real measured contours (`fixtures/contours/jane-*-sample.json`, 48 pairs per style, 3 per combo), moved up or down by a fixed amount to copy a voice that sits higher or lower than hers:

| shift (chao) | −1 | −0.75 | −0.5 | −0.25 | 0 | +0.25 | +0.5 | +0.75 | +1 |
|---|---|---|---|---|---|---|---|---|---|
| Standard singles: read right % | 89 | 96 | 98 | 100 | 100 | 100 | 100 | 100 | 100 |
| Standard pairs: both tones read right % | 35 | 44 | 52 | 54 | **56** | 58 | 54 | 50 | 46 |
| Standard pairs: split into 2 syllables % | 69 | 69 | 69 | 69 | **69** | 69 | 69 | 69 | 69 |
| Standard pairs: Visualiser tone accuracy (mean) % | 79 | 83 | 86 | 88 | 90 | 90 | 88 | 85 | 81 |
| Standard pairs: game, voice inside corridor % | 72 | 95 | 99 | 100 | 100 | 100 | 99 | 98 | 89 |
| Spoken pairs: split into 2 syllables % | 0 | 0 | 0 | 0 | **0** | 0 | 0 | 0 | 0 |

What the numbers say:
- Tone accuracy (the % number) and the game corridor both forgive a ±0.75 chao offset. They are not the problem.
- The pair read is wrong for our native speaker 44% of the time at her own perfect calibration, and moving the voice does not fix it. Going lower makes it worse (3+1, 3+4, 4+2, 2+2 break first).
- Three failure kinds at shift 0 (Standard):
  1. **No silence between syllables** (11 of 48): words with a voiced consonant in the middle (bangmang, gongren, gongyuan, niunai, haowan, keneng, ganmao, haoma, duimian, changge; the longest gap is 21–85ms). Shown as "couldn't detect both tones". The report for brief 21 already named this limit.
  2. **The single-tone classifier misreads short pair syllables**: 4+1 second syllable reads "none" (caidan, dajia); 2+3 reads as one "4"; 4+4 first syllable reads "2"/"3" (bucuo).
  3. **Absolute height rules in the classifier** (`toneClassifierV2.ts`: T1 tail ≥ chao 3, T4 peak ≥ 3.4, T3 "low" vote). In a pair the second syllable sits lower (declination), so a correct T4 or T1 can fall under these lines.
- Spoken (natural) pairs never split. Natural syllables are short and the voice rarely stops for 150ms, so every Spoken pair shows "couldn't detect both tones". If Foorgol uses Spoken style, pairs are impossible to get "right" in the Visualiser. That fits "almost impossible" better than any height cause.

## Which surfaces
- Pair read: app Visualiser (Tone pairs tab) and public page (both call `readContourSyllables`, `board.ts:79-81`). Pairs only.
- Thin line vs corridor: both Visualiser surfaces, singles and pairs alike.
- Game: not affected.

## Proposed fixes (smallest first)
1. **Stop showing the per-syllable read as a verdict in Tone pairs** until it works on real pairs: show tone accuracy only (it already behaves well), or show the read only when both pieces read with high confidence. Visualiser-only UI change. No golden snapshot moves, game untouched. Risk: low; the learner loses a signal that is wrong half the time anyway.
2. **Draw the game's tolerance band behind the target line** in the Visualiser (`corridorToleranceAt` with the base difficulty), so "close enough" looks the same as in the game. Renderer-only change in `src/render/visualiser.ts`; no scoring change, no golden snapshot. Risk: low; check it on a phone screen.
3. Later, a real fix for the pair read: split the attempt at the word's own syllable timing (from the recording) instead of at silence, and use pair-aware rules (or the pair averages in `AVERAGED_PAIR_SHAPE`) instead of the single-tone classifier. Needs its own brief, `npm run classifier-check` on the pair fixtures, and a rule for "unclear = not wrong" (hard rule 8). Not `src/pitch/`.

## What to ask Foorgol
- App or the public /tools/tone-visualizer page? If the public page: had they calibrated in the app on the same browser?
- Speech style: Standard or Spoken? (Settings → Speech style.) Spoken would explain "almost impossible" by itself.
- What does the Tone card say after a pair: "couldn't detect both tones", or the wrong tones (which pair)? Is the % number low too?
- "Start deeper": is that from the line on screen (their trace above the dashed line), or from trying until the card said right?

## Checks run + outcome
- `npm run test`: 135 files, 1824 tests passed.
- `npm run typecheck`: clean.
- Measurement scripts were throwaway, kept out of the repo (scratchpad): one reads the catalog targets, one runs `fixtures/contours/jane-*-sample.json` through `readContourSyllables`, `toneAccuracyDetail(referenceFromWord)` and the corridor check at shifts −1…+1 chao.
- `npm run analyze` was not used. Correction: 4 pair WAVs exist in `fixtures/tonepairs/wav/` (missed in the first pass, which only looked in `fixtures/captures/`); the measured contour fixtures were used instead.
- Nothing in `src/pitch/`, the classifier, scoring, tuning or golden snapshots changed.

## Needs Pierre's eyes
- Choose fix 1 and/or 2. Fix 3 is a separate brief.
- Foorgol's answers to the questions above.

## Follow-ups
- More pair WAV captures (only 4 words exist, in `fixtures/tonepairs/wav/`; a few per combo, both styles), so the pair read can be checked against audio, not only stored contours.
- 3+3 is said as 2+3; any "right/wrong" colour for pairs must compare against `spokenTones`, not written tones.
