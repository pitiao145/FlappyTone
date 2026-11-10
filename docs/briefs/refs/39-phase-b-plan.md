# Brief 39, Phase B: the plan (one ruler, one listener, checked by Praat)

Written 10 Nov 2026 after Pierre's review of Phase A (`docs/briefs/reports/39-pitch-foundation-review.md`).
Branch `research/39-pitch-foundation`, worktree `.claude/worktrees/research-37`.

## Decisions Pierre made
1. Praat is allowed as an offline dev-only tool. Installed: `praat-parselmouth` 0.4.7 (Praat 6.1.38, GPL-3, 30 MB + numpy 36 MB) in `node_modules/.cache/bench39/venv` (ignored by git, not a `package.json` dependency).
2. **One ruler, textbook anchors** (revised 11 Nov 2026, brief 43). Jane and the player are put on the grid by the same rule. The first tone stays near 5: chao 5 = first-tone height, chao 1 = third-tone low, chao 3 = middle. (The earlier "first tone may sit near 4" is withdrawn.)
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

## How to run each brief

One brief per session. Start each session in this worktree (`.claude/worktrees/research-37`, branch `research/39-pitch-foundation`). Before a brief runs, set its `status` to `ready`. Run them in number order, except 41 (when the recording exists) and 47 (any time after 43).

Paste this prompt, with the number filled in:

```
Work only in the worktree .claude/worktrees/research-37 on branch research/39-pitch-foundation.
Do not touch main. Never push, deploy or merge. No writes to Supabase, R2, the Worker or PostHog.
Run brief NN: docs/briefs/NN-<name>.md.
First read docs/briefs/refs/39-handover.md and docs/briefs/refs/39-phase-b-plan.md ("Rules for every brief").
Do exactly what the brief says. If an acceptance number misses or a premise is false: set status blocked, write why, stop.
When done: write the report, add your entry to the handover file, commit on this branch (docs/ needs git add -f), stop.
Talk to me in short, simple sentences. Explain audio ideas in plain words.
```

For a review session (after 42, 44, 45), paste:

```
Work only in the worktree .claude/worktrees/research-37 on branch research/39-pitch-foundation. Change no code.
Review brief NN: read the brief, its report, the handover entry and the commit diff. Run npm run bench.
Check each acceptance number yourself. Look for a result that passes the numbers but is wrong for a real voice.
Answer: approve, or the exact list of what to fix. Add a "review" entry to the handover file and commit it.
```

| # | Brief | Build with | Then |
|---|---|---|---|
| 40 | Scorecard, baseline, rules review | Sonnet 5.5 | Pierre reads the rules table |
| 41 | Pierre's voice | Sonnet 5.5 | — |
| 42 | Listener: delay, band, ms | Opus 5.5 | Review session on Fable 5 |
| 43 | One ruler for targets | Opus 5.5 | Pierre turns the switch on and looks |
| 44 | Player ruler and calibration | Opus 5.5 | Review session on Fable 5; Pierre flies it in the Lab |
| 45 | Reader on the new ruler | Opus 5.5 | Review session on Fable 5 |
| 46 | Pairs | Sonnet 5.5 | — |
| 47 | Visualiser band | Sonnet 5.5 | Pierre looks at it |
| 48 | Compare and go-live plan | Opus 5.5 | Pierre decides |

Why these models: 40, 41, 46, 47 are well-specified building work with numbers to hit. 42–45 change how the game hears and judges a voice; a wrong but plausible answer is easy there, so they get a stronger builder and a second reader. If a Sonnet session blocks twice on the same brief, rerun it on Opus.

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
(Revised 11 Nov 2026 by Pierre's decision for brief 43. Replaces the "highest note = 5" version.)
- One map per speaker, used for every tone and both styles: `chao = 3 + 2 × (semitones from the speaker's middle) / half`, with one `half` up and one `half` down. This is the existing `semitonesToChao` (`src/pitch/math.ts`), which clamps at 1 and 5. No per-tone stretch.
- **chao 3 = the middle**: median pitch of all the speaker's voiced frames (creak left out).
- **chao 5 = first-tone height**: 90th percentile of the semitones of the speaker's first-tone syllables.
- **chao 1 = third-tone low**: minus the 10th percentile of the semitones of the speaker's third-tone syllables.
- This is the rule the player's calibration already uses (`run.ts` `voicedByTone` → `computeRangeHalvesFromExtremes`: T1 p90, T3 p10). **Same rule for Jane and the player.**
- Jane's map comes from her 357 newer textbook clips. Her natural clips and her 120 older takes use the same map.
- Tones that go past the anchors (fourth-tone start, second-tone end) sit on the top line; that is expected.
- The player (brief 44) keeps the T1 / T3 anchors. Brief 44 adds the middle from tone syllables and slow learning of top and bottom from the player's own first tones and low tones. "Standard halves" are only a starting guess before any T1 / T3 data exists.
- Single-syllable targets keep the 2–4 point templates (familiar shapes). Only the heights change, and they are real.

## Going live later (brief 48, needs Pierre's yes)
One database write of new shape numbers per word and style, after a backup of the old rows; then `export-fallback`. Clip audio does not change. Roll back = restore the backup rows and the old build.
