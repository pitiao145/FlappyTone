---
status: done  # strong-model review required; flag off in production
notion_task:
risk: needs-approval
---
# 45 Tone reader and tone accuracy on the new ruler

## Goal
The reader (classifier v2) and the tone-accuracy score were fitted to the old targets, the old grid and the old 40 ms smoothing. Fit them again to the new ones, and make them lean less on absolute height.

**Strong-model review required.**

## Read first
- `docs/briefs/refs/39-handover.md` (every entry) and `docs/briefs/refs/39-phase-b-plan.md` ("Rules for every brief", "What one ruler means").
- `src/dev/bench39/README.md`.
- `src/game/toneClassifierV2.ts`, `src/game/toneAccuracy.ts`, `src/game/toneAverages.ts`, `src/dev/make-tone-averages.ts`, `src/dev/classifier-check.ts`, `docs/TESTING.md`, memory note "Cue classifier guard lost".

## Do
1. Rebuild the baked averages and `DEFAULT_POLYLINES` from `shapes-v2.json` (behind the same flag as brief 44, so production values stay until brief 48).
2. List every threshold that is an absolute height (`toneV2T1MinChao`, `toneV2T4MinPeakChao`, the `low` anchors, `toneAccHeightZeroChao`, others you find). For each: can it be replaced by a height **relative to the utterance or to the player's learned grid**? Change only those where the scorecard improves or holds.
3. Fit the remaining thresholds on Jane's contours from the final listener, with a held-out split (fit on half of the clips, report on the other half).
4. The height part of tone accuracy stays, with its weight reviewed: report accuracy for Jane with the weight at today's 0.15 and at 0.

## Constraints
- Hard rule 8: a read that is unsure stays "none" or not decisive. It never costs a heart.
- Score and tone accuracy stay two numbers.
- Only Jane's data may set thresholds. Pierre's recordings are a check, not a training set (one learner is not a population).

## Acceptance checks (held-out half, `npm run bench`)
- Single tones right %: textbook ≥ 97, natural ≥ 89 (today 98 / 89) as calibrated.
- With the voice 2 semitones lower and **no** grid learning: natural ≥ 80 (today 55). With learning from brief 44: within 3 points of as-calibrated.
- With a grid 30% too narrow: second tone ≥ 70 (today 21–29).
- Jane's tone accuracy score on her own clips: median ≥ today's value on the old system (report both).
- `npm run classifier-check`: wall hits on a correct speaker stay 0.
- `npm run test`, `npm run typecheck`, build + grep. List the golden snapshots that moved.

## Report back with
- The threshold table (old → new, absolute or relative). The confusion table per tone. Pierre's syllables as a check. Handover entry.
