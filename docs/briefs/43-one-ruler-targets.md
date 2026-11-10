---
status: blocked  # second run (textbook anchors): step 4, older vs newer T3 end 0.56, T2 low 0.30 (limit 0.3). See reports/43-one-ruler-targets.md
notion_task:
risk: needs-approval
---
# 43 One ruler for the targets (local shape file, dev-only switch)

## Goal
Measure every target shape again with the final listener and **one map for all of Jane's tones**, write the result to a local file, and let the dev build fly those shapes. Production data is not touched.

## Read first
- `docs/briefs/refs/39-handover.md` (every entry) and `docs/briefs/refs/39-phase-b-plan.md` ("Rules for every brief", "What one ruler means").
- `src/dev/bench39/README.md`.
- `src/dev/clipCut.ts`, `src/dev/clipCutMulti.ts`, `src/dev/clipNormalize.ts`, `src/dev/process-clips.ts`, `src/data/words.ts`, `src/data/catalogRows.ts`.

## Do
1. **Jane's ruler.** From all her textbook clips (final listener, creak left out): middle = median pitch; top half = 98th percentile; bottom half = 2nd percentile, in semitones from the middle. Print them. Check: with this ruler her first tone must land between chao 3.8 and 4.4 and her fourth-tone start between 4.6 and 5.0. If not, stop and report (do not tune the percentiles to hit the numbers).
2. **Measure.** A new dev script `src/dev/bench39/make-shapes.mjs` (or a `--local` mode of the pipeline code; no Supabase client may be opened): for every word and both styles, cut and measure with the existing `cutClip` code, map with Jane's one ruler (`semitonesToChao`), no per-tone stretch (`clipNormalize` is not used). Natural clips use the **same** ruler as textbook.
3. **Gate per clip.** Measure with a noise floor set from the clip itself (10th percentile of its frame loudness, at least 1e-4), not the fixed 0.0033. Report how many shapes this changes.
4. **Shapes.** Single syllables keep `templateContour` (2–4 points), heights now real. The first tone stays flat at its own mean. Multi-syllable words keep the existing polyline fit.
5. **The 120 older single tones** have no cut clip on disk. Their raw takes are in `fixtures/recordings/2026-08-07-xujzgs/`. Cut them with the same code. Check 5 of them against the published `onset_s` / `duration_s` (within 25 ms); if they differ more, stop and report.
6. **Output:** `src/dev/local/shapes-v2.json`: per style, per word id: `polyline`, `contour`, `onset_s`, `duration_s`, plus Jane's ruler. Commit it (numbers only, no audio).
7. **Dev switch.** In `src/data/words.ts` only: when `import.meta.env.DEV` and `localStorage["ft.shapesV2"] === "1"`, replace each word's shape fields from the local file after the catalog loads (live and fallback path). Gate at the usage site so the JSON and the code are not in `dist/`. Add `shapes-v2` to the hard rule 7 grep list in the report.
8. `DEFAULT_POLYLINES` and `toneAverages` are **not** changed here (brief 45).

## Constraints
- No write to Supabase, R2 or the Worker. `process-clips` may be run only with `--dry-run`.
- With the switch off, the app is byte-for-byte the same in behaviour: all existing tests pass unchanged.

## Acceptance checks
- `heights.mjs` against the new shapes, with Jane on her own one ruler: gap between what she said and her target ≤ 0.20 chao (median) for every tone and for pairs (today 0.14–0.60); shape match ≥ 0.96 (median); her frames inside her own corridor ≥ 99% (median) and ≥ 90% at the 10th percentile.
- First-tone targets: median level 3.8–4.4. Fourth-tone start above the first-tone level.
- Every published word and style has an entry (count them against the catalog; list any gap).
- `npm run build`, then the grep for `shapes-v2`, `ft.shapesV2`, `bench39` and the hard rule 7 strings prints nothing.
- `npm run test`, `npm run typecheck`, `npm run bench` (Jane's listener numbers unchanged).

## Report back with
- Jane's ruler. A per-tone table old target vs new target (start, low, high, end). The 20 words that moved most. How to turn the switch on. Handover entry.
