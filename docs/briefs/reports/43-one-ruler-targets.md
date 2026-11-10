# Report: 43 One ruler for the targets

- **Result: blocked at step 1.** The ruler check misses: on Jane's one ruler, her first tone lands at **3.44**. The brief needs 3.8–4.4. The brief's premise was checked on 357 clips only; with all 477 textbook words it is false.
- Run on 11 Nov 2026, branch `research/39-pitch-foundation`. Pierre's prompt started the brief (its status said "draft, waits for approval"; I took the prompt as the approval).

## What changed
- `src/dev/clipCut.ts`, `src/dev/clipCutMulti.ts`: optional last argument `overrides` (extra tracker settings) on `cutClip`, `measureContour`, `longestVoicedRun`, `multiSyllableSpan`; new `clipNoiseFloor(samples)` (10th percentile of frame loudness, at least 1e-4). Default is empty, so every existing caller is unchanged. READ IN CODE; MEASURED: `npm run test` 137 files, 1831 passed; `npm run typecheck` clean.
- `src/dev/bench39/make-shapes.mjs` (new): steps 1–6 (ruler, measure, per-clip gate, shapes, older takes, output file). No Supabase, no network. It stops with exit code 2 at the ruler check, as the brief says.
- Not done (blocked before them): `src/dev/local/shapes-v2.json`, the dev switch in `src/data/words.ts`, the acceptance checks.
- Commit: see `git log` ("brief 43").

## Step 1: Jane's ruler (MEASURED)
Command: `node src/dev/bench39/make-shapes.mjs --no-write`. Final listener (brief 42), clip-pipeline cut, per-clip gate, frames of the tone window only, creak (more than 10 st under the middle) left out, 2nd / 98th percentile.

| | middle | up (top half) | down (bottom half) | frames |
|---|---|---|---|---|
| All 477 textbook words (the brief's ruler) | 197.6 Hz | 8.49 st | 8.00 st | 23,065 (119 creak left out) |
| 357 newer clips only | 196.7 Hz | 8.60 st | 8.03 st | 18,001 |
| 120 older takes only (session 2026-08-07) | 198.7 Hz | 8.26 st | 7.21 st | 5,065 |

Check on the full ruler: **first tone 3.44** (needs 3.8–4.4) — miss. Fourth-tone start 4.87 (needs 4.6–5.0) — pass.

## Why it misses (MEASURED, diagnosis only, nothing tuned)
In plain words: the "middle" of her voice is the same in both recording sessions. But in the older session she said the high flat tone much lower, only a little above her middle. So on one ruler, those first tones sit low.

| Single first-tone words | words | level on the ruler (median) | start |
|---|---|---|---|
| newer clips | 14 | **4.05** (Praat on the same clips: 4.06) | 4.23 |
| older takes (2026-08-07) | 30 | **3.32** | 3.47 |
| all | 44 | 3.44 | 3.59 |

- The older takes are 30 of the 44 first-tone words, so they decide the median.
- The level measure is not the cause: the template level (trimmed mean) and the plain median of frames agree within 0.03.
- The ruler is not the cause: the older session's own middle is 198.7 Hz, 2 Hz from the newer one. Its first tone sits about 1.7 st over the middle (about 215 Hz); the newer clips sit about 4.5 st over (about 256 Hz). `clipNormalize.ts` already describes this older session: "T1 sits at ~215Hz".
- The handover preview (first tone 4.06 with 2/98) came from the 357 newer clips only, because only those have a cut clip and a Praat reference. That is why it held there and not here.
- Fourth tone, for the record: newer start 4.96, older 4.80.

## Checks run
- Step 1 ruler check: **fail** (3.44). Steps 2–7 not run past this point. Step 5 (older takes vs published timing) not reached.
- `npm run test`: 1831 passed. `npm run typecheck`: clean. `npm run bench`: 299 numbers, 0 FAIL (no file in `src/pitch/` changed).

## Needs Pierre's eyes: a decision
The brief says: do not tune percentiles to hit the numbers. Choosing percentiles cannot fix this anyway: the gap is between the two sessions' first tones, not in the ruler. Options I see (not done):
1. **Keep one ruler for all 477 and accept the first tone near 3.4 for the older words.** Change the brief's check to the newer words, or to "3.3–4.4". Honest to what she said; the older first tones get a lower corridor than the newer ones.
2. **Ruler from the 357 newer clips; older words on the same ruler.** Middle 196.7 Hz, up 8.60, down 8.03. The newer first tones pass (about 4.05); the older ones still sit near 3.3. Same effect as 1 with a cleaner ruler.
3. **One ruler per session** (each sitting gets its own middle and halves). Does not help: both sessions have the same middle, so the older first tones stay low.
4. **Re-record the 120 older single words** with Jane, in the newer style. The only option that gives one consistent first-tone height. Costs a recording session.
5. **Keep the older 120 words on today's shapes** in the dev file and only re-measure the newer words, until 4 is done.

My view: 1 or 2 is honest and cheap, and the player's ruler (brief 44) is measured from the player, not from Jane, so a first tone near 3.4 only changes where those 30 corridors sit. If the first tone must look "high" on the board for every word, only 4 gives that.

## Follow-ups
- When rerun: step 5 (older takes cut from raw vs published `onset_s` / `duration_s`) and the step 3 count are already in `make-shapes.mjs`; they run after the ruler check.
- xiaoshi / yiqian corridor error on the new ruler: not measured (blocked before). Note for the rerun: on a ruler of ±8 st instead of ±15 st, the same pitch error in semitones is about 1.8 times larger in chao, so the 0.37 / 0.43 of today may not hold under 0.47.
