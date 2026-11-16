# Report: 48 Compare with production, go-live steps, and the docs
- Result: **blocked at step 4** (16 Nov 2026). Steps 1–3 done. Steps 4–8 not started.
- Why: a premise of step 4 is false. The brief says the release note must say "first tone lower". MEASURED: the first-tone targets do not get lower (below). This phrase comes from the withdrawn "first tone near 4" plan (handover, "43 second run"; plan doc decision 2, revised 11 Nov 2026).

## Why blocked (MEASURED)

Command: a one-off `node -e` over `src/data/wordsFallback.json` (production textbook shapes) and `src/dev/local/shapes-v2.json` (new), single-syllable words, median over words, chao.

| tone | words | mean height | start | highest point | lowest point | end |
|---|---|---|---|---|---|---|
| first | 44 (30 with the shared lift) | 4.54 → **4.55** | 4.54 → 4.55 | 4.54 → 4.55 | — | — |
| second | 47 | 3.17 → 2.82 | 2.89 → 2.37 | 5.00 → 5.00 | 2.13 → 1.73 | 5.00 → 5.00 |
| third | 52 | 2.55 → 2.32 | 3.40 → 2.76 | 5.00 → 4.50 | 1.42 → 1.08 | 5.00 → 4.50 |
| fourth | 68 | 3.36 → 3.07 | 4.27 → **5.00** | 4.78 → 5.00 (at t 0.19 → 0.00) | 1.29 → 1.15 | 1.32 → 1.15 |

- First tone: no change in chao. In Hz on Jane's two grids it is about 0.4 semitone *higher* (old board 181.3 Hz middle, top 7.1 st up: 4.55 ≈ 249 Hz; ruler 197.4 Hz, top 5.75 st up: 4.55 ≈ 255 Hz). ASSUMED arithmetic from the stored ruler numbers.
- The player's top line is their own first-tone height (p90) in both foundations (plan doc, "What one ruler means"; READ IN CODE `computeRangeHalvesFromExtremes`). So for a player the first-tone target does not drop either.
- What does change, in plain words: the fourth tone starts at the top at once (true, as the brief says); the second and third tones start lower and dip deeper; the third tone ends lower (4.5, not 5).

Decision for Pierre: what the release note says about the first tone. Options: (a) drop "first tone lower" and say "first tone: no change"; (b) keep it only if you mean something I did not measure (for example how it feels in flight); (c) something else. Step 6 (the "5-5" copy list) also leans on this: if the first tone stays near 5, "55" copy stays true.

## Step 1 — Compare: Lab toggle and checklist (done)

### What changed
- `src/dev/shapesV2.ts`: `foundationOn()`, `setFoundation(on)`. One call sets the `ft.shapesV2` switch (shapes, brief 43) and `tuning().playerRulerV2` (grid, brief 44, and reader + tone accuracy, brief 45; both read that one flag, READ IN CODE `toneClassifierV2.ts` `readerSettings`, `toneAccuracy.ts` `averagedShapes`, `gates.ts` `shapeForTone`).
- `src/dev/TuningPanel.tsx`: "Foundation (brief 48)" row at the top of the Lab's tuning panel: buttons "Old foundation" / "New foundation", shows which is on, reloads the page (the shapes are swapped when the catalog loads). "Reset all" and presets keep `playerRulerV2` equal to the switch, so the three never split.
- `src/dev/foundation.test.ts` (3 tests): off by default (old shapes, `playerRulerV2` false, old reader set); on → all three on (`ma1b` polyline changes); off again → all three off.
- Dev only: `TuningPanel` is already gated at its usage site. Build grep: "Old foundation", `ft.shapesV2`, `shapes-v2` → no file in `dist/`.

### Checklist for Pierre (fly each word in both modes)

Before each mode: switch in the Lab (`npm run dev` from this worktree → title → `lab`), then calibrate once (the new mode adds the short "middle" step). Fly Standard (textbook) unless the line says natural.

| # | word | what to look for |
|---|---|---|
| 1 | 媽 mā (`ma1b`) | First-tone height. Is the line where your easy high note is, in both modes? |
| 2 | 八 bā (`ba1`) | One of the 30 older first-tone words with the shared lift. Same height as 媽 in the new mode? |
| 3 | 天 tiān (`tian1`) | Same check; a longer first tone. |
| 4 | 罵 mà (`ma4b`) | Fourth-tone start: new mode starts at the top line at once (old: starts at 4.3, peaks at 0.4 of the word). Can you reach it without straining? |
| 5 | 看 kàn (`kan4`) | Same, a different fourth tone. Does the fall end where your voice ends? |
| 6 | 麻 má (`ma2`) | Second tone starts lower in the new mode (2.4 vs 2.9). Does the low start feel natural? |
| 7 | 馬 mǎ (`ma3b`), **natural** style | Natural third tone (low, often no rise). Does the reader still call it third tone? Any wall hit? |
| 8 | 好 hǎo (`hao3`) | Textbook third tone: ends at 4.5 now (was 5). |
| 9 | 小時 xiǎoshí (`xiaoshi32`), and 公園 gōngyuán (`gongyuan12`) | Pairs: corridor join and the pair read. 公園 is the known "first tone read as fourth" case (blocker below). |
| 10 | 媽 mā and 馬 mǎ again, **deliberately low voice** (about 2 semitones under your normal) | New mode: after a few gates the grid should follow you down; old mode keeps the calibrated grid. Note wall hits in each. |

Write down per word: wall hits, the tone the end screen reads, and "feels right / too high / too low".

## Step 2 — Scorecard summary (done)

Full table, every number: `docs/briefs/reports/48-scorecard-production-vs-new.md` (made by `node src/dev/bench39/compare48.mjs`). Production = the brief 40 baseline (commit `0c05601`). MEASURED that `main`'s `src/pitch`, `src/game` reader and tuning are the same as at that commit (`git diff b84e69d main -- src/pitch src/game src/audio`: only clip-token and `words.ts` catalog changes). New = `npm run bench` now: 387 numbers, 0 FAIL. Rows: 27 same, 188 moved, 172 did not exist in production.

Headline rows (MEASURED):

| what | production | new |
|---|---|---|
| Line delay (all groups) | 40 ms | 20 ms |
| Fourth-tone error as drawn, worst 10%, textbook / natural | 2.55 / 2.58 st | 1.30 / 1.33 st |
| Fourth-tone error with delay removed, worst 10%, textbook / natural | 0.38 / 0.44 st | 0.25 / 0.28 st |
| Fourth-tone low end lost, worst 10%, textbook / natural | 1.07 / 2.09 st | 0.40 / 0.73 st |
| Voice heard, fourth tone, textbook / natural | 90.6 / 85.1% | 90.5 / 85.1% |
| Fake voice (voice where Praat hears none), fourth tone | 2.3 / 2.4% | 2.3 / 2.4% |
| Deep stand-in (half pitch), natural fourth tone, low end lost (median) | 3.28 st | −0.05 st |
| Gate at 40%: fourth-tone last third heard (noise, out of scope) | 46.5 / 41.3% | same |
| Reader, single words, calibrated, textbook / natural | 97.8 / 89.1% | old reader 98.9 / 91.0; ruler reader 100.0 / 91.2 (held-out half) |
| Reader, voice 2 st lower, no learning, textbook / natural | 92.3 / 55.0% | ruler 89.3 / 80.7 (held-out); with learning 98.2 / 91.2 |
| Pairs split in two, textbook / natural | 67.3 / 3.9% | 99.0 / 49.3% |
| Pairs both right, textbook | 55.3% | 74.0 old board / 69.7 ruler |
| Pairs both right, natural | 2.5% | 7.9 / 6.4% |
| Tone accuracy, Jane's own clips, median, textbook / natural | 0.77 / 0.70 | 0.84 / 0.79 |
| Target vs what Jane said (chao gap) T1 / T2 / T3 / T4 / pairs | 0.18 / 0.24 / 0.36 / 0.59 / 0.41 (old board) | 0.13 / 0.12 / 0.21 / 0.28 / 0.18 (ruler, brief 43 report) |
| Third tone right, grid too wide (×1.4), natural | — | 42.3% (review note 1, brief 45) |

Notes: the `heights.*` scorecard rows still measure the *production* shapes on the old board; the new-shape numbers above come from the brief 43 report (`heights.mjs --v2`), on the ruler. Ruler reader rows use the held-out half of the clips, production rows all clips.

## Step 3 — Go-live plan (written, not run)

Script: `src/dev/golive-shapes.ts` (`npm run golive-shapes`). Default is a dry run: it reads `word_clips` and `words.meta` for the default speaker and writes nothing. `--backup` writes a dated local file (`backups/`, gitignored) and nothing else. `--apply --from <backup>` refuses unless the backup's row count equals the live count; it UPDATEs only `polyline`, `contour`, `onset_s`, `duration_s` per (word, speaker, style) and `meta.reference` / `meta.references.jane` on textbook words. `--restore <backup>` writes the old values back.

### Dry run (MEASURED, run twice, identical output, no file written, `git status` clean of new files)

```
MODE: DRY RUN (reads only, writes nothing)
speaker jane; ruler 197.4 Hz, up 5.75 st, down 7.25 st
word_clips rows for jane: 949 (published 949: textbook 477, natural 472)
would update: 948 (textbook 477, natural 471)
kept as they are, no new shape: 1 (zhe0/natural)
kept, new shape does not fit the clip: 0
new shapes with no published row: 0
of the updates, carry the shared first-tone lift (re-record list): 30
words.meta.reference: 477 of 477 textbook words would change

spot check ma1b/textbook
  live: onset 0.232 dur 1.4767 line 0.00:4.68 1.00:4.68
  new : onset 0.232 dur 1.6043 line 0.00:5.00 1.00:5.00

spot check ma4b/textbook
  live: onset 0.232 dur 0.6447 line 0.00:3.09 0.40:4.99 1.00:1.72
  new : onset 0.232 dur 0.6874 line 0.00:3.30 0.22:5.00 0.90:1.43 1.00:1.21

spot check xiaoshi32/textbook
  live: onset 0.234 dur 1.7154 line 0.00:3.16 0.08:2.92 0.19:1.87 0.32:1.87 0.50:2.23 0.73:2.29 0.92:4.60 1.00:4.60
  new : onset 0.234 dur 1.6922 line 0.00:2.66 0.07:2.43 0.19:1.27 0.33:1.27 0.51:1.72 0.73:1.78 0.85:3.00 0.92:4.47 0.95:5.00 1.00:4.47

DRY RUN: nothing was written.
```

### Steps, each only on Pierre's explicit yes, in a later session

0. **Blockers first** (from the handover): (i) the 30 older first-tone words must be re-recorded (they now carry one shared +1.08 chao lift); (ii) brief 46's pair finder must not ship until a pair-reading brief fixes "first tone read as fourth tone at voiced joins"; (iii) 39% of natural pair cuts in the clip pipeline sit on an artefact, so natural pair shapes may join at the wrong place; (iv) merge `main` into this branch first: both sides changed `src/data/words.ts`.
1. (a) Backup: `npm run golive-shapes -- --backup` → `backups/word_clips-jane-<date>.json` (949 clip rows + meta rows). Keep a copy off the laptop.
2. (b) Dry run again; check the counts above still hold. Then `npm run golive-shapes -- --apply --from backups/word_clips-jane-<date>.json`. Three spot checks after: `ma1b`, `ma4b`, `xiaoshi32` in the Supabase table view.
3. (c) `npm run export-fallback`; then regenerate the copied shape data that tests pin to the fallback: `src/site/exampleClips.ts`, `src/site/sayClips.ts`, `npm run make-tone-averages` (the site's tone chart and checker read `toneAverages.ts`). `npm run test` must pass.
4. (d) Flip the defaults: `playerRulerV2: true` in `DEFAULT_TUNING`; `DEFAULT_POLYLINES` ← `DEFAULT_POLYLINES_V2`; `toneAverages.ts` ← the V2 averages.
5. (e) Remove the dev switch (`ft.shapesV2`, `applyShapesV2`, the Lab foundation row) and the old per-tone stretch in `src/dev/clipNormalize.ts` (or mark it dead). Move `process-clips` onto the one-ruler path (`make-shapes.mjs` logic: per-clip gate, ruler, knee templates, refined pair fit) **before any new clip is processed**; today it would publish new words on the old board.
6. Build + grep, `npm run bench`, `npm run classifier-check` (wall hits 0), Pierre flies, then deploy (his call).
7. (f) Roll back: `npm run golive-shapes -- --restore <backup>`, `npm run export-fallback`, redeploy the previous build. Player devices keep `toneflap.settings.v3` untouched (READ IN CODE `playerRuler.ts`: the ruler is a separate record), so the old build reads their old calibration as before.

`meta.reference` fix: textbook words get `{ session: "one-ruler-brief-43", f0Center: 197.4, rangeSemitones: 6.5, upSemitones: 5.75, downSemitones: 7.25, style: "textbook" }`. `rangeSemitones` 6.5 is the mean of the two halves, so `process-clips`' borrow fallback (READ IN CODE `process-clips.ts:405-432`, the only reader) still gets a valid number. Note: `meta` is per word, shared by both styles, so it cannot name the natural session and the textbook ruler at once.

## Steps 4–8 — not started

Facts found on the way, for the rerun (not a finished step):
- Public copy that says "55" for the first tone (READ IN CODE): `src/site/pages/ChineseTones.tsx:57` ("Chao numbers write it 55") and `:252` ("first tone = 55, …"); `src/site/pages/ToneVisualizer.tsx:691` ("Tone charts teach 55, 35, 214 and 51"). Drawn first-tone lines come from data, not hard-coded 5-5: `ToneChart.tsx` and the visualizer's textbook line (`toneRefs.ts`) draw `AVERAGED_TONE_SHAPE.textbook` (T1 4.60 now, V2 4.55); `/say` and `/chinese-tones` corridors draw `sayClips.ts` / `exampleClips.ts` (copies of the fallback). Landing `GateDemo` draws fallback words. "High and level" wording: `ChineseTones.tsx:55`, `ToneMarks.tsx:280`, `ToneTest.tsx:100`, `ToneVisualizer.tsx:122/675`, `Toneder.tsx:65`, `sayWords.ts:439/455`.

## Checks run
- `npm run test`: 144 files, 1882 tests pass (3 new). Flag off is the default in every test.
- `npm run typecheck`: clean (after adding `golive-shapes.ts` to the script lists in both tsconfigs, like `process-clips.ts`).
- `npm run bench`: 387 numbers, 0 FAIL, nothing moved (no `src/pitch/` change).
- `npm run build` + grep (TuningPanel, "copy gate log", soundboard, flappytone.gatelog, "Old foundation", ft.shapesV2, shapes-v2, frameGaps, ft.stretchPairs): no file.
- Go-live dry run: above.
- Acceptance "with it off, all tests pass as on `main`": the branch suite passes with the toggle off. `main`'s suite is a smaller, older set (not run here: no merge, by rule).

## Needs Pierre's eyes
- The release-note decision above (first tone).
- Fly the checklist in both modes (I did not drive the UI).

## Follow-ups
- Rerun brief 48 from step 4 after the decision.
