---
status: done
notion_task: https://app.notion.com/p/41335e5140dd8191a5a8fa4557af7892
risk: needs-approval
---
# 37 Visualiser: tone pairs need a much deeper start than the game (investigate)

## Goal
Find out why a user's calibration "feels right" in the flying game but tone pairs in the Visualiser training mode are "almost impossible" unless they start with a much deeper voice. This brief is **diagnosis only**: reproduce, name the root cause, propose a fix. Do not change behaviour yet.

User report (Discord, 9 Nov, Foorgol): "calibration works good for the actual playing part, but not at all for the visualizer. Trying to get tone pairs right in the training mode is almost impossible because I would have to start with a much deeper voice than in the game." Single tones not mentioned. Device/browser/pairs unknown yet (Pierre is asking).

## Context / files to read first
- CLAUDE.md hard rules 3, 5, 6, 8, 14; docs/ARCHITECTURE.md "Three entries, not one app", "Tone pairs"; docs/TESTING.md.
- docs/briefs/reports/21-visualiser-multisyllable-gap.md (shared core, pair gaps, per-syllable reads).
- src/ui/Visualiser.tsx (calibration is passed in around lines 535-550 and 788-791), src/game/visualiserCore.ts, src/render/visualiser.ts, src/pitch/calibration.ts, src/game/settings.ts, src/game/tuning.ts.
- The game side for comparison: src/game/loop.ts, src/render/scene.ts, how pair gates place their corridors.
- The public /tools/tone-visualizer (src/site/...): does it use the saved calibration at all, or a default f0Center? The user may have been on either.

## Questions to answer
1. Is the same f0Center / rangeSemitones / rangeDownSemitones actually in effect in the app Visualiser and the public page as in the game, at run time (not just passed as props)?
2. How does the Visualiser map semitones to screen height and place the pair target line, versus the game's pair corridor? Any difference in vertical centre, range, or where syllable 1 starts (e.g. a pair target anchored high so a T3/T4 start needs a lower voice)?
3. Do pairs use different targets/contours from single tones in the Visualiser? Do single tones show the same offset?
4. Is it the drawing (line sits too low/high) or the reading (per-syllable pair read says wrong) that fails?

Use `npm run analyze fixtures/captures/jane_*.wav <f0Center>` and the pair fixtures to show the same recording on both mappings with numbers (semitones where the target starts vs where the voice starts).

## Constraints
- No code or tuning changes in this brief. Throwaway scripts/tests for measurement are fine; do not commit them unless they are a real failing test that pins the bug.
- Do not touch src/pitch/, the classifier, scoring or golden snapshots.
- Never push or deploy. Ask before adding a dependency.

## Acceptance checks
- Root cause stated with evidence (file:line + measured numbers), or "not reproduced" with what was checked.
- `npm run test` and `npm run typecheck` still pass.

## Report back with
- Root cause, which surface(s) affected (app Visualiser, public page, both), single tones vs pairs.
- Proposed fix (1-2 options, smallest first), what it would move (golden snapshots? game untouched?), and its risk.
- What to ask Foorgol to confirm it, if anything is still unclear.
