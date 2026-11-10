---
status: blocked  # live natural T4 p90 0.44 vs handover 0.37–0.38; see reports/40-pitch-scorecard-and-rules-review.md
notion_task:
risk: low
---
# 40 Pitch scorecard with Praat, baseline numbers, and the rules review

## Goal
One command that says pass or fail for the pitch foundation, with Praat as the answer sheet. A table of every pitch claim in the repo docs, marked true, false or unproven. No production change.

## Read first
- `docs/briefs/refs/39-handover.md` (every entry) and `docs/briefs/refs/39-phase-b-plan.md` ("Rules for every brief").
- `src/dev/bench39/README.md`.

## Do
1. Add `npm run bench` → `node src/dev/bench39/scorecard.mjs`. It uses the Praat reference (`praat-ref.py` cache; fail with a clear message if the cache is missing) and prints one line per number, with the baseline value and PASS/FAIL. It exits non-zero on any FAIL. Reuse `tracks.mjs`; do not copy code from `eval.mjs`.
2. Numbers on the scorecard (per style, per group T1–T4 and pairs, live settings unless noted):
   - pitch error vs Praat, median and 90th percentile, as drawn and with the delay removed;
   - delay in ms (best fit, 10 ms steps);
   - voice heard % (all, first third, last third);
   - frames drawn as voice where Praat is silent %;
   - low end lost and high end lost, semitones, median and 90th percentile;
   - the same pitch error for the clip-pipeline settings;
   - deep-voice stand-in (pitch factor 0.5 and 0.6): frames under the band %, low end lost;
   - gate at 40% of voice: T4 last third heard % (noise is out of scope, but this must not get worse);
   - reader: single tones right % (as calibrated, and voice 2 semitones lower); pairs split in two %, both right %;
   - targets vs said (`heights.mjs`): gap in chao and shape match, per tone.
3. Write the current values to `docs/briefs/refs/39-baseline.json` (`node src/dev/bench39/scorecard.mjs --write-baseline`). Tolerance per number: state it in the file (default: error and loss may not rise by more than 0.02 semitone or 1 percentage point).
4. Cache tracker runs so a full scorecard takes under 3 minutes on a second run. Print the time.
5. Rules review: write `docs/briefs/refs/39-rules-review.md`. One row per pitch, voicing, calibration, corridor, template or scoring claim in `CLAUDE.md`, `docs/PRD.md` §5–§7, `docs/TESTING.md`, `docs/ARCHITECTURE.md` (tone sections) and the comments in `src/pitch/`, `src/game/tuning.ts`. Columns: claim (quoted, with file:line) | TRUE / FALSE / UNPROVEN | evidence (bench number or file:line) | which brief fixes or re-tests it. Start from Phase A report section 10.
6. Fix only the doc claims that are FALSE as plain facts today (for example `docs/TESTING.md` "44.1 kHz"; the fixture inventory). Do not change rules that a later brief owns; mark them in the table.

## Constraints
- No edit under `src/pitch/`, `src/audio/`, `src/game/`, `src/ui/`, `src/site/`. Dev scripts and docs only.
- CLAUDE.md is edited only for false facts; show the diff in the report for Pierre.

## Acceptance checks
- `npm run bench` exits 0 on a clean tree and prints all numbers listed above.
- Change `clarityThreshold` to 0.9 locally (do not commit): `npm run bench` must FAIL. Revert. Say in the report which lines failed.
- The pitch-error and delay numbers match the handover entry "Phase A + Praat check" within 0.02 semitone / 10 ms.
- `npm run test`, `npm run typecheck`, `npm run build` + hard rule 7 grep (also for `bench39`) are clean.

## Report back with
- The scorecard output. The rules table. The list of doc lines changed. Handover entry.
