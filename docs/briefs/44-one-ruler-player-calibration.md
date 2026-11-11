---
status: blocked  # second run: a perfect learner still fails the reader acceptance (natural 91.0 → 78.2, limit 3 points); see report
notion_task:
risk: needs-approval
---
# 44 One ruler for the player: short calibration and a grid that learns

## Goal
The player's grid is built by the same rule as Jane's: middle of the voice, one half up, one half down. Calibration measures only the middle. The halves start at a standard size and then follow what the player really does, slowly. Nobody is asked to reach.

**Strong-model review required.**

## Read first
- `docs/briefs/refs/39-handover.md` (every entry) and `docs/briefs/refs/39-phase-b-plan.md` ("Rules for every brief", "What one ruler means").
- `src/dev/bench39/README.md`.
- `src/ui/Calibration.tsx`, `src/game/run.ts` (`voicedByTone`, `suggestedRange`), `src/pitch/calibration.ts`, `src/game/settings.ts`, `src/game/recalibration.ts`, `docs/DECISIONS.md` (search: calibration, reach, 29 Aug).

## Do
1. **Standard halves.** Take them from data, not from this brief: Jane's ruler (brief 43) and Pierre's range (brief 41). Put them in `tuning()` (`gridUpSemitones`, `gridDownSemitones`). If the two voices differ by more than 2 semitones in either half, stop and report; the fallback step in point 5 is then needed from the start.
2. **Middle.** Measure it on tone syllables, not on free talk (Phase A: Jane's two styles differ by 1.4 semitones). Simplest form: the player repeats two or three short words after the example, with no grid and no target shape on screen. Middle = median pitch of those syllables.
3. **Learning in play.** Pure function in `src/pitch/calibration.ts` (no Web Audio): after each heard gate, update a running estimate of the player's middle, top (95th percentile) and bottom (5th percentile) from their voiced semitones, creak and clamped frames left out. Move the grid toward the estimate by a small share per gate (tunable), never by more than a set step per run, and never outside hard limits (each half 3–10 semitones). Start values and rates in `tuning()`.
4. **Rule 8.** An unheard gate teaches nothing. A gate that hit a wall still counts as voice data (the player's voice is real even when the tone was wrong).
5. **Fallback.** Keep the existing top/bottom flight available behind a tuning flag, for the Lab comparison and in case point 1 fails.
6. **Settings.** New settings version. An old record seeds the new one (middle and halves carried over, marked "not yet learned"); no forced recalibration unless the record is unusable.
7. **Offline proof.** A bench script that plays Jane's clips (and Pierre's, if present) as a run of gates through the learning function, from three bad starts: middle 2 semitones too low, 2 too high, halves 30% too small.

## Constraints
- Hard rule 6 (all new numbers in `tuning()`), hard rule 12 (numbers only, stored on the device as today; no new upload).
- The new behaviour is on in dev together with the shapes switch from brief 43. Production defaults do not change until brief 48: gate it with one tuning flag, default off.

## Acceptance checks
- Offline proof: from each bad start, after 20 gates the grid is within 1 semitone of the true ruler (middle, top, bottom), and it stays within 1 semitone over the next 100 gates (no drift).
- Reader on the scorecard after learning from a "2 semitones lower" start: single tones right % within 3 points of "as calibrated" (today it falls from 89% to 55% on natural).
- Same clip order twice gives the same grid (deterministic).
- With the flag off, every existing test passes unchanged.
- `npm run test`, `npm run typecheck`, `npm run bench`, build + grep.

## Report back with
- The chosen standard halves and where they came from. The learning curves (grid error per gate). What the player sees in the new calibration, step by step. What Pierre must fly in the Lab. Handover entry.
