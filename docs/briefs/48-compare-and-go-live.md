---
status: done
notion_task:
risk: needs-approval
---
# 48 Compare with production, go-live steps, and the docs

## Goal
Pierre compares the new foundation with the production game and decides. If yes: one controlled switch, with a way back.

## Read first
- `docs/briefs/refs/39-handover.md` (every entry) and `docs/briefs/refs/39-phase-b-plan.md` ("Rules for every brief", "What one ruler means").
- `src/dev/bench39/README.md`.
- Every report from briefs 40–47. `docs/ARCHITECTURE.md` (migration steps, clip catalog), `docs/PRD.md` §5–§7.

## Do
1. **Compare.** A Lab toggle "old foundation / new foundation" that flips the shapes switch (43), the grid flag (44) and the reader flag (45) together. A one-page checklist for Pierre: 10 words to fly in both modes, and what to look for (first tone height, fourth-tone start, natural third tone, pairs, a deliberately low voice).
2. **Scorecard summary.** One table: every scorecard number, production vs new.
3. **Go-live plan, written, not run:** (a) back up `word_clips` shape columns to a dated file; (b) write the new shape numbers (script, dry-run first, row counts and three spot checks); (c) `export-fallback`; (d) flip the tuning defaults; (e) remove the dev switch and the old per-tone stretch (`clipNormalize`) or mark it dead; (f) roll-back steps. Fix the `meta.reference` field on textbook rows in the same write.
4. **What players will notice**, in plain words, for a release note: first tone lower, fourth tone starts at the top, a new short calibration, stats before and after are not directly comparable.
5. **Stats.** Say how accuracy history and the leaderboard are affected and propose one option (for example a marker on the date of the change). Do not change server data.
6. **Public copy.** List every place that draws or says "5-5" for the first tone (tone visualizer textbook line, `/chinese-tones`, landing). Propose keep or change for each; Pierre decides.
7. **Logging proposal** (not built): session noise floor, share of frames heard, the learned grid. Derived numbers only; the privacy-policy lines it needs.
8. **Docs.** Update `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `docs/DECISIONS.md` and CLAUDE.md so each row of `39-rules-review.md` is closed: fixed, re-tested true, or still unproven with the reason.

## Constraints
- **Ask Pierre before any database write, deploy or push.** Steps 3(a)–(f) run only on his explicit yes, in a later session.
- Pierre checks UI himself.

## Acceptance checks
- The Lab toggle flips all three together; with it off, all tests pass as on `main`.
- The go-live script's dry-run prints the row count and changes nothing (show the output).
- Every row in `39-rules-review.md` has a final state.
- `npm run test`, `npm run typecheck`, `npm run bench`, build + grep.

## Report back with
- The comparison table, the checklist, the go-live plan, open decisions for Pierre. Final handover entry.
