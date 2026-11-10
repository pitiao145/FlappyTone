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

---

# Second run (11 Nov 2026): textbook anchors — blocked at decision step 4

Pierre's decision replaced the "highest note = 5" ruler with the player's rule: chao 3 = middle, chao 5 = p90 of single first-tone frames, chao 1 = p10 of single third-tone frames, from the 357 newer textbook clips. `make-shapes.mjs` rewritten to it. Command: `node src/dev/bench39/make-shapes.mjs --no-write`.

- **Result: blocked at decision step 4.** Steps 1–3 pass. Step 4 (older session vs newer clips, any tone other than T1 more than 0.3 chao apart): **third tone 0.56, second tone just over 0.30**. No shapes file, no dev switch, no acceptance run.

## Step 1: Jane's ruler (MEASURED)
- Middle (chao 3) **196.7 Hz**; up (chao 5) **5.75 st** (p90 of first-tone frames 5.748, 561 frames); down (chao 1) **7.25 st** (p10 of third-tone frames −7.307, 917 frames). Quarter-semitone rounding as in `computeRangeHalvesFromExtremes`. 18,001 frames, 101 creak frames left out.

## Step 2: ruler check, newer clips (MEASURED)
- First-tone level 4.58 (needs 4.4–5.0): pass. Third-tone low 1.00 (needs 1.0–1.6): pass, at the edge (the low node is on the bottom line).

## Step 3: frames on the top line (5) / bottom line (1) (MEASURED)
| set | T1 | T2 | T3 | T4 | pairs | 3+ syllables |
|---|---|---|---|---|---|---|
| textbook newer | 10.7% / 0.4% | 7.3% / 1.4% | 2.9% / 11.2% | 31.3% / 13.3% | 17.9% / 5.2% | 16.1% / 5.8% |
| textbook older | 0.0% / 0.2% | 4.4% / 1.0% | 0.8% / 5.4% | 38.9% / 0.9% | — | — |
| natural | 0.0% / 0.2% | 0.0% / 1.8% | 0.0% / 20.2% | 3.6% / 10.9% | 0.1% / 3.0% | 0.0% / 4.5% |

In plain words: about a third of the fourth-tone frames sit flat on the top line, and an eighth on the bottom line. The fall goes past both anchors.

## Step 4: older session vs newer clips, single tones, polyline nodes (MEASURED, medians, chao)
| tone | n older / newer | start | low | high | end | largest gap |
|---|---|---|---|---|---|---|
| T1 | 30 / 14 | 3.50 vs 4.58 | 3.50 vs 4.58 | 3.50 vs 4.58 | 3.50 vs 4.58 | 1.09 (expected; the offset step handles it) |
| T2 | 30 / 17 | 2.58 vs 2.31 | **1.86 vs 1.56** | 5.00 vs 5.00 | 5.00 vs 5.00 | **0.30** (over the limit by under 0.005) |
| T3 | 30 / 22 | 2.80 vs 2.71 | 1.16 vs 1.00 | **4.44 vs 5.00** | **4.44 vs 5.00** | **0.56** |
| T4 | 30 / 38 | 5.00 vs 5.00 | 1.18 vs 1.00 | 5.00 vs 5.00 | 1.18 vs 1.00 | 0.18 |

What it means, in plain words:
- **Third tone:** in the newer clips the rise at the end goes past the first-tone height, so it sits on the top line (5.00). In the older takes it ends at 4.44. Part of the 0.56 is the clamp: the newer ends are cut off at 5, so the real gap in pitch is at least this big.
- **Second tone:** the dip is a little deeper in the newer clips (1.56) than in the older (1.86). This sits right at the limit.
- So the older session differs from the newer one for more than the first tone. A first-tone offset alone would not make the two sessions match.

## Not done (blocked before them)
Decision step 5 (T1 offset; code is ready in `make-shapes.mjs`), the shapes file, the dev switch, heights.mjs on the new ruler, xiaoshi / yiqian, the build grep.

## Done from the decision anyway (they record the decision, not a fix)
- `docs/briefs/refs/39-phase-b-plan.md`: Decision 2 and "What one ruler means, exactly" rewritten to the textbook anchors, with the note for briefs 44/45.
- Handover entry (below in the handover file): the "first tone near 4" preview is withdrawn.

## Needs Pierre's eyes
1. Accept the older session's T2 and T3 differences (raise the step-4 limit for T2/T3, or check only T4), and run on.
2. Lift only T1 as decided, and add the older T3 words (and maybe T2) to the "re-record before go-live" list.
3. Re-record all 120 older single words before brief 43 runs; keep their old shapes in the dev file until then.
