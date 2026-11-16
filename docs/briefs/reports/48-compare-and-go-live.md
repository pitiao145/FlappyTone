# Report: 48 Compare with production, go-live steps, and the docs
- Result: **done** (16 Nov 2026). First run blocked at step 4 (premise false); Pierre decided the same day, and the second run did steps 4–8.

## Pierre's decision (16 Nov 2026)
The release note says **"first tone: no change"**. Reason (MEASURED in the first run): the brief said "first tone lower", but the first-tone targets do not move.

Command: a one-off `node -e` over `src/data/wordsFallback.json` (production textbook shapes) and `src/dev/local/shapes-v2.json` (new), single-syllable words, median over words, chao.

| tone | words | mean height | start | highest point | lowest point | end |
|---|---|---|---|---|---|---|
| first | 44 (30 with the shared lift) | 4.54 → **4.55** | 4.54 → 4.55 | 4.54 → 4.55 | — | — |
| second | 47 | 3.17 → 2.82 | 2.89 → 2.37 | 5.00 → 5.00 | 2.13 → 1.73 | 5.00 → 5.00 |
| third | 52 | 2.55 → 2.32 | 3.40 → 2.76 | 5.00 → 4.50 | 1.42 → 1.08 | 5.00 → 4.50 |
| fourth | 68 | 3.36 → 3.07 | 4.27 → **5.00** | 4.78 → 5.00 (at t 0.19 → 0.00) | 1.29 → 1.15 | 1.32 → 1.15 |

In Hz on Jane's two grids the first tone is about 0.4 st *higher* (ASSUMED arithmetic from the stored ruler numbers). The player's top line is their own first-tone height in both foundations (plan doc; `computeRangeHalvesFromExtremes`).

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

## Step 4 — What players will notice (release note draft)

> **FlappyTone now hears you a new way**
> - **The line follows your voice faster.** It now trails your voice by half as much as before.
> - **Targets follow how our native speaker really says each word**, on one scale for every tone.
>   - First tone: no change.
>   - Fourth tone: starts at the very top.
>   - Second and third tones: start a little lower and dip a little deeper. The third tone ends a little lower.
> - **A new short calibration step.** You say 媽 and 馬, and the game finds the middle of your voice. After that, the game keeps adjusting to your voice while you play.
> - **Low voices:** the game now listens further down.
> - **Your stats:** tone accuracy is now measured on the new scale. Numbers from before and after <date> are not directly comparable. Most players will see their accuracy go up a little; that is the new scale, not a sudden improvement.

Notes for Pierre: "half as much" = line delay 40 → 20 ms (MEASURED, bench). "Most players will see it go up" is ASSUMED from Jane's own clips (0.77 → 0.84 textbook, 0.70 → 0.79 natural); no learner was measured. Drop that sentence if you prefer only measured claims. "Low voices" is code (floor 55–70 Hz), proven only on a slowed copy of Jane.

## Step 5 — Stats and the leaderboard (proposal; no server data changed)

READ IN CODE / docs (`ARCHITECTURE.md` "Accounts, tiers and the leaderboard"):

| stored where | what it holds | effect of the switch |
|---|---|---|
| `leaderboard_scores` (weekly, ISO week from server time) | the score: corridor error on the gate's clock | Shapes and the player's grid change, so a score before and after is not the same test. The board resets every week, so the mix lasts at most one week. |
| `tone_accuracy_stats` (profile, all time) | lifetime tone accuracy per tone and combo | Sums old and new numbers forever. "All time" becomes a blend. |
| `run_log.per_key` | last 5 / last 50 runs, Pro daily trend | Mixed for 5–50 runs; the Pro trend shows a step on the change day. |
| `player_tone_shapes` (Pro) | per-day sum of the player's lines in chao | Lines are drawn on the player's grid; the grid changes, so the shape chart shows a jump on the change day. |
| local stats copy, `toneflap.ruler.v1` | per browser | Ruler record is new; the old calibration record is not touched (roll-back safe). |

**Proposal (one option): go live on a Monday, and draw one marker.**
- Deploy at the start of an ISO week (Monday, Taiwan time is fine; the week id comes from server UTC), so no weekly board mixes the two foundations. No server change.
- One constant in the client, `FOUNDATION_CHANGE_DATE`. Progress draws a thin vertical line labelled "new tone scale" on the Pro trend and the tone-shape chart at that date, and one line under "All time": "Includes runs from before <date>, measured on the old scale."
- Do not reset or rewrite any stored number. If Pierre later wants a clean "all time", that is a server change (new column or a dated split) and needs its own approval.

## Step 6 — Public copy that says or draws "55" for the first tone

| where | what it says or draws | proposal |
|---|---|---|
| `src/site/pages/ChineseTones.tsx:57` | "Chao numbers write it 55: it starts at 5 and stays at 5." | **Keep.** The first tone stays at the top (decision above). |
| `src/site/pages/ChineseTones.tsx:252` | "Textbooks give each tone a fixed number (first tone = 55, …" | **Keep.** It is about textbooks. |
| `src/site/pages/ToneVisualizer.tsx:691` | "Tone charts teach 55, 35, 214 and 51." | **Keep.** Same. |
| `src/site/ToneChart.tsx` (on `/chinese-tones`) | draws `AVERAGED_TONE_SHAPE.textbook` (first tone at 4.60) | **Change by data at go-live** (regenerate `toneAverages.ts` from the new shapes: first tone 4.55, fourth tone starts at 5). No copy change; the aria-label stays true. |
| Tone visualizer textbook line (`src/site/checker/toneRefs.ts`) | same averages | **Change by data**, same regeneration. Then the site and the game agree. |
| `/say/*` and `/chinese-tones` example corridors (`sayClips.ts`, `exampleClips.ts`) | copies of the fallback | **Change by data**: regenerate after `export-fallback` (tests pin them). |
| Landing (`SkyLanding.tsx`, `shared.tsx`, `TryItNow.tsx`, `GateDemo.tsx`) | fallback words and averages built from them at run time | **Change by data**: follows `export-fallback`. |
| "high and level" wording: `ChineseTones.tsx:55`, `ToneMarks.tsx:280`, `ToneTest.tsx:100`, `ToneVisualizer.tsx:122` and `:675`, `Toneder.tsx:65`, `sayWords.ts:439` and `:455` | words, not numbers | **Keep.** |

No hard-coded 5-5 first-tone line exists in public code (READ IN CODE: every drawn first-tone line comes from catalog or averages data).

## Step 7 — Logging proposal (not built)

Three numbers per run, added to the existing `run_end` PostHog event (so the "Usage analytics" switch turns them off too):

| number | what it is in plain words | voice profile? |
|---|---|---|
| `noiseDb` | how loud the room was during the run (the session noise floor, dB) | No: it describes the room. |
| `heardPct` | share of the frames inside gates where the game could hear a voice | No: a quality number. |
| learned grid | how far the learned middle moved from calibration, and the two halves, in semitones | **Yes.** It describes the player's voice range. |

**Conflict to decide:** brief 35 (`DECISIONS.md`, 8 Nov 2026) removed every voice-profile number from analytics, and the privacy policy says "we do not collect a voice profile (such as your calibration numbers)". The learned grid is such a number.
- Option A (recommended): log only `noiseDb` and `heardPct`. No policy change of meaning; add one clause to the usage-analytics paragraph: "how loud the room was during a run and what share of your voice the game could hear (two numbers, not audio and not a voice profile)."
- Option B: also log the grid, in semitones only, never Hz. Needs a new decision that reverses part of brief 35, and this policy line: "Since <date> we also collect three numbers about how the game's pitch scale adapted to your voice during a run (in semitones, never your pitch in Hz). They are not audio and cannot be turned back into your voice."

**Needed at go-live in any case (no logging):** the device now keeps pitch histograms (`toneflap.ruler.v1`). Proposed line for the local-storage paragraph: "The game also keeps, in your browser only, a summary of the pitch range of your voice (counts of numbers, not audio) so its scale can adapt to you. It is never sent to us." (Hard rule 12: new voice-derived data needs a policy update.)

## Step 8 — Docs

Every row of `docs/briefs/refs/39-rules-review.md` now has a final state (new last column, 54 rows): FIXED, TRUE, or STILL UNPROVEN with the reason. Doc edits:
- `docs/PRD.md` §5–§7: old and new foundation both described; median 3 and 20 ms; speaker floor; slew in st/s; alpha marked not re-tuned; calibration flaw and the new middle step + learning; production shapes "stretched onto textbook levels" and the new heights; creak claim corrected; reader board-dependence and the ruler set; tone accuracy numbers with Praat.
- `docs/ARCHITECTURE.md`: the foundation switch and `golive-shapes`; "until brief 48" → "until go-live"; `multiMergeGapMs` note.
- `docs/TESTING.md`: what the 4 captures are the truth for; deep-voice gap.
- `docs/DECISIONS.md`: "One ruler: compare first, go live as one switch".
- `CLAUDE.md`: one sentence — captured contours show agreement, `npm run bench` checks against Praat.

Still open (Pierre's call, not docs): whether the 4 `jane_ma*` captures stay "the" ground truth (CLAUDE.md:92).

## Open decisions for Pierre
1. Release note wording (step 4), especially the unmeasured "accuracy may go up" sentence.
2. Stats: Monday go-live + marker (step 5), or something else.
3. Logging: option A or B (step 7).
4. Public copy: regenerate site averages at go-live (step 6), so site and game agree.
5. Other screens (Visualiser, public checker, TONEder) still read the old calibration record, not the learned ruler (brief 44 review). Decide before go-live whether they should read the ruler.
6. Go-live order and the four blockers in step 3.

## Checks run
- `npm run test`: 144 files, 1882 tests pass (3 new). Flag off is the default in every test.
- `npm run typecheck`: clean (after adding `golive-shapes.ts` to the script lists in both tsconfigs, like `process-clips.ts`).
- `npm run bench`: 387 numbers, 0 FAIL, nothing moved (no `src/pitch/` change).
- `npm run build` + grep (TuningPanel, "copy gate log", soundboard, flappytone.gatelog, "Old foundation", ft.shapesV2, shapes-v2, frameGaps, ft.stretchPairs): no file.
- Go-live dry run: above.
- Acceptance "with it off, all tests pass as on `main`": the branch suite passes with the toggle off. `main`'s suite is a smaller, older set (not run here: no merge, by rule).

## Needs Pierre's eyes
- Fly the checklist in both modes (I did not drive the UI).
- The open decisions above.

## Follow-ups
- Go-live session (needs Pierre's yes): step 3 list.
- Pair-reading brief (blocker for shipping brief 46's finder).
- Re-record the 30 older first-tone words.
- `process-clips` on the one-ruler path.
