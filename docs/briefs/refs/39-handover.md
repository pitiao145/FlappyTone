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

## 43 sixth run (T3 ≤ 0.21 accepted) — 11 Nov 2026 — blocked (xiaoshi / yiqian)
- Allowances now named by Pierre: T4 gap ≤ 0.30 (if inside passes), T3 gap ≤ 0.21. With them every heights check passes (T1 0.127, T2 0.118, T3 0.206, T4 0.276, pairs 0.198).
- Why blocked (MEASURED, `node src/dev/bench39/pairs-fixtures.mjs`): worst corridor error on Jane's ruler xiaoshi **0.877**, haowan **0.471** (limit 0.47); meiguo 0.393, yiqian 0.455. xiaoshi misses a bend in the rise of 時 (gate is not the cause). On this ruler one chao up is ~2.9 st vs 7.5 on the old board, so the same miss counts ~2.5× more.
- Dev switch built, build grep clean (0 files for every string), then reverted and saved as `docs/briefs/reports/43-dev-switch.patch` (it needs the uncommitted shapes file).
- Scorecard: nothing moved (bench 299, 0 FAIL; 1831 tests).
- Decision for Pierre: a closer pair fit on the new ruler, or judge pairs by the heights numbers and keep the 0.47 guard on the ±15 st board.

## 43 seventh run (refined pair fit) — 11 Nov 2026 — blocked (pairs over 0.47: 41.5%)
- Changed: `refinedMultiSyllablePolyline` + `PAIR_FIT_MAX_GAP` 0.35, `PAIR_FIT_MAX_EXTRA` 2 in `src/dev/clipCutMulti.ts` (dev-only); `make-shapes.mjs` uses it for multi-syllable words and prints before/after pair stats; `pairs-fixtures.mjs` prints before → after.
- Scorecard: nothing moved (bench 299, 0 FAIL; 1831 tests).
- Fixtures (MEASURED): haowan 0.471 → 0.370, meiguo 0.393 → 0.334, xiaoshi 0.877 → 0.222, yiqian 0.455 → 0.318. All pass.
- All pairs (MEASURED): textbook over 0.47 66.3% → 41.5% (limit 5%); natural 39.6% → 15.0%. Median nodes 8 → 9.
- Why: of 103 textbook pairs still over, the worst frame is outside both syllables in 53 (the join, or before/after) and in a syllable's 5% edge in 41; only 9 used their budget.
- Decision for Pierre: measure the pair check inside syllables without the edges, let the refinement search the join and edges, or keep the guard on the four fixtures only.

## 43 One ruler for the targets (final) — 11 Nov 2026 — done
- Changed: `src/dev/local/shapes-v2.json` (committed, numbers only); dev switch `src/dev/shapesV2.ts` + three DEV-gated call sites in `src/data/words.ts`; `make-shapes.mjs`, `heights.mjs --v2`, `pairs-fixtures.mjs`; dev-only `templateContourKnee`, `refinedMultiSyllablePolyline`, `clipNoiseFloor`, tracker `overrides` in `src/dev/clipCut*.ts`. Published shapes, `DEFAULT_POLYLINES`, `toneAverages` unchanged. Commit: see `git log` ("brief 43 done").
- Scorecard: nothing moved (299 / 0 FAIL; 1831 tests). Build grep clean.
- Ruler (MEASURED): middle 197.4 Hz, up 5.75 st (T1 p90), down 7.25 st (T3 p10), from the 357 newer textbook clips; natural and older takes on the same ruler.
- Heights (MEASURED): T1 0.127, T2 0.118, T3 0.206, T4 0.276, pairs 0.178; inside ≥ 100 / 91; shape ≥ 0.967.
- **Named allowances:** T3 gap ≤ 0.21; T4 gap ≤ 0.30 (with inside passing). Pair worst-frame guard 0.47 applies to the four fixtures only; all pairs are judged by heights.
- **Re-record before go-live (brief 48):** the 30 older first-tone words lifted by one shared +1.08 chao (`"adjusted": "t1-session-offset"`): ma1b, ba1, san1, qi1, tian1, hua1, shu1, dong1, jia1, che1, shuo1, chi1, he1, shan1, xin1, kai1, mao1, chun1, gao1, zhong1, duo1, jie1, tang1, bao1, bei1, fei1, xing1, xiang1, bing1, ting1. The older T3 rises also end lower (4.42 vs 4.92), accepted.
- **For brief 46 (Pierre judges both in the dev build):** 53 textbook pairs have their worst frame in the join between syllables, where the fit puts no node. And the gate could end soon after the knee (tail trim): many targets now reach their end value well before t = 1.
- For brief 44/45: the player keeps T1 / T3 anchors (see plan doc). About a third of Jane's T4 frames sit on the top line.
- Per-clip gate: noiseFloor = max(p10 frame RMS, 1e-4, 0.1 × median voiced RMS / 3). It moves 190 / 477 textbook corridors by > 0.25 chao vs the fixed gate.
- **Pierre's check (11 Nov 2026):** flew the new shapes in the dev build (switch on). Verdict: looks good; the first tone is easier to get right. Note: the switch only exists on this branch; run `npm run dev` from the worktree and set `ft.shapesV2` on that exact address (each port keeps its own storage).

## 44 One ruler for the player — 11 Nov 2026 — blocked (step 1)
- Changed: `src/dev/bench39/player-halves.mjs` (new, dev-only), report `docs/briefs/reports/44-one-ruler-player-calibration.md`, brief status. No production code, no `tuning()` change. Commit: see `git log` ("brief 44").
- Scorecard: not run; nothing outside `src/dev/bench39/` and docs changed.
- Why blocked (MEASURED, `node src/dev/bench39/player-halves.mjs [--clean]`): same rule as Jane's ruler (middle = median, up = T1 p90, down = −T3 p10, creak out). Jane up 5.75 / down 7.25 (brief 43). Pierre up 4.5 / down 4.0 (Praat and live tracker agree; middle 132.4–132.7 Hz). Without his two off-shape T3 clips: up 4.25–4.5 / down 4.25. **Down-half gap 3.0–3.25 st** (limit 2). Up-half gap 1.25–1.5 (ok).
- Surprises: brief 41 said Jane's halves "fit" Pierre with 2–4 st spare. That used the old 2/98 preview (8.8 / 7.9) and his 5/95 range. On the brief 43 rule the down half is still 3 st too deep for him: the standard grid puts chao 1 about 3 st under his lowest third tone.
- Decision for Pierre (options in the report): top/bottom step from the start (brief's rule), standard = smaller voice, standard = average of the two, or record more voices first.
- For the rerun: talk step at 70 Hz still measures a 90 Hz voice 1.4 st high (42 review); the middle step must use the speaker's floor.

## 44 second run (option 1: top/bottom step) — 11 Nov 2026 — blocked (acceptance 2 cannot pass)
- Changed: `src/dev/bench39/reader-on-ruler.mjs` (new, dev-only), report section, brief status. No production code.
- Scorecard: 299 / 0 FAIL, unchanged. Reader today: calibrated textbook 98.9, natural 91.0 (baseline 97.8 / 89.1).
- Why blocked (MEASURED, `node src/dev/bench39/reader-on-ruler.mjs`): on the true ruler (what acceptance 1 makes the learner reach) the reader gets textbook 93.4 (−5.5), natural 78.2 (−12.8). Limit 3 points. The cause is the middle (181.3 → 197.4 Hz, +1.47 st), not the halves (ruler halves at the old centre: 97.8 / 91.0). The reader is fitted to the old centre; that is brief 45's job.
- Also open: brief step 3 says learn p95/p5 of all frames; the plan says T1 p90 / T3 p10. Follow the plan? Standard halves under option 1: average 5.25 / 5.75?
- Decision for Pierre: acceptance 2 as (a) learned-from-−2 vs learned-from-correct, (b) run 45 first, or (c) keep the talk middle.

## 44 third run (Pierre's decisions 1–5) — 11 Nov 2026 — blocked (step 7: middle not learnable in 20 gates)
- Decisions recorded: acceptance 2 = learned-from-−2 vs learned-from-correct (within 3 points); learning rule = T1 p90 / T3 p10 (plan, not p95/p5); standard halves 5.25 / 5.75; small misses → named allowances, stop only for a clear failure.
- **Brief 45 starting numbers (MEASURED, `reader-on-ruler.mjs`):** reader on the true ruler, singles right: textbook **93.4%**, natural **78.2%**. Target for 45: back to today's 98.9 / 91.0 or better on the new ruler. Cause: the middle moves +1.47 st (181.3 → 197.4 Hz), not the halves.
- Changed (flag `playerRulerV2` off, nothing wired into the game): `learnGridFromGate` + helpers in `src/pitch/calibration.ts`; 15 tuning fields + `gridLearnParams()`; `src/dev/bench39/gridsim.mjs`, `grid-learn.mjs`, `middle-words.mjs`. Commit: see `git log` ("brief 44 third run").
- Checks: 1831 tests pass, typecheck clean, `npm run bench` 299 / 0 FAIL (full re-run, `src/pitch/` hash changed; no number moved), build + grep clean.
- Step 2 (MEASURED): middle from a first-tone + third-tone word is closest: Jane −0.09 st, Pierre +0.66 (ma words) / +1.15 (all T1+T3 words). Talk step today ≈ −1.5 st for Jane.
- Why blocked (MEASURED, `grid-learn.mjs`): Jane textbook from a −2 start, gate 20 middle −1.85 st, within 1 st for good only from gate ~104 (natural ~40). Pierre passes every start (≤ 0.82). Cause: sampling noise of the middle — the median of 20 random Jane words misses her full middle by 2.61 st (p90; 2.29 with tone-class weighting). No rate/memory/step setting fixes it (sweep: 0–6 of 30 starts pass).
- Surprise: frames, not gates, must be weighted (the ruler is a median of frames; pairs are long and sit higher). Top/bottom must be absolute anchors or they copy the middle's wobble. Both are in the code.
- Decision for Pierre: (a) middle from frames relative to each word's target line (word mix no longer matters; recommended), (b) relax to ~100 gates, or (c) middle from calibration only, learn top/bottom in play.

## 44 fourth run (middle against word targets) — 14 Nov 2026 — done (named allowances; strong-model review required)
- Changed: `learnGridFromGate` (middle from "pitch minus target line" votes; top T1 p90, bottom T3 p10 as absolute lines; frames counted; per-run cap) and `computeMiddleHz` in `src/pitch/calibration.ts`; `src/game/playerRuler.ts` (record `toneflap.ruler.v1`, seeded from settings v3, which it never changes); Run `onGateVoice` hook + `MIDDLE_WORD_IDS`; Game.tsx learns and moves the tracker between gates; GameApp seeds halves after the flight (standard 5.25 / 5.75 fallback) and turns off the recal offer; Calibration "middle" step (媽, 馬 ×2, low floor for deep voices); dev switch `ft.shapesV2` → `playerRulerV2`; scorecard section 6; ARCHITECTURE note. Commit: see `git log` ("brief 44 done").
- Scorecard: 306 numbers, 0 FAIL (299 old unchanged; 7 new). Tests 1847 pass. Report unchanged (fit 0.95, wiggle 0.061). Wall hits 0. Build grep clean.
- Acceptance (MEASURED, `grid-learn.mjs`, fixed order): Jane textbook worst 0.88 / 0.64 / 1.05; Pierre 0.53 / 1.17 / 1.13. Allowances named: Jane halves −30% 1.05; Pierre +2 1.17, halves −30% 1.13. Reader after learning: textbook 94.5 vs 93.4, natural 75.4 vs 75.4 (pass).
- Surprises: plain median of 20 words misses Jane's middle by up to 2.6 st; votes against targets bring it to ~0.2 st. Pierre over 10 orders passes only 9/30 (worst 1.86): 6 first-tone clips of varying height, 4 single words without a Jane target. Natural speech drives the learned top to the 3 st floor.
- For the reviewer: Pierre's 10-order spread; per-run cap with run = 10 gates ASSUMED; target line on the player's own clock (first to last voiced frame).
- For brief 45: reader starts at textbook 93.4%, natural 75.4% on the learned ruler (78.2% on the true ruler); target 98.9 / 91.0.
- For brief 48: privacy-policy check (pitch histograms on device); real iPhone test of the middle step (example audio with the mic open).

## 44 review (strong model) — 14 Nov 2026 — NOT approved: 2 fixes, then done

Reviewed commits `6ccf24e`, `54909c4`. No code changed by this review.

**Reproduced (MEASURED):** `npm run bench` 306 numbers, 0 FAIL. `grid-learn.mjs` gives the report's table exactly (Jane 0.88 / 0.64 / 1.05, Pierre 0.53 / 1.17 / 1.13, deterministic). Reader after learning 93.4 / 94.5 textbook, 75.4 / 75.4 natural. `npm run test` 1847 pass, typecheck clean, build + grep clean (`toneflap.ruler.v1` is in the app bundle, as expected: the code ships with the flag off). Flag off = no behaviour change (READ IN CODE: every new path sits behind `playerRulerV2` or the optional `onGateVoice`). The three named allowances are fine.

**Passes the numbers, wrong for a real voice (MEASURED, 400 gates, Jane's clips through `simulate`, start = her correct ruler):**

| case | result | verdict |
|---|---|---|
| Pairs only, voice 0 st off | stable (mid −0.1) | ok |
| **Pairs only, voice 1 st lower** | middle ends 1.9 st too low; halves 8.6 up / 4.4 down (true 5.7 / 7.3) | **FIX 1** |
| **Pairs only, voice 2 st lower / higher** | middle 2.8 too low / 1.5 too high; halves 9.9 / 3.1 and 3.2 / 9.8 (at the clamps) | **FIX 1** |
| **Natural style, single words** | up half 5.73 → 3.00 (the clamp) and stays; reader on natural 77.7% → 72.0% | **FIX 2** |
| Says the third tone as a second tone | bottom line rises 2.2 st (down half 7.33 → 4.75); middle ok | for Pierre, below |
| Flat learner (range ×0.3) | grid shrinks to 3 / 3 | same as today's limits; ok |
| Another voice 7 st lower on 1 gate in 4 | all three lines within 0.7 st | ok |
| Another player 7 st lower, every gate | follows in ~120 gates (1.5 st per run) | ok, as designed |
| Middle step, live rule (first 600 ms of voice per take), Pierre | +0.24 to +0.81 st | ok |

**FIX 1 — pairs-only play runs away.** Cause (READ IN CODE, `learnGridFromGate`): pairs feed only the middle; top and bottom hold still in pitch. So when the middle moves, one half grows and the other shrinks. The middle votes use those halves (`offset = (c − 3) / 2 × half`), so the changed halves push the votes further the same way. A loop, until a half hits 3 or 10. The acceptance did not see it because it ran on single words only. Direction: a middle move carries top and bottom with it (halves kept); first-tone and third-tone data then correct their own line. The votes then do not depend on how far the middle has moved. Check with a new scorecard row: pairs only, voice ±2 st, 400 gates, all three lines within 1 st and halves within 1 st of the start.

**FIX 2 — natural style collapses the top.** Cause: the top learns from every single first-tone gate, but a natural first-tone target does not sit at line 5 (Jane's natural first tones are ~2 st above her middle). The player's top then moves down to their natural first tone, and the grid is no longer the one ruler. Direction: a gate feeds the first-tone pool only when its own target reaches the top line (target max ≥ about 4.8 chao), and the third-tone pool only when its target reaches the bottom (min ≤ about 1.2). One rule, no style flag. Check with a new scorecard row: Jane natural, game mix, 400 gates: up and down halves within 1 st of her ruler.

**For Pierre (a product choice, not a fix now).** The bottom line is "what you do on third-tone gates", wall hits included. A learner whose third tone is not low gets a higher floor (measured: +2.2 st), so the game asks less of them. Today's calibration flight has the same property once; the learning now repeats it every gate. Option for later: top and bottom learn only from gates that did not hit a wall. Judge it when flying.

**Notes for 46 / 48.** Once the pair syllable finder exists (46), first-tone and third-tone syllables inside pairs can feed the pools. Other screens (Visualiser, TONEder, demos) still read the old settings record, not the ruler: decide in 48. Privacy wording for the stored pitch histograms: 48.

## 44 review fixes (fifth run) — 14 Nov 2026 — done
- Fix 1: a middle move carries top and bottom (halves kept). Pairs only ±2 st, 400 gates: lines 0.07 st, halves unchanged (was a runaway to the 3 / 10 clamps).
- Fix 2: anchor gates by target reach, `gridAnchorTopChao` **4.0** / `gridAnchorBottomChao` **1.5** (not the review's ~4.8 / 1.2: MEASURED, only 23% of textbook first-tone targets reach 4.8; natural first tones peak at most 3.71, textbook p10 4.18). Jane natural, 400 gates: halves within 0.43 st of her ruler (top untouched at 5.73).
- Moved (MEASURED): Jane −2 / +2 / halves −30%: 0.88 → 0.54, 0.64 → 0.95, 1.05 → 0.86 (Jane allowance dropped). Pierre −2: 0.53 → 1.09 (new allowance 1.10). Reader after learning, textbook correct / −2: 93.4 → 94.5 / 94.5 → 92.3; natural 75.4 → 80.6 / 80.1.
- Scorecard 309 numbers, 0 FAIL (3 new rows; 7 brief-44 rows updated). Tests 1849. Report unchanged, wall hits 0, build grep clean. Commit: see `git log` ("44 review fixes").
- For brief 45: the reader on the learned ruler now starts at textbook 94.5%, natural 80.6% (from a correct start).
- Open (reviewer's product note, not done): the bottom learns from third-tone gates even when they hit a wall, so a learner whose third tone is not low gets a higher floor. Judge when flying.
- Open (Pierre, 14 Nov): the calibration "middle" step repeats the flight's words (媽, 馬); revisit the calibration flow later.

## 45 Reader and tone accuracy on the new ruler — 15 Nov 2026 — done (strong-model review required)
- Changed: `ToneReaderSettings` + `readerSettings()` in `src/game/toneClassifierV2.ts` (flag off = the `toneV2*` fields exactly); `tuning().toneReaderRuler` (fitted set); `src/game/toneAveragesV2.ts` (generated by `npm run make-tone-averages-v2` from `shapes-v2.json`; one read-only catalog select for natural spoken tones); `averagedShapes()` in `toneAccuracy.ts`; `shapeForTone` → `DEFAULT_POLYLINES_V2` (ma1b, ma2, ma3b, ma4b) when the flag is on and the corridor is not Lab-edited; `classifier-check --ruler`; `reader45.mjs`, `fit45.mjs`, scorecard section 7; 11 tests. Commit: see `git log` ("brief 45").
- Scorecard: 309 old rows unchanged (0 FAIL); 63 new rows (held-out half, flag on). 1860 tests pass. classifier-check wall hits 0 (also with `--ruler`). Build grep clean. No golden snapshot moved.
- Acceptance (MEASURED, held-out half): singles textbook 100.0 / natural 91.2; voice −2 st, no learning, natural 80.7; with brief 44 learning textbook 98.2 vs 100.0, natural 91.2 vs 91.2; grid ×0.7 second tone 75.0 / 75.0; Jane's tone accuracy median textbook 0.767 → 0.840, natural 0.698 → 0.790 (height weight 0: 0.866 / 0.804).
- What the reader does now: T2/T3 from turn time, rise share, drop share and drop only (absolute `low` vote out); T4 needs start ≥ 2.6 AND fall ≥ 1.6 chao. Five rule-8 guards (read unchanged, only "decisive" off): T1 tail ≤ 3.0; T4 start ≤ 3.5; T2 low on the bottom line (≤ 1.05); T2/T3 after a skipped onset scoop; T2/T3 read that flips with the line moved ±0.6 chao or stretched ×0.7 / ×1.4. Textbook wall hits on all of Jane's clips: 0 in every grid case.
- Surprises: (1) The old board and the ruler share their top and bottom lines in Hz (130 / ~273 Hz); only the middle moved (+1.47 st). The bottom-line cut-off is not new but hurts more once the reader stops using height: a cut dip loses its depth. (2) Coordinate descent on the fit half overfits (5 textbook T2 clips); median anchors generalise (checked by swapping halves). I saw held-out numbers before switching method; disclosed in the report. (3) jane_ma2's own-tone score is 0.455 on her ruler: the capture ends in a release drop no T2 average has. Not recoverable by the reader.
- Worse: third tone on a miscalibrated grid (natural ×1.4 42%, +2 st 69%, −2 st 62%; textbook −2 st and ×1.4 69%). Same as the old reader on the ruler. Tone accuracy T1 textbook 0.821 → 0.775.
- For the reviewer: the five guards are product rules; check them. Natural −2 st passes by one clip. Pierre's `shu2_1` reads a decisive T3 on his own ruler with both readers.
- For brief 46: pairs still go through `readContourSyllables` → `classifyToneV2`; with the flag on they get the ruler set. Pair numbers on the ruler are not measured yet.
- For brief 48: site pages (checker, tone chart) still read `toneAverages.ts`. The V2 averages ship in the bundle behind the flag.

## 45 review (strong model) — 15 Nov 2026 — APPROVED (no fix required; 3 notes)

Reviewed commit `11484df`. No code changed by this review.

**Reproduced (MEASURED):** `npm run bench` 372 numbers, 0 FAIL; the baseline diff is additions only (441 lines added, 0 removed), so no old row moved. Held-out: singles textbook 100.0, natural 91.2; voice −2 st without learning, natural 80.7; with learning 98.2 / 91.2; narrow grid second tone 75.0 / 75.0; tone accuracy median 0.767 → 0.840 and 0.698 → 0.790; textbook wall hits 0 in all five grid cases. Pierre 21/24 and 22/24 on his own ruler. `npm run test` 1860 pass, typecheck clean, `classifier-check` (and `--ruler`) 0 wall hits, build + grep clean. Flag off = the old `toneV2*` values exactly (READ IN CODE, `readerSettings()`).

**Extra checks, not in the brief (MEASURED, flag on, Jane's ruler):**

| check | result | verdict |
|---|---|---|
| Held-out half vs fit half vs all clips | held is the harder half in every case (natural calibrated: held 91, fit 97, all 94) | no sign of overfitting |
| Does a WRONG tone still cost a heart? (textbook clip of tone X at a gate of tone Y) | old reader 75% flagged, new 78%. Said T2 at another gate: 18% → 47%. Said T3: 59% → 50%. T1 and T4: 100% both | the guards did not make the reader blind |
| Same, on a wrong grid | 66–80% flagged; T2↔T3 only: 21–54% | ok: unsure reads take no heart (rule 8) |
| Faster or slower speech (time ×0.6 to ×1.4), textbook | 100% right, 0 wall hits at every speed | ok |
| Same, natural | 88–94%; first tone falls to 66% at ×0.6 (the 350 ms minimum, unchanged rule) | note 3 |
| Natural clips, decisive wrong reads | 1 of 211 calibrated, 3 of 211 on a wrong grid | note 2 |

**Note 1 — third tone on a grid that is too wide.** All clips, grid ×1.4: third tone right 73% textbook, 56% natural (read as second tone). Cause (MEASURED): the "judged on depth alone" rule (`floorRule`) still reads absolute height, with anchors only 0.26 chao apart (`low: [1.26, 1]`). With the rule off: 86% / 83%, and natural +2 st 81 → 90. Cost: second tone, textbook calibrated 100 → 94, +2 st 100 → 88. A grid that is too wide is the likely case for a learner (Pierre's range is 4.5 / 4.0 against standard halves 5.25 / 5.75). It takes no heart, but stats and feedback then say "second tone" for a correct third tone. Not required now: decide after Pierre flies; a small follow-up (rule off, or its limit as a share of the dip).

**Note 2 — natural gates.** 1 to 3 decisive wrong reads in 211 natural clips. Fine while natural and pair gates take no heart (today's rule). Check again before that rule ever changes.

**Note 3 — not covered by any number here.** (a) The live gate path with the flag on (the bench reads whole clean clips, not gates): Pierre's flying is the test. (b) Pairs on the ruler: brief 46. (c) Pierre's `shu2_1` decisive third-tone read: same in the old reader, still open. (d) Very fast first tones (under 350 ms) read as "none".

**Process:** the builder looked at held-out numbers once and said so. The method it then chose (anchors = medians of the fit half) has no free search, and the fit half scores higher than the held half, so I accept the split as honest.

## 46 Pairs: one syllable finder — 15 Nov 2026 — blocked (step 1: premise false)
- Changed: `src/dev/bench39/split46.mjs` (new, dev-only), report `docs/briefs/reports/46-pairs-one-syllable-finder.md`, brief status. No production code. Scorecard not run (nothing it reads changed).
- Why blocked (MEASURED, `node src/dev/bench39/split46.mjs`): the brief's "true boundary" = the pipeline's `syllableSpans`. `shapes-v2.json` does not store them (re-measured with `multiSyllableSpan`, 197 Hz, per-clip gate). For natural pairs they are mostly not true: 156 / 215 natural words are cut by the loudness-dip fallback, and 79 / 203 natural pairs (39%) have a cut at the 20% search edge (52) or with no real dip (55). Textbook is sound (2 doubtful of 208).
- Also: splitters (b) and (c) always cut until the count fits, so "right count" is 100.0% for all of them and "wrong reads on mis-split pairs = 0" is true by construction. Neither tests the splitter.
- Numbers (old board, flag off; ruler 1–5 points lower on textbook): today (a) count 67.3 / 3.9 %, both right 57.7 / 3.4. Splitter b (silence 150, then dip): textbook within 50 ms of reference 86.5%, p90 53 ms, both right **74.0** (oracle cut 76.0). Natural both right 8.4 (oracle 9.4). Pitch reset (c) no better than b.
- Reader is the limit: per-syllable with the oracle cut, textbook 85.8% right, natural 39.2% right / 44.8% "?" (130 of 406 natural syllables are under 160 ms → "?" by rule 8; 44 read "none").
- Decisions for Pierre (report): what counts as truth for natural boundaries; must a cut need a real dip (else "?"); the stretch numbers (textbook 75, natural 60) vs the reader cap.
- For later: the pipeline's dip fallback has the same edge artefact on 39% of natural pairs, so natural pair corridors in `shapes-v2.json` may join at the wrong place. Check before brief 48.

## 46 Pairs: one syllable finder (second run, Pierre's decisions) — 15 Nov 2026 — done
- Decisions: truth = textbook reference only; splitter b (silence 150 ms, then loudness dip) with a real-dip rule (trough < `tuning().syllableDipRatio` 0.7 × quieter side's peak, else "?"); count right = found AND every cut ≤ 50 ms of the textbook reference; acceptance = textbook both right within 3 points of the oracle cut (old board and ruler), wrong reads with a cut > 80 ms off below 51; small misses → named allowances.
- Changed: `src/game/syllables.ts` (pure `findSyllables`) + tests; `syllableDipRatio` (tuning + Lab knob); `rms` on `ContourPoint` / `TrailPoint`, passed by `Visualiser.tsx` and `site/checker/engine.ts`; `readAttempt` / `readContourSyllables` take the expected count (Visualiser pairs, `board.ts`); Free mode unchanged. Bench `pairs46.mjs`, `pipe46.mjs`, `split46.mjs`; scorecard section 8. `ARCHITECTURE.md`. Commit: see `git log` ("brief 46").
- Scorecard: 387 numbers, 0 FAIL. Moved (named): `reader.pairsSplitInTwo` textbook 67.3 → 99.0, natural 3.9 → 49.3; `reader.pairsBothRight` textbook 55.3 → 74.0, natural 2.5 → 7.9. 15 new `pairs46.*` rows. 1870 tests, typecheck, build grep clean.
- Acceptance (MEASURED): textbook both right 74.0 / 69.7 (old / ruler) vs oracle 76.0 / 72.1 → gap 2.0 / 2.4 (pass). Wrong reads with a cut > 80 ms off: 6 / 7 (pass, < 51). **Named allowance:** textbook count right 85.6% (brief said ≥ 95): 2 not found, 28 with a cut > 50 ms off.
- Natural (report only): found 49.3%, both right 7.9 / 6.4, "?" syllables 66.3%. A not-found pair reads "? · ?".
- Clip pipeline kept on its own code: the shared finder finds no cut for 7 textbook + 130 natural multi-syllable clips on the pipeline's frames, different runs for 111 more (`pipe46.mjs`).
- **Open (not in 46):** the natural pair reader. Even with the oracle cut only 9.4% of natural pairs are both right; 130 of 406 natural syllables are under `minUtteranceMs` 160 ms → "?", 44 read "none". Needs its own brief.
- For brief 44 follow-up (review note): first-tone and third-tone syllables inside found pairs could now feed the grid pools.

## Note for brief 48 — pipeline cuts on natural pairs (from brief 46)
- The clip pipeline's dip fallback (`multiSyllableSpan` → `splitAtTrough`) puts **79 of 203 natural pair cuts (39%)** on an artefact: 52 at the 20% search edge (the voice only fades, so the "quietest frame" is where the search stops), 55 with no real dip. Textbook: 2 of 208. MEASURED, `node src/dev/bench39/split46.mjs` (first lines).
- Effect: the natural pair shapes in `src/dev/local/shapes-v2.json` (corridor join between the two syllables, `refinedMultiSyllablePolyline` spans) may join at the wrong place for those words. Check before any go-live of natural pair shapes.

## 47 Visualiser: honest target band, no re-measure on resize — 15 Nov 2026 — done (steps 3–4 wait for Pierre)
- Changed: `src/render/visualiser.ts` (band + `visualiserTolerance`, `targetBand`, `stretchContour`), `src/game/sessionNoise.ts` (`sessionNoiseFor`), `src/game/visualiserSink.ts` (new), `src/ui/Visualiser.tsx`, dev-only `src/dev/frameGaps.ts` and `src/dev/stretchPairs.ts`, 2 test files, ARCHITECTURE note. Commit: see `git log` ("brief 47").
- Scorecard: 387 numbers, 0 FAIL, nothing moved (no `src/pitch/` change). Tests 1878 (8 new). Typecheck, build grep clean.
- Acceptance (MEASURED): band half-width = `corridorToleranceAt` at t 0 / 0.5 / 1 for T1, T3, T4, and `tolChao` = the first gate's (all four width settings). Two effect runs on one mic session make 1 `NoiseMeter`; a new session makes 2.
- Surprise: a resize also rebuilt the pitch tracker from the *saved* calibration floor, so the room floor was lost twice over. The new sink starts a later tracker from the measured floor.
- Step 3 (time axis): no numbers. Needs a real mic; I did not drive the UI. Nothing changed. Pierre runs `__frameGaps.report()` (dev build, Visualiser open ~30 s) on desktop and phone; `useCountedTime: true` on any device → a small follow-up stamps frames by counted audio time.
- Step 4: dev switch `ft.stretchPairs` = "1" (pairs tab, finished attempts only). Not judged, not shipped.
- The public tone visualizer draws the band too ("normal" width). Its own engine and `Game.tsx` still build the noise meter inside their effects (not checked for resize).
- For brief 48: other screens still read the old settings record, not the ruler (from the 44 review); the band uses that same record's corridor width.
- Follow-up (16 Nov 2026, Pierre): the band is now an option. Button next to mute, saved per account (`toneflap.visBand.v1`), on by default. Site page: no toggle, always shown. Tests 1879.
- Step 3 measured (16 Nov 2026, Pierre's desktop): 1456 frames, hop 23.2 ms (44.1 kHz), median gap 23.2, p95 23.5, max 28.4 ms, 0.1% of gaps off by over 10 ms, drift −7.1 ms. Under the 5% rule: no change, frames keep `performance.now()`. Phone not measured.
- Step 4: not judged yet (Pierre was not sure what to look for). The switch only changes finished pair attempts whose length differs from the target's.

## Note for brief 48 — pair reading: first tone read as fourth tone at voiced joins (16 Nov 2026) — BLOCKER for go-live
Found by Pierre in the dev Visualiser (gōngyuán read "T4 · T2"). Analysed, not fixed. Scripts in the session scratchpad only, not in the repo.
- Cause 1 (MEASURED, frame dump): at a voiced join (ng-y, n-r, ng-m) there is no silence, and loudness does not dip where the pitch moves. Pierre's gōngrén (take 2): the pitch falls at ~470 ms, the loudness dip (the cut) comes ~360 ms later at the bottom of the dip, so syllable 1 = "flat 5, then fall" → read T4.
- Cause 2 (MEASURED): near-silent frames (1% loudness) with junk pitch at chao 1 stick to the end of a syllable (Pierre's bāngmáng, take 1) → a fake fall → T4.
- Cause 3 (MEASURED): when the cut lands at the start of the fall, syllable 2 begins with the fall plus a long low stretch and reads T3 instead of T2. Jane's own textbook gōngyuán reads "T1+T3" today; Pierre's gōngrén "T1+T3" / "T4+T3". Reader problem, not cut problem.
- Today's numbers (found cut): Jane textbook, first tones read as fourth tones: 11 of 109 (old board), 9 of 109 (ruler); with the clip pipeline's true cut, about the same (12 / 9), so for Jane the cut is mostly fine. Pierre: 1 of 4 first tones right in his pairs (3 read T4).
- Fixes tested offline: (A) at a voiced join cut at a fast pitch jump (≥ 1.5 chao over 3 frames, middle 60% of the word), the jump frames going to neither syllable; (B) drop edge frames under 6% of the syllable's loudest frame. A + B: Pierre's first tones 4 of 4; Jane textbook both right 70.4 → 73.4% (ruler), 74.8 → 77.3% (old); first tone read as fourth 9 → 6 (ruler). Cost of A: it can cut inside a real fourth tone (Pierre's duìmiàn 4+4 → 3+?); needs a guard (only a fall after a level part). B alone showed no harm. Natural pairs barely move. Cause 3 is not fixed by either.
- Why it shows now: before brief 46 production split pairs at silences only, so many voiced-join pairs were not split ("?"). Brief 46's finder splits them, and the slide sticks to one syllable. Production players do not see it.
- For go-live: do not ship brief 46's pair finder until a pair-reading brief fixes this (Pierre: separate session, after 48). It needs more of Pierre's pair takes, especially first tone + second tone (gōngyuán, jīnnián, zhōngguó).

