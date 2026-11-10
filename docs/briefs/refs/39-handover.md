# Brief 39 handover log

Every brief in the Phase B plan reads this file first and adds one entry at the end.
Plan: `docs/briefs/refs/39-phase-b-plan.md`. Phase A report: `docs/briefs/reports/39-pitch-foundation-review.md`.

## Entry template
```
## <brief number and name> — <date> — <done | blocked>
- Changed: files, commit
- Scorecard: numbers that moved (before → after), also the ones that got worse
- Surprises: anything that was not as the brief said
- For the next brief: what it must know or re-check
```

## Phase A + Praat check — 10 Nov 2026 — done
- Changed: `src/dev/bench39/` (bench), Phase A report, `praat-ref.py`. No production code.
- Praat vs the Phase A reference, on its trusted frames (MEASURED, 829 clips): median difference 0.02 semitone, 90th percentile 0.10, over 1 semitone 0.06–0.08%, octave apart 0.04–0.06%. Praat voices about 4% fewer frames. The Phase A numbers hold with Praat.
- Starting numbers with Praat as reference (`node src/dev/bench39/detail.mjs`, live settings and pipeline settings agree within 0.01 on the median; the 90th percentile differs by up to 0.06 (natural T4: live 0.44, pipeline 0.38)):
  - Pitch error with the 40 ms delay removed, median / 90th percentile, semitones: T1 0.02 / 0.11–0.23, T2 0.05 / 0.23, T3 0.06–0.07 / 0.28–0.32, T4 0.10 / 0.37–0.38, pairs 0.05–0.07 / 0.32–0.42.
  - Delay: 40 ms for every group.
- Facts the next briefs need:
  - All local audio is 48 kHz. One tracker step is 21.3 ms.
  - Local clips: 357 textbook, 472 natural. 120 older single-tone words have no cut clip under `fixtures/clips/jane`, but all 120 raw takes are in `fixtures/recordings/2026-08-07-xujzgs/` (MEASURED).
  - `process-clips --dry-run` writes nothing to disk, R2 or the catalog (READ IN CODE: `src/dev/process-clips.ts:825-830`) but it reads the catalog from Supabase and needs the raw takes on disk.
  - The game's catalog enters through `src/data/words.ts` (fallback at line 104). `wordsFallback.json` is also read by `src/game/toneAverages.ts`, `src/game/run.ts`, `src/toneder/toneTest.ts`, landing and site pages. It holds textbook rows only.
  - Jane's medians: textbook 196 Hz, natural 181 Hz. Her real heights per tone are in the Phase A report, 5.1.
  - The branch is 1 commit behind `main` (brief 38, the note prompt; no pitch files). Not merged, by rule.
- Open: Pierre's voice recording (brief 41). Foorgol's answers.
- One-ruler preview for Jane (MEASURED with Praat, textbook clips, creak left out, 2nd/98th percentile): middle 195.7 Hz, up 8.8 semitones, down 7.9. On that ruler: first tone 4.06; fourth tone 4.96 → 1.34; second tone 2.33 → 4.41; third tone low 1.20, end 4.11. With 5th/95th percentile: up 7.9, down 7.2, first tone 4.18, fourth-tone start 5.18 (clamped). So the premise of brief 43 holds with 2/98.

## 40 Pitch scorecard and rules review — 10 Nov 2026 — blocked
- Changed: `src/dev/bench39/scorecard.mjs` (new), `src/dev/bench39/tracks.mjs` (cache keyed by a hash of `src/pitch/`), `package.json` (`npm run bench`), `docs/briefs/refs/39-baseline.json` (209 numbers), doc facts in `docs/TESTING.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md`. Commit: see `git log` ("brief 40").
- Scorecard: first baseline, nothing moved. `npm run bench` → 0 FAIL, exit 0; 132 s on an empty cache, under 1 s cached. `clarityThreshold` 0.9 → 51 FAIL (MEASURED).
- Why blocked: live natural T4 pitch error with the delay removed, p90, is 0.44 semitone. This entry's "Phase A + Praat check" says T4 0.37–0.38 and "live and pipeline agree within 0.01". `detail.mjs` prints the same 0.44 for live natural T4 (pipeline: 0.38). The summary was wrong, not the bench. Rules review (`39-rules-review.md`) not written; waits for Pierre.
- Surprises: no shape-match number for T1 (flat target). Old `trk/` cache is no longer used; the new cache is `node_modules/.cache/bench39/trk2/<pitch hash>/`.
- For the next brief: run `npm run bench` before and after. A change in `src/pitch/` makes a full re-run (~2 min). The baseline already holds 0.44 for `live.err.delayRemoved.p90.natural.T4`.

## 40 (second run, after Pierre's decisions) — 10 Nov 2026 — blocked again
- Changed: `scorecard.mjs`: voice heard and "voice where Praat is silent" now compare at the same moment (no 40 ms shift); "delay removed" uses each group's best-fit delay. Handover sentence on live vs pipeline corrected. Baseline NOT rewritten.
- Delay-removed errors and delays did not move (best fit is 40 ms everywhere). MEASURED.
- Why blocked: the sanity check misses. Live T4 last third, lowest gate: textbook 94.2% (ok), natural **83.2%** (expected 92–94). Gate at 40%: textbook **46.5%**, natural **41.3%** (expected 51–66).
- Cause, MEASURED (scratch diagnosis, live cache): the reference. Natural T4 last third with the built-in reference is 96.6% (creak out) / 94.3% (creak in); with Praat 83.1% / 81.2%. Praat hears voice at the quiet end of natural falls that the built-in reference did not trust (it needs two methods to agree). Phase A's 92–94% came from the built-in reference (`eval.mjs`). Gate at 40% also differs in how "voice loudness" is measured: `eval.mjs` uses the raw centre-1024 RMS on reference-trusted frames; the scorecard uses the tracker's RMS on its own voiced frames. Not yet measured separately.
- Decision needed: accept the Praat numbers as the baseline (they say the tracker loses more of natural T4 endings than Phase A reported), or make the scorecard follow `eval.mjs` definitions.

## 40 Pitch scorecard and rules review (final) — 10 Nov 2026 — done
- Changed: `39-baseline.json` rewritten from the current scorecard (209 numbers); `39-rules-review.md` (new); report updated. Commit: see `git log` ("brief 40 done").
- Scorecard: `npm run bench` → 0 FAIL. Moved from the first baseline: 42 numbers, all "voice heard", "voice where Praat is silent" and the 40% gate, because the voiced on/off check is no longer shifted by 40 ms (Pierre's decision). Pitch error and delay did not move. Clarity 0.9 check: 44 FAIL.
- **Correction to Phase A (with Praat as reference):** live natural T4, last third heard = **83.2%** (Phase A said 92–94% with the built-in reference, which did not trust the faint ends of natural falls). Gate at 40%: **46.5%** textbook, **41.3%** natural (Phase A said 51–66%). Textbook T4 last third at the lowest gate: 94.2%.
- Shape of the new "voice heard" numbers: first third 71–88% (the tracker needs 3 voiced frames in a row before it draws, ~64 ms), last third 83–100%.
- **Note for brief 42:** "voice heard %" is a yardstick, not a target. Some faint endings that Praat marks as voice may not be audible. Do not raise it by loosening the voicing test; the "voice where Praat is silent" number must hold.
- For the next brief: rules owned by 42 are listed in `39-rules-review.md` (hop-based comments in `PitchTracker.ts`, `mpm.ts`; band; clarity; alpha; slew). Brief 40 could not edit `src/pitch/` comments.
