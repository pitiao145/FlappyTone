# Report: 37 Visualiser: tone pairs need a much deeper start than the game (investigate)
- Result: done (diagnosis only; no code or tuning changed)
- Branch: `research/37-visualiser-pairs-deep-start`

## Short answer
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
- `npm run analyze` was not used: there are no pair WAVs in `fixtures/captures/` (singles only). The measured contour fixtures are the real pair data we have.
- Nothing in `src/pitch/`, the classifier, scoring, tuning or golden snapshots changed.

## Needs Pierre's eyes
- Choose fix 1 and/or 2. Fix 3 is a separate brief.
- Foorgol's answers to the questions above.

## Follow-ups
- Pair WAV captures in `fixtures/captures/` (a few per combo, both styles), so the pair read can be checked against audio, not only stored contours.
- 3+3 is said as 2+3; any "right/wrong" colour for pairs must compare against `spokenTones`, not written tones.
