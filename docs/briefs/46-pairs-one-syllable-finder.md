---
status: blocked  # draft: waits for Pierre's approval of the Phase B plan
notion_task:
risk: needs-approval
---
# 46 Pairs: one shared way to find the syllables

## Goal
Today three places find syllables in three ways: the clip pipeline (voicing, then a loudness dip), the game (none needed), the Visualiser and public page (silence over 150 ms only; right on 55% of Jane's textbook pairs and 2% of her natural pairs). Make one function that all three use.

## Read first
- `docs/briefs/refs/39-handover.md` (every entry) and `docs/briefs/refs/39-phase-b-plan.md` ("Rules for every brief", "What one ruler means").
- `src/dev/bench39/README.md`.
- `src/dev/clipCutMulti.ts` (the loudness-dip split), `src/game/freeAttempts.ts`, `src/game/visualiserCore.ts`, `src/site/checker/engine.ts`.

## Do
1. First measure, change nothing: on the 411 pairs (and the 34 longer words), find the true boundary by hand-free means: the pipeline's own `syllableSpans` from `shapes-v2.json`. Then test these splitters on the live tracker's frames (pitch, loudness, voiced flag): (a) silence only (today); (b) silence or loudness dip; (c) silence or loudness dip or a sharp pitch reset. Report: split into the right count %, boundary error in ms.
2. Pick the simplest splitter that passes. Put it in one pure module (no Web Audio, no React) that takes frames with time, pitch, loudness and voiced flag, plus the expected syllable count when a target word is known.
3. Use it in the Visualiser and public-page pair read, and in the clip pipeline. The pipeline's shapes must not move by more than 0.05 chao; if they do, keep the pipeline on its own code and say so.
4. Frames need loudness: carry `rms` on the trail points (it is already on `PitchState`).
5. When the splitter does not find the expected count, the read is "?" for the word (hard rule 8), not a wrong tone.

## Acceptance checks (`npm run bench`, live tracker contours)
- Split into the right number of syllables: textbook ≥ 95%, natural ≥ 85%.
- Both tones right, of all pairs: textbook ≥ 75%, natural ≥ 60%. (Stretch numbers; if the splitter passes and the reader is the limit, report the per-syllable reader accuracy and stop. Do not tune the reader here.)
- Wrong-tone reads on pairs that were not split correctly: 0 (they must be "?").
- `npm run test`, `npm run typecheck`, build + grep.

## Report back with
- The splitter comparison table. The combos that still fail. Handover entry.
