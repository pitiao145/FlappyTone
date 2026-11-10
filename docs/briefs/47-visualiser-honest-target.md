---
status: blocked  # draft: waits for Pierre's approval of the Phase B plan
notion_task:
risk: low
---
# 47 Visualiser: an honest target, and no room re-measure on resize

## Goal
The Visualiser shows the same tolerance the game uses, so "inside" means the same on both screens. Two smaller defects are fixed.

## Read first
- `docs/briefs/refs/39-handover.md` (every entry) and `docs/briefs/refs/39-phase-b-plan.md` ("Rules for every brief", "What one ruler means").
- `src/dev/bench39/README.md`.
- `src/render/visualiser.ts` (`drawTarget`), `src/ui/Visualiser.tsx` (the effect near line 536–685), `src/game/gates.ts` (`corridorToleranceAt`).

## Do
1. Draw the target as a soft band of the game's corridor width (`toleranceChao` + `corridorToleranceAt`) with the centre line inside it. Colours from `src/ui/tokens.css`.
2. Room noise: create the session noise meter once per mic session, not inside the effect that re-runs on canvas size. A resize or rotation must not start a new measurement.
3. Time axis: measure first. Log (dev only) the gap between frame arrival times in the Visualiser on a desktop and, if Pierre can, on a phone. If more than 5% of gaps differ from the hop time by over 10 ms, stamp frames by counted audio time (frames × hop) instead of `performance.now()`. If not, change nothing and say so.
4. Pairs on real time: Jane's textbook pairs last 1.2–1.6 s. Add a dev-only toggle that stretches the player's attempt to the target's length when drawing, and report whether it reads better. Do not ship it without Pierre's view.

## Constraints
- Pierre checks the look himself. Do not screenshot or run Playwright to verify UI.
- No change to scoring.

## Acceptance checks
- Unit test: the band's half-width at t = 0, 0.5, 1 equals `corridorToleranceAt` for a first, third and fourth tone.
- Unit test: a size change does not create a second noise meter (count constructions).
- `npm run test`, `npm run typecheck`, build + grep.

## Report back with
- The arrival-time numbers and the decision. What Pierre must look at. Handover entry.
