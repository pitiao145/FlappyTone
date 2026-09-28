# SPEC A — Tone accuracy (separate from game score)

**Status:** ready to build. First of three specs (A → B → C). B
(`flappytone-SPEC-player-tone-average.md`) and C
(`flappytone-SPEC-pro-run-history.md`) depend on this one.
**Branch:** `feat/tone-accuracy` (already holds the `make-tone-averages` fix).
**Suggested model:** Opus, high effort — this is signal-shape judgment work.
Read CLAUDE.md's Testing section first: you cannot hear, verify with fixtures.

## 1. Why

Today one number does two jobs. A gate's "accuracy" is the corridor error
(`scoreGate`, `src/game/scoring.ts`): the bird's mean distance from the
corridor centre ÷ tolerance, on the gate's own clock. That is right for a
**game score** — early, late, or a wall hit should cost points. It is wrong
for **learning**: a correct tone said 150ms early scores low, and a wall hit
scores 0 even when the shape was correct.

Product direction (Pierre, 28 Sep 2026): the product teaches tones; the game
is a wrapper. So **score** and **tone accuracy** become two separate numbers.

| | Score (unchanged) | Tone accuracy (new) |
|---|---|---|
| Question | Did you fly the tunnel on time? | Did your voice make the right tone shape? |
| Clock | The gate's | The player's own utterance |
| Wall hit | 0, heart lost | Still measured |
| Feeds | points, combo, hearts, Perfect/Good/OK, leaderboard | per-tone/per-combo stats, coach card, visualiser, trends (C), player averages (B) |

**The score does not change.** `scoreGate`, `applyClassifierBoost`,
`isDrasticToneMismatch`, Perfect/Good/OK and points stay as they are.
Perfect/Good/OK stay score-only; tone accuracy shows as a plain percentage.

## 2. The algorithm

New pure module `src/game/toneAccuracy.ts` (no Web Audio, no React).

Input: the gate's utterance contour (voiced points in chao, `tMs`), the
target (`tone` for a single syllable, `tones` for a pair).
Output: `number` in 0..1, or `null` when the gate was unheard.

1. **Align (timing-free).** Reuse the classifier's `trimOnset` + `resample`
   (`src/game/toneClassifier.ts`) — export them rather than copy. N = 16
   points per syllable (so 32 for a pair). Only the player's utterance span
   counts: early/late inside the gate does not matter. Pairs: **simple even
   stretch** over the whole word first. Flexible alignment (banded DTW) only
   if the Lab shows a need.
2. **Reference.**
   - Single tone: `AVERAGED_TONE_SHAPE[tone]` (Jane's per-tone average),
     resampled to N.
   - Pair: the **average of all published clips of that exact combo** (e.g.
     every `3+2` word), built by the same generator as the per-tone average
     (extend `src/dev/make-tone-averages.ts` to emit
     `AVERAGED_PAIR_SHAPE: Record<ComboKey, number[]>` keyed by
     `toneComboKey`). **Textbook style only** — that is all the bundle holds
     today. Use a combo even with 1–3 clips (Pierre's call). **Combos with a
     neutral (0) syllable are left out** of pair accuracy for now:
     `toneAccuracy` returns `null` for them, and they are not stored.
3. **Compare.** Three parts, each 0..1:
   - **Shape (weight 0.60):** correlation of player vs reference, clamped at 0.
   - **Movement size (0.25):** ratio of ranges (player max−min over reference
     max−min), capped at 1 above; a too-big movement also loses a little
     (e.g. `min(r, 1/r)`). A near-flat attempt on a moving tone must score
     **near 0 overall** (Pierre: "near 0", not partial credit) — so if the
     player's range is below a small threshold on a tone that moves, return a
     near-zero accuracy regardless of correlation (correlation of a flat,
     noisy line is meaningless).
   - **Height (0.15):** mean absolute chao difference, mapped 0 → 1,
     ~1.5 chao → 0 (tune in the Lab).
   - **Tone 1 is special:** it has no shape. Judge it on **flatness + height
     only** (reuse the classifier's tail-flatness idea), no correlation.
4. **Result** = weighted mix → 0..1. All weights/thresholds are fields on
   `tuning()` (hard rule 6), defaults = the values above.

`null` rules: unheard gate (same `heardUtterance` rule as today), neutral
combo, or fewer than 2 voiced points.

## 3. Reference refresh (do first)

`npm run make-tone-averages` now works (it was broken: bundle rows lack
`speaker_id`; fixed in commit `0811d6a`). Running it moves the averages from
120 words to 211 single-syllable clips (T1 44, T2 47, T3 52, T4 68): T1's level
4.51 → 4.60, T2/T3 start ~0.1 chao lower, T4 starts higher. It was held back
because **two classifier tests then fail** (`toneClassifier.test.ts`: the
"large spurious onset swing" and "hold-then-rise T3" cases read `"none"`
instead of `2`). This affects the live game (boost + mismatch collision).
So in this slice: regenerate, then re-check the classifier thresholds in the
Lab and fix or re-baseline those tests with a stated reason. Do not silently
loosen thresholds to make them pass.

Also pre-existing and unrelated: `tiers.test.ts` fails on `main`
(`pairWordsPerCombo` is 10, test expects 5). **Decided: 10 is correct** — update the test.

## 4. Where it runs — every mode

Pierre: every mode is practice, so tone accuracy is measured **everywhere**:
`game`, `pairs`, `drill`, `single`, `learn`, `tutorial`, and the visualiser.

- `src/game/run.ts`: compute `toneAccuracy` per gate next to the score
  accuracy, and put it on the gate log entry.
- `src/ui/Visualiser.tsx`: **replace** the current accuracy readout with tone
  accuracy (same function). The "sounds like Tone X" classifier readout stays.

## 5. Stats

- `RunStats` (`scoring.ts`): per-tone stats sum **tone accuracy**, not
  corridor accuracy. Add `perCombo: Record<ComboKey, { gates, accSum, best }>`
  for pair gates (non-neutral combos). Pair gates still do **not** count in
  per-tone stats (separate, Pierre's call).
- Mismatch counts (`mismatched`, `mismatchedAs`) stay as they are.
- `runHistory.ts`: `lastRuns` entries and `lifetimePerTone` store tone
  accuracy; add per-combo equivalents.
- **Old data: reset (decided).** The stored numbers change meaning, so
  per-tone stats start from zero: local `lastRuns` per-tone and
  `lifetimePerTone` (bump or migrate the store so old values are dropped,
  not mixed in), and server `tone_stats` (migration that clears the rows, or
  a versioned reset the sync understands — make sure merge-by-max cannot
  pull old server values back into a reset device). Run counts, best score,
  streak and word ids are NOT reset.
- Analytics: add `toneAcc` to the `gate` event (closed union in
  `session.ts`, rule 1 — review the addition).

## 6. Screens

Pause menu (`PauseMenu.tsx`) and game over (`GameOver.tsx`):

- **Show only what was played this run.** A tone or combo with 0 scored
  gates does not render (today it shows "—").
- Two groups: **"Tones"** (T1–T4 tiles as today) and **"Tone pairs"**
  (compact list: combo label with per-syllable tone colours, bar, %), sorted
  **weakest first**, capped at 4 with a "show all" toggle.
- Label it "tone accuracy" and keep it visually separate from the score so
  the two are not confused.
- The coach card stays single-tone for now. A weak-pair coach line comes
  after pair accuracy has been flown and trusted.
- Progress screen "Accuracy per tone" uses the new numbers; add a "Tone pairs"
  list in the same card when the player has pair data.

## 7. Verification

- Unit tests on `toneAccuracy.ts`:
  - Jane's own anchor takes (`fixtures/captures/jane_ma*.wav`) → high (≥ ~0.85).
  - The same take shifted early/late inside the gate → the same accuracy
    (this is the point of the change; today it drops).
  - A wrong-tone take against the target → low.
  - A flat line on T4 → near 0.
  - A pair fixture (`fixtures/tonepairs/`) against its combo average → high.
- Lab: a readout of score accuracy vs tone accuracy per gate, so Pierre can
  fly gates and compare before shipping. Tune weights there ("a value that
  has not been flown is not tuned").
- `npm run test`, `npm run typecheck`, `npm run build` + the dev-tooling
  grep (hard rule 7).
- Update CLAUDE.md, PRD §7, and add a DECISIONS.md entry ("score and tone
  accuracy are separate numbers").

## 8. Out of scope here

Player tone averages (spec B). Full run history and daily trend (spec C).
Natural-style references. Neutral-tone combos. Weak-pair coaching.
