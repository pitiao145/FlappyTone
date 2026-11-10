---
status: done  # draft: waits for Pierre's approval of the Phase B plan
notion_task:
risk: low
---
# 41 Pierre's voice: intake, and the first male learner numbers

## Goal
Put Pierre's own recordings on the bench. Answer two questions with numbers: does the listener hear a male learner as well as it hears Jane, and is a standard-size grid close to his real range?

## Read first
- `docs/briefs/refs/39-handover.md` (every entry) and `docs/briefs/refs/39-phase-b-plan.md` ("Rules for every brief").
- `src/dev/bench39/README.md`.

## Needs from Pierre (before this brief can run)
Recorded in the booth (`/record`) or as WAV, quiet room, saved under `fixtures/captures/pierre/` (gitignored):
- 10 s of normal talk; 5 s of silence;
- the four tones on `ma`, `yi`, `shu`, two times each;
- 你好, 好玩, 可能, 幫忙, 工人, 牛奶, 對面, 媽媽, two times each, said naturally;
- one normal run of the app's calibration, and the saved numbers (centre, both range values, noise floor, voice loudness) copied into `fixtures/captures/pierre/calibration.json`.
File names: `pierre_<pinyin><tones>_<take>.wav`. If the files are missing, set `blocked` and stop.

## Do
1. Add the set `pierre` to `praat-ref.py` and to the scorecard as its own block (not part of Jane's baseline).
2. Report for his voice: median pitch; lowest and highest per tone (semitones from his median); share of Praat frames under 70 Hz and under 55 Hz; voice heard %; pitch error and delay; creak share and what the tracker does in creak.
3. Compare his real range (5th to 95th percentile of his tone syllables, creak left out) with: (a) his saved calibration, (b) a standard grid with Jane's halves from the handover (+8.8 / −7.9 semitones) around his talk median, (c) the same around the median of his tone syllables. Give the gap at the top and at the bottom in semitones for each.
4. Run his single tones and pairs through the current reader on (a), (b) and (c). He is a learner: also list the syllables where Praat itself shows a shape that is not the intended tone, so the reader is not blamed for them. Do not judge his pronunciation beyond that.

## Constraints
- Dev scripts only. His audio stays local and is never committed or uploaded.

## Acceptance checks
- The `pierre` block prints in `npm run bench` and does not change Jane's PASS/FAIL.
- The report has the three-way grid table from step 3.
- `npm run test`, `npm run typecheck`, build + grep clean.

## Report back with
- The numbers above, a clear line "standard grid fits / does not fit" with the size of the miss, and what brief 42 and 44 must take from it. Handover entry.
