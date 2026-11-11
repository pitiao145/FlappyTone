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

---

# Third run (11 Nov 2026): Pierre accepted the T2 / T3 session gaps — blocked at acceptance (heights)

Pierre: "accept and continue". `make-shapes.mjs` now records T2 / T3 at step 4 as accepted (any other tone over 0.3 still stops). Command: `node src/dev/bench39/make-shapes.mjs`, then `node src/dev/bench39/heights.mjs --v2 --worst`.

- **Result: blocked.** The shapes file was made, but the first acceptance check misses for T2, T3 and T4. Cause: the 2–4 point templates cannot follow how fast she moves, at any ruler (details below). The brief asks for both "keep the templates" and "gap ≤ 0.20", and those two do not fit together. Not committed: `shapes-v2.json` (rebuild with the command above, 2 min) and the dev switch (not built).

## Steps that ran (MEASURED)
- Older first-tone words lifted by **+1.085 chao** (30 words), median level 3.50 → 4.58. To re-record before go-live: ma1b, ba1, san1, qi1, tian1, hua1, shu1, dong1, jia1, che1, shuo1, chi1, he1, shan1, xin1, kai1, mao1, chun1, gao1, zhong1, duo1, jie1, tang1, bao1, bei1, fei1, xing1, xiang1, bing1, ting1.
- Per-clip gate (floor median 0.00058 textbook, 0.00025 natural; fixed was 0.0033): changes 426 / 477 textbook shapes and 435 / 471 natural; corridor moved > 0.25 chao in 247 / 277; onset or duration moved > 25 ms in 281 / 345.
- Older takes cut from the raw files vs published timing: 120 / 120 within 25 ms, worst 0.3 ms (first five: ma1b, ba1, san1, qi1, tian1, all 0.3 ms). Newer clips: 357 / 357, worst 0.3 ms.
- Coverage: textbook 477 / 477. Natural 471; no local natural clip for yixia24, yigong24, yizhi42, yiban41, yibian41, zhangfu40 (the published natural list was not read: no Supabase).

Old vs new targets, textbook single tones (medians of polyline nodes, chao):

| tone | words | start | low | high | end |
|---|---|---|---|---|---|
| T1 | 44 | 4.54 → 4.58 | 4.54 → 4.58 | 4.54 → 4.58 | 4.54 → 4.58 |
| T2 | 47 | 2.89 → 2.37 | 2.13 → 1.70 | 5.00 → 5.00 | 5.00 → 5.00 |
| T3 | 52 | 3.40 → 2.78 | 1.42 → 1.09 | 5.00 → 4.52 | 5.00 → 4.52 |
| T4 | 68 | 4.27 → 5.00 | 1.29 → 1.13 | 4.78 → 5.00 | 1.32 → 1.13 |

Natural single tones, same ruler: T1 3.39 flat; T2 2.36 → 1.26 → 4.16; T3 2.43 → 1.00 → 3.32; T4 4.10 → 4.68 → 1.00.

20 textbook words that moved most (largest corridor gap, chao): yuyan32 4.00, yisheng11 3.86, nianqing21 3.70, gongke14 3.04, dadianhua344 2.90, lishi43 2.88, ganmao34 2.84, wai4 2.78, bukeqi444 2.69, jiejie30 2.65, lengqi34 2.57, zhidao14 2.53, mama10 2.43, wanshang30 2.41, shangke44 2.37, lao3 2.36, xuexiao24 2.34, paobu34 2.21, jintian11 2.20, yixie11 2.19. Median move 0.73. The biggest moves are words where the per-clip gate now keeps a quiet, very low frame at the start or end, and the target's first or last point drops to the bottom line there (yisheng11 ends at 1, yuyan32 ends at 1, wai4 and lao3 start at 1).

## Acceptance: heights.mjs on the new ruler, Jane clamped (MEASURED)
| group | gap med (≤ 0.20) | inside med / p10 (≥ 99 / ≥ 90) | shape match med (≥ 0.96) | today (same script, old shapes) gap / inside p10 |
|---|---|---|---|---|
| T1 | 0.12 pass | 100 / 94 pass | — | 0.18 / 100 |
| T2 | **0.26** | 100 / **83** | 0.99 | 0.24 / 100 |
| T3 | **0.31** | 100 / 95 | 0.98 | 0.36 / 100 |
| T4 | **0.70** | **71 / 49** | **0.95** | 0.59 / 71 |
| pairs | 0.20 pass | 100 / 95 | 0.98 | 0.41 / 89 |
| 3+ syllables | 0.21 (info) | 100 / 92 | 0.96 | 0.47 / 86 |

Natural (info, same ruler): T1 0.10, T2 0.21, T3 0.20, T4 0.78 (inside 69 / 56), pairs 0.21.

## Why (MEASURED, diagnosis only)
1. **Same ruler, old fixed gate** (`--gate fixed`, scratch file): T2 0.19 (pass), T3 0.29, T4 0.49 (inside p10 62). So the per-clip gate makes T2 and T4 worse (the low edge frames above), but even without it, T3 and T4 miss.
2. **The template is too slow.** Median of what she said vs the target, by tenth of the word (newer textbook clips):

```
T4 said:   5.00 5.00 5.00 4.66 3.29 2.17 1.42 1.13 1.11 1.10
T4 target: 5.00 4.97 4.82 4.51 4.08 3.57 3.00 2.41 1.86 1.43
T3 said:   2.55 2.29 1.52 1.15 1.04 1.23 1.81 2.71 4.29 5.00
T3 target: 2.26 1.80 1.38 1.10 1.06 1.23 1.68 2.37 3.29 4.08
T2 said:   2.25 2.07 1.77 1.66 1.76 2.08 2.61 3.59 4.89 5.00
T2 target: 2.16 1.95 1.72 1.61 1.76 2.13 2.68 3.38 4.05 4.57
```

In plain words: her fourth tone falls fast in the middle of the word and then stays low. The target has only three points (start, peak, end), so it draws one slow slope over the whole second half. It is still at 3.0 where she is already at 1.4. The second and third tones end the same way: she reaches the top in the last fifth, and the target is still climbing. The heights are right; the speed is not.

## Not done
Dev switch in `words.ts`, xiaoshi / yiqian check, build grep, committing `shapes-v2.json`.

## Needs Pierre's eyes
1. **Let the targets follow the speed of the voice.** For example, add a "knee" point to T4 (where the fall ends) and to the T2/T3 rise, or use the multi-syllable polyline fit for single syllables too. This changes the "familiar 2–4 point templates" rule, so it is your call.
2. **Keep the templates and loosen the gap limit** for T2–T4 (for example ≤ 0.35, T4 ≤ 0.75). The targets would stay as slow as today.
3. **Per-clip gate:** keep it (pairs gain a lot) but leave out the quiet edge frames for the end points (for example, the first and last 5% of the tone window). Or go back to the fixed gate for single syllables. Either way it is a new rule, so it is your call.

---

# Fourth run (11 Nov 2026): knee nodes + gate floor (Pierre's decision) — blocked at acceptance (T2, T3 gap)

Decision: `templateContourKnee` (new, in `src/dev/clipCut.ts`; `templateContour` and published shapes unchanged) adds one KNEE node to T2, T3, T4: the first measured point after the previous node within `KNEE_CHAO` = 0.3 of the end hold value. Per-clip gate: `noiseFloor = max(p10 frame RMS, 1e-4, CLIP_GATE_VOICE_SHARE (0.1) × median voiced RMS / rmsMult)`; "voiced" from a first tracker pass with the first two floors. One rule for all words. Commands: `node src/dev/bench39/make-shapes.mjs`, then `node src/dev/bench39/heights.mjs --v2 --worst`.

- **Result: blocked.** Second-tone gap **0.248** and third-tone gap **0.206** (limit 0.20). Everything else passes. No other constants were tried. `shapes-v2.json` not committed (rebuild: 2 min); dev switch, xiaoshi / yiqian and build grep not run.

## Acceptance (MEASURED, heights.mjs --v2, textbook, Jane clamped on her ruler)
| group | gap med | limit | inside med / p10 (≥ 99 / ≥ 90) | shape match med (≥ 0.96) | verdict |
|---|---|---|---|---|---|
| T1 | 0.127 | 0.20 | 100 / 94 | — | pass |
| T2 | **0.248** | 0.20 | 100 / 94 | 0.963 | **miss (gap)** |
| T3 | **0.206** | 0.20 | 100 / 100 | 0.983 | **miss (gap)** |
| T4 | 0.276 | 0.30 (allowance; inside passes) | 100 / 91 | 0.982 | pass |
| pairs | 0.198 | 0.20 | 100 / 96 | 0.977 | pass |
| 3+ syllables (info) | 0.208 | — | 100 / 96 | 0.967 | — |

Before → after this run: T2 0.26 → 0.248, T3 0.31 → 0.206, T4 0.70 → 0.276, T4 inside p10 49 → 91, T2 inside p10 83 → 94.

## Ruler (MEASURED; moved slightly with the new gate)
Middle 197.4 Hz, up 5.75 st (T1 p90 5.689), down 7.25 st (T3 p10 7.373). Check: first-tone level 4.55, third-tone low 1.00 (pass). Older vs newer: T2 0.26, T3 0.50 (accepted), T4 0.17. Older T1 lift +1.08 chao (same 30 words).

## Knees (MEASURED)
Words that lost their knee: **0** (textbook T2 0/47, T3 0/52, T4 0/68; natural the same).

## Said vs target by tenth of the word (MEASURED, newer textbook single tones, medians, chao)
```
T2 said:   2.24 2.09 1.77 1.64 1.72 2.01 2.46 3.19 4.50 5.00
T2 target: 2.16 1.96 1.75 1.64 1.77 2.28 3.05 3.89 4.59 4.93
T3 said:   2.54 2.29 1.54 1.14 1.01 1.18 1.72 2.50 3.90 4.94
T3 target: 2.25 1.80 1.38 1.09 1.03 1.15 1.53 2.39 3.83 4.75
T4 said:   5.00 5.00 5.00 4.92 3.83 2.62 1.84 1.36 1.09 1.00
T4 target: 5.00 4.94 4.63 4.06 3.34 2.63 1.89 1.43 1.16 1.05
```
In plain words:
- **Fourth tone** now follows her fall well. The knee fixed it.
- **Second tone:** she stays low for longer and then rises fast at the end. The target leaves the low point too early (at 70% of the word: target 3.05, she is at 2.46). Between the low and the knee there is no point to hold it down. The third tone has a "mid-rise" point for this; the second tone does not.
- **Third tone:** the remaining gap is mostly at the start (target 1.80 where she is at 2.29, 20% into the word). The target goes straight from the start down to the low point, but she stays higher for longer.

## Edge points (MEASURED): target starts or ends within 0.1 of chao 1 or 5 where what she said there does not
Single tones: T1 0 starts / 1 end (dou1); T2 1 / 2 (ying2 start; lou2, shei2 end); T3 2 / 5 (bi3, bi3b start; wang3, zhao3, wan3b, bi3b, deng3 end); T4 2 / 3 (kuai4b, huan4 start; huan4, xiao4, pang4 end); neutral le0 start. Pairs: 12 starts, 31 ends of 246. 3+ syllables: 2 / 1 of 17. Full list: `heights.mjs --v2` prints it.

## Per-clip gate (MEASURED)
Floor median 0.00173 textbook (p10 0.00095, p90 0.00316), 0.00123 natural; was 0.00058 / 0.00025 without the voice-share floor. Changes 190 / 477 textbook corridors by > 0.25 chao (was 247), 212 / 471 natural; onset or duration moved > 25 ms: 125 textbook, 159 natural.

## 20 textbook words that moved most (largest corridor gap old vs new, chao)
dadianhua344 2.92, lishi43 2.86, mai4 2.50, wanshang30 2.41, duibuqi403 2.40, jiejie30 2.38, lao3 2.36, xuexiao24 2.34, paobu34 2.32, ganmao34 2.26, tamen10 2.19, keyi33 2.17, shufu10 2.11, ditie43 2.11, yifu10 2.09, yixie11 2.03, wan2 2.01, jintian11 1.99, kuaile44 1.99, dongtian11 1.98. Median move 0.71.

## Checks
`npm run test` 1831 passed; `npm run typecheck` clean; `npm run bench` 299 numbers, 0 FAIL.

## Needs Pierre's eyes
1. Give T2 a mid-rise node like T3 (start, low, mid-rise, KNEE, end), and maybe a T3 "early hold" node after the start. Same idea as the knee.
2. Or accept T2 ≤ 0.25 and T3 ≤ 0.21 as named allowances (inside and shape pass for both), and run on.
