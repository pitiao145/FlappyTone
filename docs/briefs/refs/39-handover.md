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

## 41 Pierre's voice intake — 10 Nov 2026 — done
- Changed: `src/dev/bench39/pierre.mjs` (new), `scorecard.mjs` (prints Pierre's block, info only), `praat-ref.py` (set `pierre`, floor 40 Hz for it, set filter). Report `docs/briefs/reports/41-pierre-voice-intake.md`. Commit: see `git log` ("brief 41").
- Scorecard: Jane's 209 numbers unchanged, 0 FAIL. MEASURED.
- Pierre (MEASURED): talk median 127.5 Hz; real range (tone syllables, 5–95 pct, creak out) 102.5–185.1 Hz; under 70 Hz 0.9–1.9% of tone frames, under 55 Hz 0.5–1.1%; delay 40 ms; T3 error p90 0.57 st (worse than Jane), rest in Jane's range; creak 1% of frames, drawn an octave high when drawn.
- **Standard grid fits**: Jane's halves around his talk median leave 2.4 st spare at the top and 4.1 at the bottom. His saved calibration (up = 2, the clamp) misses the top by 4.2 st.
- Surprises: recordings are phone AAC 16 kHz, cut into 42 WAVs in `fixtures/captures/pierre/` (gitignored). Calibration "up" hit the 2 st floor.
- For the next brief: 42 — low band ~55 Hz would cover his creaky ends; don't trust creak. 44 — "talk middle + standard grid" works for a male learner. 45 — his T2/T3 confusion flips with the grid. Pairs split 5/16, same weakness as Jane's natural pairs.

## 42 Listener: delay, band, ms — 10 Nov 2026 — blocked (step 2)
- Changed: step 1 only. Time settings are now ms: `hopSize`, `maxSlewSemitonesPerSec` 140.625, `rescueMaxMs` 64, `staleUnvoicedMs` 107, `minVoicedRunMs` (tuning 64, default 0). `tuning().minVoicedRun` is now `minVoicedRunMs`. clipCut T3 rescue 171 ms. Commit: "wip(pitch): brief 42 step 1".
- Scorecard: step 1 moved **no** number (MEASURED). 1827 tests pass; report same; wall hits 0.
- Why blocked: step 2. (a) median 3 → delay 20 ms, errors better, but 6 unnamed numbers fail (`live.highEndLost.p90` textbook T1/T4/pairs and natural T4, +0.03–0.09 st; `deep0.5.lowEndLost.med.natural.T2` +0.06; reader voice2stLower textbook −2.2 pp). (b) = (a) in code (octave check already before the median). (c) bypass within 1 st: T4 still 40 ms, 34 FAIL. Decision for Pierre in the report.
- Surprises: (b) was not a separate option. Before step 1, a 44.1 kHz device's slew limit was about 9% slower in st/s than at 48 kHz (3.0 st per 23.2 ms hop); step 1 fixed that. Its waits (rescue, stale reset, minVoicedRun) still round to the same frame counts (3, 5, 3), so they stay about 8% longer in time at 44.1 kHz; step 1 did not change that. (Corrected after the 42 review.)
- For the next brief / rerun: `rescueMaxSemitones` is still per hop (rescue rule, out of scope). Bench cache keys changed with the field names, so the first run is ~2.5 min.

## 42 (second run, median 3 accepted) — 10 Nov 2026 — blocked (step 3)
- Changed: step 2 committed ("feat(pitch): brief 42 step 2"). `medianFrames` 3 (in frames, on purpose). Delay 40 → 20 ms everywhere. Baseline: delay, delay-removed errors and Pierre's 6 allowed numbers rewritten (list in the report).
- **Tolerance change (Pierre's decision):** every `live.lowEndLost.p90.*` and `live.highEndLost.p90.*` now has tol 0.10 st; a worst-10% value on a small group is noisier than 0.02. Medians stay 0.02.
- **For brief 45:** after median 3 the reader reads **90.1%** of textbook single tones with the voice 2 semitones lower (was 92.3). Brief 45 must recover it.
- Tests moved: 4 anchor golden polylines (stored values); two guards loosened and flagged for review: clipCutMulti corridor 0.35 → 0.45 chao (xiaoshi 0.37, yiqian 0.43), toneAccuracy own tone 0.55 → 0.45 (jane_ma2 0.593 → 0.496; its lead grew 0.418 → 0.440). Report (fixtures/captures): fit 0.97 → 0.95, wiggle 0.063 → 0.061. Wall hits 0.
- Why blocked: step 3, fMin 55. Deep 0.5 low end lost 1.25 → −0.01 st (p90 3.30 → 0.16), Pierre −0.01, CPU 2.4% of the hop. But "voice where Praat is silent" rises 0.6–1.2 points (limit +0.3) in T1, T3, T4, pairs, and T4 delay-removed error p90 rises 0.07–0.11 (limit +0.05). Wider low windows (1536, 2048) gave no gain, more CPU (up to 5.1%). Code back at 70 Hz.
- Step 4 measured: Praat frames above 350 Hz: textbook 0.26%, natural 0.006%. fMax unchanged.
- For the rerun: the deep-voice fix needs a way to use 55 Hz without fake low frames in a normal voice. Options are in the report; all are outside this brief.

## 42 (third run, floor follows the speaker) — 10 Nov 2026 — blocked (step 3)
- Built, not committed: `speakerFloorHz` (clamp(centre/2, 55, 70), no centre → 70), tuning `pitchFloorLowHz`/`pitchFloorHighHz`, wired into game, Visualiser, mini game, checker, Calibration preview, clipCut/clipCutMulti; scorecard rows for deep stand-ins (fake voice, error p90, low-end p90). Diff saved: `docs/briefs/reports/42-step3-speaker-floor.patch`. Code is back at the step 2 commit (bench 0 FAIL).
- Pass: Jane unchanged (all 209 values). Deep 0.5 low end lost ≈ 0 (was up to 2.63 median, 4.06 p90). Deep 0.6 no worse. Pierre low end ≈ 0. CPU 2.4%.
- Miss: deep 0.6 fake voice in 7 groups (up to +1.3 points over Jane; at 70 it was under Jane). Deep error p90 vs Jane + 0.05 in 9 groups, but the stand-in already misses that at 70 (resampled audio is less clean): the check may be unfair. Pierre at 64.5 Hz: T3 heard −0.7, T4 p90 +0.03, pairs read 5/16 → 4/16.
- **Calibration talk step at 70:** a 90 Hz voice is measured 1.42 st too high (97.9 vs 90.2 Hz). Floor rule still gives 55; the grid sits 1.4 st high. For brief 44.
- **For brief 43:** report the corridor error for xiaoshi and yiqian again after re-measuring (limit 0.47; now 0.37 / 0.43).
- **For brief 45:** bring jane_ma2's own-tone score back above 0.55, or explain (now 0.496).
- Note: `npm run report` fit went 0.97 → 0.95 with median 3 (wiggle 0.063 → 0.061).
- The two loosened test guards are accepted by Pierre for now.

## 42 (fourth run, floor 0.6 × centre) — 10 Nov 2026 — blocked (step 3)
- Built, not committed: factor 0.6 version (`docs/briefs/reports/42-step3-speaker-floor-0.6.patch`). Code back at step 2 (bench 0 FAIL).
- Pass: Jane unchanged, Pierre unchanged (centre 129.1 → floor 70), deep 0.6 (floor 65) all 10 groups vs itself at 70, deep 0.5 low end lost (≈ 0), CPU 2.4%.
- Miss: deep 0.5 (floor 55) fake voice vs itself at 70: textbook T4 0.6 → 2.5, textbook pairs 1.5 → 2.5, natural T4 0.3 → 1.8, natural pairs 0.2 → 1.0 (limit +0.5); natural T4 error p90 0.26 → 0.33 (limit +0.05).
- For brief 44: the calibration talk step is still at 70; a 90 Hz voice is measured 1.4 st too high there.

## 42 review (strong model) — 10 Nov 2026 — steps 1–2 approved; step 3 approved with the fix list below
Reviewed: brief, report (all four runs), handover, diff `6ce627f..17b9b07`, both step-3 patches. No code changed by this review.

**Checked myself (MEASURED)**
- `npm run bench`: 209 numbers, 0 FAIL. `npm run test`: 136 files, 1827 passed. `npm run typecheck` clean. `npm run classifier-check`: wall hits 0 (only 4 real clips; weak evidence, as before).
- Delay 20 ms in every group (bench). Acceptance "≤ 25 ms": pass.
- The brief asks for "errors over 3 semitones and octave errors not above baseline + 0.2 points". **The scorecard has no such rows and the report did not measure it.** I measured it (scratch script, median 5 vs 3, live settings, Praat, delay removed):
  - Jane, all 10 groups: errors over 3 st 0.00–0.49% → 0.00–0.49% (never higher). Octave errors: same or +0.04 points (natural pairs). Pass.
  - Pierre's phone clips: over 3 st 0.06% → 0.12% (1 frame → 2 of 1,700). Error p90 0.30 → 0.21. Pass.
  - Old iPhone captures: 0% → 0%. Error p90 0.24 → 0.14.
  - "Spikes" (one frame more than 1.5 st off the line between its two neighbours, i.e. a visible jerk): Jane 0.00–0.66% → 0.00–0.76%; largest rise natural pairs 0.17% → 0.62%. Pierre 0.17% → 0.17%. That is about one small jerk per 8 s of voice at worst. Acceptable.
  - Real wind at 10 dB (out of scope, for the record): over 3 st 0.35% → 0.65%, spikes 0.22% → 0.65%. Median 3 is a little less robust in loud noise. Revisit when noise is in scope.

**Code read (READ IN CODE)**
- `src/pitch/` stays pure. New fields are on `PitchTrackerConfig`; `minVoicedRunMs` goes through `tuning()`. Correct.
- At 48 kHz every derived count equals the old one (test `msSettings.test.ts`). Correct.
- Wording to fix: the handover says 44.1 kHz devices "had 8% longer waits ... now fixed". Only the slew speed is fixed. The waits round to the same frame counts (3, 5, 3), so they are still about 8% longer in time at 44.1 kHz. Harmless; the sentence is wrong.
- `medianFrames` must be odd; nothing checks it. Add a one-line guard or a test.

**A real-device risk this brief does not cover (ASSUMED, not measured)**
- Frame size (2048), hop (1024) and `detectWindow` (1024) are in samples. The app takes the device's own sample rate (`src/audio/mic.ts:244`). If a device gives 16 or 24 kHz (some Bluetooth headsets in call mode) one hop is 43–64 ms and the line is 43–64 ms late again; at 96 kHz the 1024-sample window is 10.7 ms and cannot hold one cycle of a voice under 94 Hz. The ms settings do not help with this. Simplest known fix: ask for a 48 kHz context (`new AudioContext({ sampleRate: 48000 })`; the browser resamples). It is in `src/audio/`, needs a real iPhone test (hard rule 4), and is out of brief 42. **Proposed as its own small brief.** First step there: log which sample rates real devices give.

**Step 3 (deep voices): approve the 0.6 patch. The four "misses" came from a wrong yardstick that I set.**
- I told the session to compare the 0.5 stand-in with itself at 70 Hz. At 70 Hz that voice loses the whole bottom of its falls, so it also draws no frames there, true or false. It looked clean because it was deaf.
- The fair comparison is Jane today, because the stand-in is Jane's audio at half pitch: its 55–70 Hz is her 110–140 Hz, which her tracker already hears. Against Jane's own baseline + 0.3 points: textbook T4 2.5 vs 2.3 (pass), natural T4 1.8 vs 2.4 (pass), natural pairs 1.0 vs 1.0 (pass), textbook pairs 2.5 vs 1.6 (**miss by 0.6 points**). Error p90 natural T4 0.33 vs Jane 0.28 + 0.05 (pass, at the limit).
- The deep voice gets less empty room under its voice (floor = 0.60 × centre) than Jane has today (70 Hz = 0.39 × her centre). So it cannot be looser than what ships.
- Jane and Pierre do not change at all (floors stay 70). Only voices with a centre under 117 Hz are touched.
- One miss of 0.6 points on a slowed-down copy is accepted. It is a stand-in; a real deep voice is still needed before anyone claims deep voices "work".

**Fix list to finish brief 42 (same session, same stop rule)**
1. Apply `docs/briefs/reports/42-step3-speaker-floor-0.6.patch` as is.
2. Scorecard: for the deep stand-in rows, compare with **Jane's own baseline row of the same group** (+0.3 points fake voice, +0.05 st error p90), not with the stand-in at 70. Record textbook pairs 0.5 (2.5 vs 1.6) as an accepted, named exception in the baseline with this review as the reason.
3. Scorecard: add three rows per style and group, live settings: errors over 3 st %, octave errors %, spikes over 1.5 st %. Baseline = values after median 3. Tolerance +0.2 points. Without these rows the brief's own acceptance line cannot be checked by later briefs.
4. Add the odd-number guard or test for `medianFrames`.
5. Correct the 44.1 kHz sentence in the 42 handover entries.
6. Full checks, report, handover entry, commit. Then brief 42 is done; no second review needed unless a number outside this list moves.

**For later briefs**
- 43: targets must be measured with the speaker's floor (Jane → 70, no change). Report the corridor error for xiaoshi / yiqian again (limit 0.47; now 0.37 / 0.43).
- 44: the calibration talk step still searches from 70 Hz, so a 90 Hz voice is measured 1.4 st too high, and its floor becomes 58.7 instead of 55. Fix in 44 (for example run the talk step with the 55 Hz floor when the first estimate is under 117 Hz).
- 45: reader with the voice 2 st lower, textbook: 90.1% (was 92.3). `jane_ma2` own-tone score 0.496 (guard loosened to 0.45): bring back above 0.55 or explain.
- "Voice heard %" is a yardstick, not a target (see the brief 40 entry).

## 42 fix list — 10 Nov 2026 — items 3–5 done, items 1–2 blocked
- Done: 30 scorecard rows (over 3 st, octave 11–13 st, spikes > 1.5 st; values after median 3; tol +0.2) added to the baseline; `medianFrames` must be odd (throws, tested); 44.1 kHz sentence corrected. Bench 239 numbers, 0 FAIL; 1828 tests pass; report and wall hits unchanged.
- Blocked: against Jane's baseline rows, 4 deep rows miss, not 1. Named exception: deep0.5 fake voice textbook pairs 2.5 vs Jane **1.99** (the review said 1.6). Not named: error p90 deep0.6 textbook T4 0.32 (limit 0.30), deep0.6 natural T4 0.35 (limit 0.33), deep0.5 textbook T4 0.31 (limit 0.30). The 0.6 rows miss at 70 too (0.31, 0.34). Patch not applied.
- Next: if Pierre names rows 2–4 as exceptions, apply the 0.6 patch, store the 4 exceptions, run checks, set done.

## 42 finish run — 10 Nov 2026 — blocked on one row
- 0.6 floor applied and committed with the 60 deep rows (Jane-referenced) and 4 exceptions at exact limits. Bench 299 numbers, 1 FAIL: deep0.6 textbook T3 error p90 0.244 vs limit 0.240 (same at 70 Hz: stand-in, not floor). Earlier pre-check rounded to 2 decimals and missed it. Waits for Pierre: 5th exception, then done.

## 42 — 10 Nov 2026 — done
- 5th exception added (deep0.6 textbook T3 error p90, limit 0.244). Bench 299 numbers, 0 FAIL. Shipped in 42: ms settings, median 3 (20 ms delay), floor clamp(0.6 × centre, 55, 70), gross-error and deep rows on the scorecard.
- Open for later briefs: 43 (xiaoshi/yiqian corridor error, measure targets with the speaker's floor), 44 (talk step at 70 measures a 90 Hz voice 1.4 st high), 45 (reader 90.1% voice 2 st lower; jane_ma2 0.496), a small brief on device sample rates (review entry).

## 43 One ruler for the targets — 11 Nov 2026 — blocked (step 1)
- Changed: `cutClip` / `measureContour` / `multiSyllableSpan` take optional tracker `overrides` (default empty, callers unchanged); `clipNoiseFloor()` (p10 frame RMS, ≥ 1e-4); `src/dev/bench39/make-shapes.mjs` (steps 1–6, stops at the ruler check). No shapes file, no dev switch yet. Commit: see `git log` ("brief 43").
- Scorecard: nothing moved. `npm run bench` 299 numbers, 0 FAIL; 1831 tests pass; typecheck clean.
- Jane's ruler, all 477 textbook words (final listener, per-clip gate, tone window, creak > 10 st under left out, 2/98): middle 197.6 Hz, up 8.49 st, down 8.00 st. MEASURED.
- Why blocked: first tone on that ruler **3.44** (needs 3.8–4.4). Fourth-tone start 4.87 (pass).
- **Surprise (MEASURED):** the 120 older takes (session 2026-08-07) have the same middle as the newer clips (198.7 vs 196.7 Hz) but a much lower first tone: older 3.32 (30 words), newer 4.05 (14 words; Praat 4.06). The Phase A preview used the 357 newer clips only, so its 4.06 did not cover the older words. No percentile choice fixes this.
- Decision for Pierre (options in the report): accept a lower first tone for the older words (change the check), ruler from the newer clips only, or re-record the 120 older single words.
- For the rerun: `make-shapes.mjs` already holds steps 3 and 5; they run after the ruler check. On an ±8 st ruler, a pitch error in semitones is about 1.8× larger in chao than on the ±15 st measuring board; re-check xiaoshi / yiqian (limit 0.47) on the new ruler.

## 43 second run (textbook anchors, Pierre's decision) — 11 Nov 2026 — blocked (decision step 4)
- **Decision:** the ruler uses textbook anchors, same rule as the player: chao 3 = middle, chao 5 = p90 of first-tone frames, chao 1 = p10 of third-tone frames (`computeRangeHalvesFromExtremes`), from the 357 newer textbook clips. **The "first tone near 4" preview (Phase A + Praat entry) is withdrawn.** Plan doc Decision 2 and "What one ruler means" rewritten.
- Changed: `make-shapes.mjs` rewritten to the decision (ruler, checks 2–4, T1 offset, per-clip gate count, older-take timing, coverage, tables). `39-phase-b-plan.md`. Nothing else; no shapes file yet.
- Jane's ruler (MEASURED): middle 196.7 Hz, up 5.75 st, down 7.25 st. Check: first-tone level 4.58, third-tone low 1.00 (both pass).
- Top / bottom line share (newer textbook): T4 31% / 13%, T1 11% / 0%, T3 3% / 11%, pairs 18% / 5%.
- Why blocked (MEASURED): older 2026-08-07 vs newer, T3 end 4.44 vs 5.00 (0.56), T2 low 1.86 vs 1.56 (0.30, over by < 0.005). T4 0.18. The older session differs in more than the first tone.
- Scorecard: nothing moved (no production or `src/pitch/` change).
- **For brief 44:** the player keeps the T1 / T3 anchors. Brief 44 adds the middle from tone syllables and slow learning of top and bottom from the player's own first tones and low tones. "Standard halves" are only a starting guess before any T1 / T3 data.
- **For brief 45:** the reader works on the same anchors. Expect many fourth-tone frames on the top line (31% for Jane), so the reader must not rely on height above 5.
- **For brief 48:** the older first-tone words get a shared lift in the dev file (when 43 runs) and must be re-recorded before go-live; the list is printed by `make-shapes.mjs`.

## 43 third run (T2 / T3 session gaps accepted) — 11 Nov 2026 — blocked (acceptance: heights)
- Changed: `make-shapes.mjs` (step 4 T2/T3 accepted; `--gate fixed` and `--out` for diagnostics); `heights.mjs --v2 [--style natural]` (targets and ruler from the shapes file, Jane clamped; `SHAPES=<path>` to point elsewhere). `shapes-v2.json` made but not committed; dev switch not built.
- Scorecard: nothing moved (bench 299, 0 FAIL; 1831 tests).
- Facts (MEASURED): older T1 lift +1.085 chao (30 words, list in report). Older raw takes reproduce published timing within 0.3 ms (120/120). Per-clip gate moves 247/477 textbook corridors by > 0.25 chao.
- Why blocked: heights gap T2 0.26, T3 0.31, T4 0.70 (limit 0.20); T4 inside p10 49, shape 0.95. Pairs pass (0.41 → 0.20).
- **Surprise:** the misses are about speed, not height. Her T4 falls 5.0 → 1.4 between 40% and 70% of the word and then holds; the 3-point template falls slowly over the whole second half. T2/T3 reach the top in the last fifth; the templates do not. Same issue in today's shapes (T4 0.59). With the old fixed gate on the new ruler: T2 0.19, T3 0.29, T4 0.49.
- Second cause: the per-clip gate keeps quiet, very low frames at the edges; template end points snap to the bottom line (yisheng11, yuyan32, wai4, lao3).
- Decision for Pierre: let targets follow the voice's speed (extra knee point), or loosen the T2–T4 limit; and how to treat quiet edge frames.

## 43 fourth run (knee nodes + gate floor) — 11 Nov 2026 — blocked (acceptance: T2, T3 gap)
- Changed: `templateContourKnee` + `KNEE_CHAO` 0.3 in `src/dev/clipCut.ts` (dev-only; `templateContour` and published shapes unchanged); `clipNoiseFloor(samples, sampleRate, f0Center)` now also ≥ 0.1 × median voiced RMS / rmsMult (`CLIP_GATE_VOICE_SHARE`); `heights.mjs --v2` prints by-tenth tables and edge-point counts. `shapes-v2.json` not committed.
- Scorecard: nothing moved (bench 299, 0 FAIL; 1831 tests).
- Acceptance (MEASURED): gap T1 0.127, T2 **0.248**, T3 **0.206**, T4 0.276 (allowance 0.30, inside 100/91 passes), pairs 0.198. Inside and shape match pass everywhere. Knees lost: 0.
- Ruler now 197.4 Hz / up 5.75 / down 7.25 (the gate floor moved the middle 0.7 Hz).
- Why: T2 leaves its low too early (no node between low and knee); T3 drops from its start too early. T4 now fits.
- Decision for Pierre: a T2 mid-rise node (and maybe a T3 early-hold node), or name T2 ≤ 0.25 / T3 ≤ 0.21 as allowances.

## 43 fifth run (T2 mid-rise node) — 11 Nov 2026 — blocked (acceptance: T3 gap 0.206)
- Changed: `templateContourKnee` T2 = start, low, mid-rise, KNEE, end. Dev-only; published templates unchanged. `shapes-v2.json` not committed.
- Scorecard: nothing moved (bench 299, 0 FAIL; 1831 tests).
- Acceptance (MEASURED): gap T1 0.127, T2 0.118 (was 0.248), T3 **0.206**, T4 0.276 (allowance), pairs 0.198. Inside and shape match pass everywhere.
- Why: T3 target falls from its start at once; she holds near 2.3–2.5 for the first fifth.
- Decision for Pierre: a T3 early-hold node, or a T3 ≤ 0.21 allowance.
