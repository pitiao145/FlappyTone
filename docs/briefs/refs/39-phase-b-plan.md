# Brief 39, Phase B: the plan (one ruler, one listener, checked by Praat)

Written 10 Nov 2026 after Pierre's review of Phase A (`docs/briefs/reports/39-pitch-foundation-review.md`).
Branch `research/39-pitch-foundation`, worktree `.claude/worktrees/research-37`.

## Decisions Pierre made
1. Praat is allowed as an offline dev-only tool. Installed: `praat-parselmouth` 0.4.7 (Praat 6.1.38, GPL-3, 30 MB + numpy 36 MB) in `node_modules/.cache/bench39/venv` (ignored by git, not a `package.json` dependency).
2. **One ruler.** Jane and the player are put on the grid by the same rule. The first tone may sit near 4.
3. Noise (fan, café, TV, people) is **out of scope** for now. First get quiet-room play right.
4. Deep male voices are **in scope**. Children are not, for now.
5. Recordings come later. Pierre's own voice (learner, male) comes first.
6. Foorgol: no answers yet.
7. Jane records on a good podcast-type mic, no processing.
8. Calibration direction: measure the middle of the voice, put a standard-size grid around it, let the grid learn slowly in play. A short top/bottom step stays as a fallback if the data says it is needed.
9. Plan by a strong model, build by another model, one small brief at a time, each with pass/fail numbers.

## Rules for every brief in this plan
- **Read first:** `docs/briefs/refs/39-handover.md`. **Update it last** (what changed, new numbers, surprises, notes for the next brief).
- **Stop rule:** if an acceptance number misses, or a premise in the brief is false, set `status: blocked`, write why in the handover and the report, and stop. Do not improvise a different fix.
- **Scorecard:** `npm run bench` (made in brief 40) prints every tracked number with pass/fail against `docs/briefs/refs/39-baseline.json`. A brief may only change a baseline number that its own acceptance section names.
- **Production safety:** work only in this worktree. No push, no deploy, no merge. No write to Supabase, R2, the Worker or PostHog. `process-clips` only with `--dry-run`. New target shapes live in a local file until brief 48.
- **Labels:** in reports, mark each claim MEASURED (command + numbers), READ IN CODE (file:line) or ASSUMED.
- CLAUDE.md hard rules stay in force (game loop outside React, AudioWorklet only, semitones, `src/pitch/` pure, tuning in `tuning.ts`, dev tooling out of `dist/`, rule 8, Traditional hanzi, no voice upload).
- Any change to `src/pitch/`: fixture tests pass, before/after `npm run report`, and `npm run bench`.
- **Review gate:** briefs marked "strong-model review" are not done until a strong model has read the diff and the numbers.

## Order

| # | Brief | Changes production code? | Waits for |
|---|---|---|---|
| 40 | Scorecard with Praat, baseline, rules review | No (dev + docs) | — |
| 41 | Pierre's voice: intake and first male/learner numbers | No | Pierre's recording |
| 42 | Listener: delay, voice band, time-based settings | Yes, `src/pitch/` | 40. Sign-off on deep voices needs 41 |
| 43 | One ruler for targets (local shape file, dev switch) | Dev pipeline + one dev-only seam | 42 |
| 44 | One ruler for the player: new calibration and slow learning | Yes | 43, 41 |
| 45 | Tone reader and accuracy on the new ruler | Yes | 44 |
| 46 | Pairs: one shared way to find syllables | Yes | 45 |
| 47 | Visualiser: honest target band, no re-measure on resize | Yes | 43 |
| 48 | Compare with production, go-live steps, docs | Go-live needs Pierre's yes | all |

Why this order: the listener must be final before the targets are measured again (one re-measure, not two). The reader is tuned last because it is fitted to whatever the listener and the ruler give it (Phase A, 6.1).

## Every Phase A finding, and where it goes

| Finding (Phase A section) | Goes to |
|---|---|
| Pair read fails: 55% textbook, 2% natural (6.2) | 46 |
| Reader depends on absolute height; breaks at −2 semitones (6.1) | 44 (grid learns), 45 (reader) |
| Targets are textbook heights, per-tone stretch (5) | 43 |
| Calibration: top from first tone, bottom from third, middle from talk (3) | 44 |
| Band 70–400 Hz cuts deep and high voices (4.4) | 42 (low end; high end checked, children not required) |
| Line is 40 ms late (4.1) | 42 |
| Per-frame settings change with device sample rate (3) | 42 |
| Clip pipeline gate is 19–25% of Jane's voice, quiet endings cut (4.5) | 43 (measure targets with a gate set per clip) |
| Reader is fitted to the tracker's smoothing (6.1) | 45 |
| Visualiser thin line; noise measured again on resize (3) | 47 |
| Player time axis uses message arrival time (summary 8) | 47 (measure first; fix only if the jitter is real) |
| Catalog `meta.reference` names the natural session on textbook rows (3) | 48 |
| `docs/TESTING.md` says 44.1 kHz; CLAUDE.md "ground truth = captures" (10) | 40 |
| Rules to question (10) | 40 (review table), then the brief that owns each rule |
| Loudness gate costs voice in loud rooms; cap 0.4 untuned; rescue tied to floor (4.2, 4.3) | **Not now** (noise out of scope). Kept on the scorecard so it cannot get worse. |
| Other voices in the room drawn as the player (4.3) | **Not now** |
| Children, Bluetooth mics, phone mics, more learners | **Not now**; recording list in Phase A section 9 |
| Foorgol's case (7) | Open until they answer. 46 and 47 remove causes 1, 2 and 5. 44 removes cause 3. |

## What "one ruler" means, exactly
- One map per speaker, used for every tone and both styles: `chao = 3 + 2 × (semitones from the speaker's middle) / half`, with one `half` up and one `half` down. This is the existing `semitonesToChao` (`src/pitch/math.ts:24`). No per-tone stretch.
- Jane's map is measured once from all her textbook clips: middle = median pitch, top = high percentile, bottom = low percentile (creak left out). Brief 43 fixes the percentiles with numbers.
- The player's map uses the same rule: middle measured, standard halves at first, then learned from their own play (brief 44).
- Single-syllable targets keep the 2–4 point templates (familiar shapes). Only the heights change, and they are real.

## Going live later (brief 48, needs Pierre's yes)
One database write of new shape numbers per word and style, after a backup of the old rows; then `export-fallback`. Clip audio does not change. Roll back = restore the backup rows and the old build.
