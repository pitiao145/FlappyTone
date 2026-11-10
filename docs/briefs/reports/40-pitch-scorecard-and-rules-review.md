# Report: 40 Pitch scorecard with Praat, baseline numbers, and the rules review
- Result: **done** (after two blocks; Pierre's decisions are recorded below and in the handover)

## Why blocked
Acceptance: "The pitch-error and delay numbers match the handover entry 'Phase A + Praat check' within 0.02 semitone / 10 ms."
- Live settings, natural style, fourth tone, pitch error with the delay removed, 90th percentile: **0.44** semitone. The handover says T4 "0.10 / 0.37–0.38". Miss: 0.06 > 0.02. MEASURED: `npm run bench` (`live.err.delayRemoved.p90.natural.T4`).
- The handover's own command gives the same 0.44: `node src/dev/bench39/detail.mjs`, row "live / natural / T4": `0.11/0.44`. The pipeline-settings row is `0.10/0.38`. MEASURED.
- So the false part is the handover sentence "live settings and pipeline settings agree within 0.01". For natural T4 p90 they differ by 0.06. The scorecard reproduces the bench; the summary was too short.
- All other pitch-error and delay numbers match (table below). Delay is 40 ms in all 10 groups.
- Pierre decides: accept 0.44 as the true baseline (it is already in `39-baseline.json`) and correct the handover line, then set this brief to done. I did not write the rules review (step 5). The stop rule says stop.

## What changed (uncommitted before this commit; see the commit hash in the handover entry)
- `src/dev/bench39/scorecard.mjs` (new): the scorecard.
- `src/dev/bench39/tracks.mjs`: tracker runs are cached by a hash of every non-test file in `src/pitch/`, plus the settings and the pitch factor (`cachedRun`). A change to the listener makes a new cache folder; a stale run is never reused. `cachedTrack` now uses it. `resample` moved here.
- `package.json`: `"bench": "node src/dev/bench39/scorecard.mjs"`. No dependency.
- `docs/briefs/refs/39-baseline.json` (new): 209 numbers, each with `better`, `tol`, `unit`.
- Doc facts fixed (step 6; diff below). No edit under `src/pitch|audio|game|ui|site`.

## Scorecard
- Clean tree: `npm run bench` → `209 numbers, 0 FAIL`, exit 0. First run (empty cache) 132 s; second run 0.4–0.8 s. MEASURED.
- Praat cache missing → exit 2 with the setup commands (READ IN CODE: `scorecard.mjs` top).
- Definitions (all vs Praat, creak frames under ~102 Hz left out):
  - "as drawn" = tracker frame vs Praat at the same time. "delay removed" = vs Praat 40 ms earlier.
  - delay = the 10 ms step (0–100 ms) with the lowest median error.
  - voice heard = Praat voiced frames that the tracker draws (40 ms shift), split by thirds of the clip's voiced span.
  - voice where Praat is silent = share of the tracker's voiced frames where Praat has no voice within ±2 frames.
  - low/high end lost = per clip, Praat 5th (95th) percentile minus the tracker's, in semitones; median and 90th percentile over clips.
  - deep voice stand-in = Jane replayed at 0.6× and 0.5× pitch (slower too; NOT a real male voice). "under band" = Praat frames that would fall under 70 Hz.
  - gate 40% = noise floor set so the gate is 40% of the clip's own voice loudness.
  - reader = classifier v2 / pair read on the live contour, on the Phase A "Jane as player" board.
  - heights = target polyline vs Praat contour on her player board: mean gap in chao, shape correlation. No shape number for T1 (flat target).

Full output (clean tree):
```

> flappytone@0.0.0 bench
> node src/dev/bench39/scorecard.mjs

pitch scorecard — reference: Praat | src/pitch hash 68cab46e98 | 788 clips (T1–T4, pairs)
number | value | baseline | allowed | result
live.err.asDrawn.med.textbook.T1 | 0.09 | 0.09 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.textbook.T1 | 0.46 | 0.46 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.textbook.T1 | 0.02 | 0.02 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.textbook.T1 | 0.22 | 0.22 | ≤ +0.02 st | PASS
live.delay.ms.textbook.T1 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.textbook.T1 | 96.8 | 96.8 | ≥ −1 pp | PASS
live.heard.firstThird.pct.textbook.T1 | 95.7 | 95.7 | ≥ −1 pp | PASS
live.heard.lastThird.pct.textbook.T1 | 94.6 | 94.6 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.textbook.T1 | 0.2 | 0.2 | ≤ +1 pp | PASS
live.lowEndLost.med.textbook.T1 | 0.02 | 0.02 | ≤ +0.02 st | PASS
live.lowEndLost.p90.textbook.T1 | 0.05 | 0.05 | ≤ +0.02 st | PASS
live.highEndLost.med.textbook.T1 | 0.05 | 0.05 | ≤ +0.02 st | PASS
live.highEndLost.p90.textbook.T1 | 0.26 | 0.26 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.textbook.T1 | 0.02 | 0.02 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.textbook.T1 | 0.23 | 0.23 | ≤ +0.02 st | PASS
live.err.asDrawn.med.textbook.T2 | 0.65 | 0.65 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.textbook.T2 | 1.72 | 1.72 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.textbook.T2 | 0.05 | 0.05 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.textbook.T2 | 0.23 | 0.23 | ≤ +0.02 st | PASS
live.delay.ms.textbook.T2 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.textbook.T2 | 95.7 | 95.7 | ≥ −1 pp | PASS
live.heard.firstThird.pct.textbook.T2 | 95.7 | 95.7 | ≥ −1 pp | PASS
live.heard.lastThird.pct.textbook.T2 | 91.3 | 91.3 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.textbook.T2 | 0.1 | 0.1 | ≤ +1 pp | PASS
live.lowEndLost.med.textbook.T2 | 0.01 | 0.01 | ≤ +0.02 st | PASS
live.lowEndLost.p90.textbook.T2 | 0.04 | 0.04 | ≤ +0.02 st | PASS
live.highEndLost.med.textbook.T2 | 0.79 | 0.79 | ≤ +0.02 st | PASS
live.highEndLost.p90.textbook.T2 | 1.67 | 1.67 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.textbook.T2 | 0.05 | 0.05 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.textbook.T2 | 0.23 | 0.23 | ≤ +0.02 st | PASS
live.err.asDrawn.med.textbook.T3 | 0.93 | 0.93 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.textbook.T3 | 1.98 | 1.98 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.textbook.T3 | 0.07 | 0.07 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.textbook.T3 | 0.32 | 0.32 | ≤ +0.02 st | PASS
live.delay.ms.textbook.T3 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.textbook.T3 | 95.6 | 95.6 | ≥ −1 pp | PASS
live.heard.firstThird.pct.textbook.T3 | 95.0 | 95.0 | ≥ −1 pp | PASS
live.heard.lastThird.pct.textbook.T3 | 91.8 | 91.8 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.textbook.T3 | 0.0 | 0.0 | ≤ +1 pp | PASS
live.lowEndLost.med.textbook.T3 | 0.03 | 0.03 | ≤ +0.02 st | PASS
live.lowEndLost.p90.textbook.T3 | 0.16 | 0.16 | ≤ +0.02 st | PASS
live.highEndLost.med.textbook.T3 | 0.59 | 0.59 | ≤ +0.02 st | PASS
live.highEndLost.p90.textbook.T3 | 1.29 | 1.29 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.textbook.T3 | 0.07 | 0.07 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.textbook.T3 | 0.32 | 0.32 | ≤ +0.02 st | PASS
live.err.asDrawn.med.textbook.T4 | 1.20 | 1.20 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.textbook.T4 | 2.55 | 2.55 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.textbook.T4 | 0.10 | 0.10 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.textbook.T4 | 0.38 | 0.38 | ≤ +0.02 st | PASS
live.delay.ms.textbook.T4 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.textbook.T4 | 93.4 | 93.4 | ≥ −1 pp | PASS
live.heard.firstThird.pct.textbook.T4 | 95.9 | 95.9 | ≥ −1 pp | PASS
live.heard.lastThird.pct.textbook.T4 | 83.8 | 83.8 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.textbook.T4 | 0.8 | 0.8 | ≤ +1 pp | PASS
live.lowEndLost.med.textbook.T4 | 0.28 | 0.28 | ≤ +0.02 st | PASS
live.lowEndLost.p90.textbook.T4 | 1.07 | 1.07 | ≤ +0.02 st | PASS
live.highEndLost.med.textbook.T4 | 0.10 | 0.10 | ≤ +0.02 st | PASS
live.highEndLost.p90.textbook.T4 | 0.29 | 0.29 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.textbook.T4 | 0.10 | 0.10 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.textbook.T4 | 0.37 | 0.37 | ≤ +0.02 st | PASS
live.err.asDrawn.med.textbook.pairs | 0.57 | 0.57 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.textbook.pairs | 2.04 | 2.04 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.textbook.pairs | 0.06 | 0.06 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.textbook.pairs | 0.31 | 0.31 | ≤ +0.02 st | PASS
live.delay.ms.textbook.pairs | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.textbook.pairs | 94.1 | 94.1 | ≥ −1 pp | PASS
live.heard.firstThird.pct.textbook.pairs | 96.3 | 96.3 | ≥ −1 pp | PASS
live.heard.lastThird.pct.textbook.pairs | 93.2 | 93.2 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.textbook.pairs | 0.5 | 0.5 | ≤ +1 pp | PASS
live.lowEndLost.med.textbook.pairs | 0.05 | 0.05 | ≤ +0.02 st | PASS
live.lowEndLost.p90.textbook.pairs | 0.97 | 0.97 | ≤ +0.02 st | PASS
live.highEndLost.med.textbook.pairs | 0.04 | 0.04 | ≤ +0.02 st | PASS
live.highEndLost.p90.textbook.pairs | 0.44 | 0.44 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.textbook.pairs | 0.06 | 0.06 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.textbook.pairs | 0.32 | 0.32 | ≤ +0.02 st | PASS
live.err.asDrawn.med.natural.T1 | 0.09 | 0.09 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.natural.T1 | 0.38 | 0.38 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.natural.T1 | 0.02 | 0.02 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.natural.T1 | 0.12 | 0.12 | ≤ +0.02 st | PASS
live.delay.ms.natural.T1 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.natural.T1 | 95.9 | 95.9 | ≥ −1 pp | PASS
live.heard.firstThird.pct.natural.T1 | 93.5 | 93.5 | ≥ −1 pp | PASS
live.heard.lastThird.pct.natural.T1 | 94.3 | 94.3 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.natural.T1 | 0.4 | 0.4 | ≤ +1 pp | PASS
live.lowEndLost.med.natural.T1 | 0.02 | 0.02 | ≤ +0.02 st | PASS
live.lowEndLost.p90.natural.T1 | 0.07 | 0.07 | ≤ +0.02 st | PASS
live.highEndLost.med.natural.T1 | 0.16 | 0.16 | ≤ +0.02 st | PASS
live.highEndLost.p90.natural.T1 | 0.58 | 0.58 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.natural.T1 | 0.02 | 0.02 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.natural.T1 | 0.11 | 0.11 | ≤ +0.02 st | PASS
live.err.asDrawn.med.natural.T2 | 0.58 | 0.58 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.natural.T2 | 1.62 | 1.62 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.natural.T2 | 0.05 | 0.05 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.natural.T2 | 0.21 | 0.21 | ≤ +0.02 st | PASS
live.delay.ms.natural.T2 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.natural.T2 | 93.9 | 93.9 | ≥ −1 pp | PASS
live.heard.firstThird.pct.natural.T2 | 94.8 | 94.8 | ≥ −1 pp | PASS
live.heard.lastThird.pct.natural.T2 | 87.1 | 87.1 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.natural.T2 | 0.2 | 0.2 | ≤ +1 pp | PASS
live.lowEndLost.med.natural.T2 | 0.01 | 0.01 | ≤ +0.02 st | PASS
live.lowEndLost.p90.natural.T2 | 0.08 | 0.08 | ≤ +0.02 st | PASS
live.highEndLost.med.natural.T2 | 0.77 | 0.77 | ≤ +0.02 st | PASS
live.highEndLost.p90.natural.T2 | 1.39 | 1.39 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.natural.T2 | 0.05 | 0.05 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.natural.T2 | 0.23 | 0.23 | ≤ +0.02 st | PASS
live.err.asDrawn.med.natural.T3 | 0.73 | 0.73 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.natural.T3 | 1.85 | 1.85 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.natural.T3 | 0.06 | 0.06 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.natural.T3 | 0.26 | 0.26 | ≤ +0.02 st | PASS
live.delay.ms.natural.T3 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.natural.T3 | 92.3 | 92.3 | ≥ −1 pp | PASS
live.heard.firstThird.pct.natural.T3 | 93.3 | 93.3 | ≥ −1 pp | PASS
live.heard.lastThird.pct.natural.T3 | 84.2 | 84.2 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.natural.T3 | 0.3 | 0.3 | ≤ +1 pp | PASS
live.lowEndLost.med.natural.T3 | 0.05 | 0.05 | ≤ +0.02 st | PASS
live.lowEndLost.p90.natural.T3 | 0.12 | 0.12 | ≤ +0.02 st | PASS
live.highEndLost.med.natural.T3 | 0.99 | 0.99 | ≤ +0.02 st | PASS
live.highEndLost.p90.natural.T3 | 2.64 | 2.64 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.natural.T3 | 0.06 | 0.06 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.natural.T3 | 0.28 | 0.28 | ≤ +0.02 st | PASS
live.err.asDrawn.med.natural.T4 | 1.26 | 1.26 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.natural.T4 | 2.58 | 2.58 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.natural.T4 | 0.11 | 0.11 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.natural.T4 | 0.44 | 0.44 | ≤ +0.02 st | PASS
live.delay.ms.natural.T4 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.natural.T4 | 90.4 | 90.4 | ≥ −1 pp | PASS
live.heard.firstThird.pct.natural.T4 | 94.1 | 94.1 | ≥ −1 pp | PASS
live.heard.lastThird.pct.natural.T4 | 74.4 | 74.4 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.natural.T4 | 0.8 | 0.8 | ≤ +1 pp | PASS
live.lowEndLost.med.natural.T4 | 0.50 | 0.50 | ≤ +0.02 st | PASS
live.lowEndLost.p90.natural.T4 | 2.09 | 2.09 | ≤ +0.02 st | PASS
live.highEndLost.med.natural.T4 | 0.15 | 0.15 | ≤ +0.02 st | PASS
live.highEndLost.p90.natural.T4 | 0.45 | 0.45 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.natural.T4 | 0.10 | 0.10 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.natural.T4 | 0.38 | 0.38 | ≤ +0.02 st | PASS
live.err.asDrawn.med.natural.pairs | 0.55 | 0.55 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.natural.pairs | 2.10 | 2.10 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.natural.pairs | 0.07 | 0.07 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.natural.pairs | 0.38 | 0.38 | ≤ +0.02 st | PASS
live.delay.ms.natural.pairs | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.natural.pairs | 88.4 | 88.4 | ≥ −1 pp | PASS
live.heard.firstThird.pct.natural.pairs | 82.9 | 82.9 | ≥ −1 pp | PASS
live.heard.lastThird.pct.natural.pairs | 84.7 | 84.7 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.natural.pairs | 0.4 | 0.4 | ≤ +1 pp | PASS
live.lowEndLost.med.natural.pairs | 0.09 | 0.09 | ≤ +0.02 st | PASS
live.lowEndLost.p90.natural.pairs | 1.41 | 1.41 | ≤ +0.02 st | PASS
live.highEndLost.med.natural.pairs | 0.23 | 0.23 | ≤ +0.02 st | PASS
live.highEndLost.p90.natural.pairs | 0.86 | 0.86 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.natural.pairs | 0.07 | 0.07 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.natural.pairs | 0.42 | 0.42 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.textbook.T1 | 0.0 | 0.0 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.textbook.T1 | 0.00 | 0.00 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.textbook.T2 | 0.0 | 0.0 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.textbook.T2 | 0.01 | 0.01 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.textbook.T3 | 0.2 | 0.2 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.textbook.T3 | 0.00 | 0.00 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.textbook.T4 | 0.8 | 0.8 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.textbook.T4 | 0.20 | 0.20 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.textbook.pairs | 0.1 | 0.1 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.textbook.pairs | 0.04 | 0.04 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.natural.T1 | 0.1 | 0.1 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.natural.T1 | 0.01 | 0.01 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.natural.T2 | 0.1 | 0.1 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.natural.T2 | 0.01 | 0.01 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.natural.T3 | 0.0 | 0.0 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.natural.T3 | 0.01 | 0.01 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.natural.T4 | 0.1 | 0.1 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.natural.T4 | 0.30 | 0.30 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.natural.pairs | 0.1 | 0.1 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.natural.pairs | 0.06 | 0.06 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.textbook.T1 | 0.3 | 0.3 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.textbook.T1 | 0.00 | 0.00 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.textbook.T2 | 0.5 | 0.5 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.textbook.T2 | 0.01 | 0.01 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.textbook.T3 | 33.1 | 33.1 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.textbook.T3 | 2.20 | 2.20 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.textbook.T4 | 22.9 | 22.9 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.textbook.T4 | 2.96 | 2.96 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.textbook.pairs | 11.8 | 11.8 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.textbook.pairs | 1.58 | 1.58 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.natural.T1 | 0.1 | 0.1 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.natural.T1 | 0.00 | 0.00 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.natural.T2 | 21.6 | 21.6 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.natural.T2 | 0.48 | 0.48 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.natural.T3 | 47.1 | 47.1 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.natural.T3 | 2.30 | 2.30 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.natural.T4 | 22.8 | 22.8 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.natural.T4 | 3.28 | 3.28 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.natural.pairs | 12.0 | 12.0 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.natural.pairs | 1.10 | 1.10 | ≤ +0.02 st | PASS
gate40.T4.lastThirdHeard.pct.textbook | 28.2 | 28.2 | ≥ −1 pp | PASS
gate40.T4.lastThirdHeard.pct.natural | 19.9 | 19.9 | ≥ −1 pp | PASS
reader.singlesRight.pct.calibrated.textbook | 97.8 | 97.8 | ≥ −1 pp | PASS
reader.pairsSplitInTwo.pct.textbook | 67.3 | 67.3 | ≥ −1 pp | PASS
reader.pairsBothRight.pct.textbook | 55.3 | 55.3 | ≥ −1 pp | PASS
reader.singlesRight.pct.calibrated.natural | 89.1 | 89.1 | ≥ −1 pp | PASS
reader.pairsSplitInTwo.pct.natural | 3.9 | 3.9 | ≥ −1 pp | PASS
reader.pairsBothRight.pct.natural | 2.5 | 2.5 | ≥ −1 pp | PASS
reader.singlesRight.pct.voice2stLower.textbook | 92.3 | 92.3 | ≥ −1 pp | PASS
reader.singlesRight.pct.voice2stLower.natural | 55.0 | 55.0 | ≥ −1 pp | PASS
heights.gapChao.med.T1 | 0.18 | 0.18 | ≤ +0.02 chao | PASS
heights.gapChao.med.T2 | 0.24 | 0.24 | ≤ +0.02 chao | PASS
heights.shapeMatch.med.T2 | 0.99 | 0.99 | ≥ −0.02 r | PASS
heights.gapChao.med.T3 | 0.36 | 0.36 | ≤ +0.02 chao | PASS
heights.shapeMatch.med.T3 | 0.97 | 0.97 | ≥ −0.02 r | PASS
heights.gapChao.med.T4 | 0.58 | 0.58 | ≤ +0.02 chao | PASS
heights.shapeMatch.med.T4 | 0.98 | 0.98 | ≥ −0.02 r | PASS
heights.gapChao.med.pairs | 0.41 | 0.41 | ≤ +0.02 chao | PASS
heights.shapeMatch.med.pairs | 0.96 | 0.96 | ≥ −0.02 r | PASS

209 numbers, 0 FAIL. Time 0.4 s.
```

### Match with the handover (pitch error with delay removed, median / p90)
| group | handover | live textbook | live natural | pipe textbook | pipe natural | result |
|---|---|---|---|---|---|---|
| T1 | 0.02 / 0.11–0.23 | 0.02/0.22 | 0.02/0.12 | 0.02/0.23 | 0.02/0.11 | ok |
| T2 | 0.05 / 0.23 | 0.05/0.23 | 0.05/0.21 | 0.05/0.23 | 0.05/0.23 | ok |
| T3 | 0.06–0.07 / 0.28–0.32 | 0.07/0.32 | 0.06/0.26 | 0.07/0.32 | 0.06/0.28 | ok (0.26 is 0.02 under) |
| T4 | 0.10 / 0.37–0.38 | 0.10/0.38 | 0.11/**0.44** | 0.10/0.37 | 0.10/0.38 | **miss** (live natural p90) |
| pairs | 0.05–0.07 / 0.32–0.42 | 0.06/0.31 | 0.07/0.38 | 0.06/0.32 | 0.07/0.42 | ok |
| delay | 40 ms | 40 | 40 | — | — | ok |

## Checks run
- `npm run bench`, clean tree: exit 0, 0 FAIL. MEASURED.
- `clarityThreshold` 0.7 → 0.9 in `src/pitch/PitchTracker.ts` (local, reverted with `git checkout`; `git status` clean for `src/pitch`): exit 1, **51 FAIL**. Failing lines: voice heard (all / first / last third) in every group and both styles; high end lost (textbook T3, T4, pairs; natural T2, T3, T4, pairs); low end lost (textbook T2 p90, T4 med, pairs; natural pairs p90); pipe error p90 natural T4 (0.38 → 0.41) and natural pairs (0.42 → 0.48); deep 0.6 low end T4 both styles; deep 0.5 low end textbook pairs; gate 40% T4 last third (28.2 → 24.0, 19.9 → 17.4); reader natural singles at −2 st (55.0 → 53.5). In plain words: a stricter "is this a voice?" test makes the line go silent more often, mostly at the start and end of words, and loses the tops and bottoms of the moves. MEASURED.
- `npm run test`: 135 files, 1824 tests passed. `npm run typecheck`: clean. `npm run build`: clean. Hard rule 7 grep for `TuningPanel`, `copy gate log`, `soundboard`, `flappytone.gatelog`, `bench39`, `scorecard`: no hits in `dist/`. MEASURED.

## Doc lines changed (false facts only)
```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 61c20aa..f56be35 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -89,7 +89,7 @@ Verify it by running `npm run analyze fixtures/captures/<file>.wav <f0Center>` a
 
 **Tone classifier and tone accuracy** are checked against Jane's real measured contours, never synthetic curves (`npm run classifier-check`; protocol in `docs/TESTING.md`). "Wall hits on a correct speaker" must not go up. Any change to `src/pitch/` needs the fixture tests to pass **and** a before/after `npm run report`; state which of fit/lag/wiggle/voiced% moved, including the ones that got worse.
 
-Ground truth is `fixtures/captures/jane_*.wav` (native Taiwanese speaker, direct mic). The synthetic `fixtures/tone*.wav` prove nothing about real voices.
+Ground truth is `fixtures/captures/jane_*.wav` (native Taiwanese speaker, direct mic). The large regression set is Jane's 829 local catalog clips, scored against Praat by `npm run bench`. The synthetic `fixtures/tone*.wav` prove nothing about real voices.
 
 ## Working style
 
diff --git a/docs/ARCHITECTURE.md b/docs/ARCHITECTURE.md
index e6c02b1..3b938d1 100644
--- a/docs/ARCHITECTURE.md
+++ b/docs/ARCHITECTURE.md
@@ -258,7 +258,7 @@ Rules that hold the pipeline together — see DECISIONS.md for the incidents beh
 
 ## Tone pairs — shipped
 
-Two-syllable words are a real, player-reachable mode now, not exploration. Both gates below read the live inventory and only appear once it holds a multi-syllable word — currently `multiWords(inventory).length > 0` is true (the `tonepairs-v1` batch, four words: 好玩/美國/小時/以前), so they are **live for every player today**, not dev-gated:
+Two-syllable words are a real, player-reachable mode now, not exploration. Both gates below read the live inventory and only appear once it holds a multi-syllable word — currently `multiWords(inventory).length > 0` is true (246 two-syllable words in the textbook fallback catalog, Nov 2026; the first batch was `tonepairs-v1`, four words), so they are **live for every player today**, not dev-gated:
 
 - **Modes → "Tone pairs"** (`src/ui/ModeSelect.tsx`): shuffle across every combo the tier's own words can build a gate from, or drill one tone combo.
 - **Settings → word mix** (`src/ui/Settings.tsx`): the classic `game` mode can fly single syllables, pairs, or a shuffled mix of both (`WordMix`, `wordMix` setting). `tuning().multiGateChance` (default 0.5) is the per-gate draw odds when mix is `"all"` — not a measured value, retune from the Lab once pairs have actually been flown in classic mode.
diff --git a/docs/PRD.md b/docs/PRD.md
index 4922c28..41d47a8 100644
--- a/docs/PRD.md
+++ b/docs/PRD.md
@@ -67,7 +67,7 @@ y(chao) = 0.80H - ((chao - 1) / 4) * 0.60H
 
 ### 5.2 Pitch detection pipeline
 
-Analysis window 2048 samples, 1024-sample hop (~43Hz update rate, 50% overlap) — see `src/pitch/PitchTracker.ts` for the exact constants below.
+Analysis window 2048 samples, 1024-sample hop (~47 Hz update rate, one step = 21.3 ms at the 48 kHz most devices use; 50% overlap) — see `src/pitch/PitchTracker.ts` for the exact constants below.
 
 1. **Band-limit the search** to reject most octave errors outright.
 2. **Voicing gate:** `clarity >= 0.7` (not a stricter textbook 0.85 — NSDF clarity collapses exactly when pitch slews fastest), **plus a glide rescue**: a loud, pitch-continuous, recent frame counts as voiced even below the clarity threshold (`isFrameVoiced()`). Also requires `rms >= noiseFloor * 3`.
@@ -97,7 +97,7 @@ Persisted to `localStorage` (the one exception to "no persistence" — a setting
 
 ## 6. Tone gate geometry
 
-**A gate is built from a recorded word, not a hand-drawn tone-mark shape.** Corridor centrelines (`DEFAULT_POLYLINES` in `src/game/tuning.ts`) are measured from Jane's own citation-form takes (`fixtures/captures/jane_ma*.wav`), not drawn from the ˉˊˇˋ marks — real tones hold, then move fast, which a constant-rate ramp between the mark's endpoints cannot represent. Every one of the 120 shipped words gets its own polyline via `shapeForWord`, built from the same measurement the four fallback/tutorial shapes use (`templateContour`).
+**A gate is built from a recorded word, not a hand-drawn tone-mark shape.** Corridor centrelines (`DEFAULT_POLYLINES` in `src/game/tuning.ts`) are measured from Jane's own citation-form takes (`fixtures/captures/jane_ma*.wav`), not drawn from the ˉˊˇˋ marks — real tones hold, then move fast, which a constant-rate ramp between the mark's endpoints cannot represent. Every shipped word gets its own polyline via `shapeForWord`, built from the same measurement the four fallback/tutorial shapes use (`templateContour`).
 
 Approximate current fallback shapes (2–4 vertices, monotone-cubic spline between them, not straight segments):
 
diff --git a/docs/TESTING.md b/docs/TESTING.md
index 16e9ef9..27f646d 100644
--- a/docs/TESTING.md
+++ b/docs/TESTING.md
@@ -10,7 +10,7 @@ The principle: **`src/pitch/` is a pure function from audio frames to a Chao con
 
 Record these yourself, once, before writing pipeline code. **Use the same microphone you'll actually play the game with** — a laptop mic and a headset produce very different signals, and tuning against the wrong one is wasted work.
 
-**Format:** mono WAV, 44.1 kHz, 16-bit. Quiet room. Normal speaking volume, ~20cm from the mic. Trim to the utterance plus ~200ms of silence either side.
+**Format:** mono WAV, 48 kHz, 16-bit (every real-voice fixture in the repo is 48 kHz; only the synthetic `fixtures/tone*.wav` are 44.1 kHz). Quiet room. Normal speaking volume, ~20cm from the mic. Trim to the utterance plus ~200ms of silence either side.
 
 ### What is actually in the repo
 
@@ -30,6 +30,13 @@ a name that misses the convention is silently scored at the 120Hz default.
 The wind in the first ~1s of each `jane_*` file doubles as a noise-rejection
 fixture: every frame of it must come back unvoiced.
 
+**`fixtures/clips/jane/` (local only, gitignored)** — Jane's cut catalog
+clips: 357 textbook and 472 natural (`natural/`), 48 kHz. Not in git, so a
+fresh checkout does not have them. They are the large regression set:
+`npm run bench` scores the listener on them against Praat (brief 40,
+`src/dev/bench39/`). The 120 older single-tone words have no cut clip here;
+their raw takes are in `fixtures/recordings/2026-08-07-xujzgs/`.
+
 **`fixtures/contours/jane-textbook-sample.json`** — 101 of Jane's published
 textbook clips' measured contours (`word_clips.contour`: voiced frames on her
 calibrated board, canonical heights), singles across all four tones plus three
```
- `docs/TESTING.md:13` said 44.1 kHz. Every real-voice fixture is 48 kHz (MEASURED: Phase A inventory; `wave` header of all 8 captures). Only the synthetic `tone*.wav` are 44.1 kHz.
- `docs/TESTING.md` inventory did not list the local catalog clips. Added.
- `docs/PRD.md:70` "~43Hz" is true only at 44.1 kHz. At 48 kHz it is ~47 Hz, 21.3 ms per step.
- `docs/PRD.md:100` "120 shipped words": the textbook fallback holds 214 single-syllable rows (MEASURED: `wordsFallback.json`). Count removed.
- `docs/ARCHITECTURE.md:261` "four words" of pairs: the fallback holds 246 two-syllable rows (MEASURED).
- `CLAUDE.md:92`: one sentence added (the 829-clip regression set and `npm run bench`). The "ground truth" sentence itself is not changed; that is a rule, for Pierre.
- Not changed (out of the brief's files or owned by `src/pitch/`, which this brief may not edit): `src/pitch/PitchTracker.ts:22` "~23ms hop" and `:38` "~115ms" (21.3 ms and ~107 ms at 48 kHz); `src/pitch/mpm.ts:7` "@ 44.1k"; `docs/PRD.md:299` "120 words (30 per tone)" (§9, outside §5–§7). These go to brief 42 (listener, ms-based settings).

## Needs Pierre's eyes
- The blocking point: accept 0.44 as baseline, and correct the handover sentence.
- The CLAUDE.md diff above.
- Seen on the way (MEASURED, already in the baseline): natural pairs split in two only 3.9%, both right 2.5% (brief 46). Natural single tones read right 89.1%, but 55.0% when the voice is 2 semitones lower than calibrated (briefs 44, 45). At gate 40%, the last third of T4 is heard only 20–28% (noise is out of scope; it is on the card so it cannot get worse). Deep 0.5×: 33–47% of T3 frames fall under 70 Hz (brief 42).

## Follow-ups
- After Pierre's answer: write `docs/briefs/refs/39-rules-review.md` (step 5), then set done.

## Second run (after Pierre's decisions) — blocked again
- Done: handover sentence corrected; voice heard / voice-where-Praat-silent compared with no shift; "delay removed" uses the group's best-fit delay (all 40 ms, so those numbers did not move).
- Against the old baseline: 24 lines moved, all voice heard (mostly first third, now 71–88%) and voice-where-Praat-silent (now 1.6–2.4%). Expected: removing the shift moves on/off frames at the edges.
- Sanity check from the decisions, live T4 last third: lowest gate textbook 94.2% (ok), natural 83.2% (expected 92–94%); 40% gate 46.5% / 41.3% (expected 51–66%). Far → stopped, as told.
- Cause (MEASURED, see handover entry): Phase A used the built-in reference. With it, natural T4 last third is 96.6%. With Praat it is 83.1%. Praat hears the quiet ends of natural falls; the tracker does not draw them. The 40% gate also uses a different loudness measure than `eval.mjs`.
- Baseline not rewritten. Rules review not written. Status: blocked.

## Final run — done
Pierre's decisions: 0.44 is the true baseline for live natural T4 p90. Praat numbers are the baseline for "voice heard". The sanity ranges (92–94%, 51–66%) are withdrawn.

### Numbers that moved from the first baseline (42; all others unchanged)
Why: the voiced on/off check (voice heard, voice where Praat is silent, 40% gate) now compares at the same moment, not 40 ms later. The median filter delays the pitch value, not the voiced decision.
- First third drops (95 → 71–88%): the tracker needs 3 voiced frames in a row (`minVoicedRun` 3, ~64 ms) before it draws. With the old shift this start was hidden.
- Last third rises (75–95 → 83–100%): the tracker stops drawing at about the time Praat stops.
- Voice where Praat is silent rises (0–0.8 → 0.5–2.4%): the tracker's voice runs a few frames past Praat's end.
- 40% gate T4 last third rises (28.2 → 46.5, 20.0 → 41.3): same reason.
- "Delay removed" now uses each group's best-fit delay; it is 40 ms everywhere, so no error number moved.

| number | first baseline | new baseline |
|---|---|---|
| live.heard.all.pct.textbook.T1 | 96.77 | 93.73 |
| live.heard.firstThird.pct.textbook.T1 | 95.72 | 81.28 |
| live.heard.lastThird.pct.textbook.T1 | 94.62 | 100 |
| live.voiceWherePraatSilent.pct.textbook.T1 | 0.18 | 1.65 |
| live.heard.all.pct.textbook.T2 | 95.67 | 93.93 |
| live.heard.firstThird.pct.textbook.T2 | 95.65 | 82.2 |
| live.heard.lastThird.pct.textbook.T2 | 91.34 | 100 |
| live.voiceWherePraatSilent.pct.textbook.T2 | 0.15 | 0.6 |
| live.heard.all.pct.textbook.T3 | 95.6 | 93.71 |
| live.heard.firstThird.pct.textbook.T3 | 95.03 | 81.46 |
| live.heard.lastThird.pct.textbook.T3 | 91.83 | 99.67 |
| live.voiceWherePraatSilent.pct.textbook.T3 | 0 | 0.8 |
| live.heard.all.pct.textbook.T4 | 93.36 | 90.55 |
| live.heard.firstThird.pct.textbook.T4 | 95.88 | 78.87 |
| live.heard.lastThird.pct.textbook.T4 | 83.78 | 94.22 |
| live.voiceWherePraatSilent.pct.textbook.T4 | 0.76 | 2.28 |
| live.heard.all.pct.textbook.pairs | 94.14 | 91.35 |
| live.heard.firstThird.pct.textbook.pairs | 96.26 | 88.12 |
| live.heard.lastThird.pct.textbook.pairs | 93.19 | 96.43 |
| live.voiceWherePraatSilent.pct.textbook.pairs | 0.53 | 1.99 |
| live.heard.all.pct.natural.T1 | 95.89 | 91.85 |
| live.heard.firstThird.pct.natural.T1 | 93.47 | 75.76 |
| live.heard.lastThird.pct.natural.T1 | 94.31 | 100 |
| live.voiceWherePraatSilent.pct.natural.T1 | 0.36 | 1.99 |
| live.heard.all.pct.natural.T2 | 93.93 | 92.92 |
| live.heard.firstThird.pct.natural.T2 | 94.82 | 79.34 |
| live.heard.lastThird.pct.natural.T2 | 87.08 | 99.63 |
| live.voiceWherePraatSilent.pct.natural.T2 | 0.2 | 0.52 |
| live.heard.all.pct.natural.T3 | 92.34 | 91.38 |
| live.heard.firstThird.pct.natural.T3 | 93.33 | 75.86 |
| live.heard.lastThird.pct.natural.T3 | 84.15 | 98.89 |
| live.voiceWherePraatSilent.pct.natural.T3 | 0.33 | 0.46 |
| live.heard.all.pct.natural.T4 | 90.4 | 85.1 |
| live.heard.firstThird.pct.natural.T4 | 94.06 | 72 |
| live.heard.lastThird.pct.natural.T4 | 74.42 | 83.21 |
| live.voiceWherePraatSilent.pct.natural.T4 | 0.79 | 2.37 |
| live.heard.all.pct.natural.pairs | 88.43 | 85.86 |
| live.heard.firstThird.pct.natural.pairs | 82.9 | 71.12 |
| live.heard.lastThird.pct.natural.pairs | 84.73 | 94.34 |
| live.voiceWherePraatSilent.pct.natural.pairs | 0.44 | 1.02 |
| gate40.T4.lastThirdHeard.pct.textbook | 28.23 | 46.5 |
| gate40.T4.lastThirdHeard.pct.natural | 19.95 | 41.25 |

### Final checks
- `npm run bench`, clean tree: exit 0, 0 FAIL, 1.2 s (cached). First run on an empty cache: 132 s.
- `clarityThreshold` 0.9 (local, reverted; `src/pitch` clean): exit 1, **44 FAIL**: voice heard all (9) and first third (10) and last third (2); high end lost med (3) and p90 (7); low end lost med (2) and p90 (3); pipe error p90 (2: natural T4 0.38 → 0.41, natural pairs 0.42 → 0.48); deep 0.6 low end (2); deep 0.5 low end (1); 40% gate T4 last third (2); reader natural singles at −2 st (1).
- Pitch error and delay vs the corrected handover: all within 0.02 st / 10 ms.
- `npm run test` 1824 passed; `npm run typecheck` clean; `npm run build` clean; rule 7 grep (plus `bench39`, `scorecard`): no hits.

### Rules table
`docs/briefs/refs/39-rules-review.md`: 54 claims. FALSE as plain facts and fixed in 40: TESTING 44.1 kHz, TESTING inventory, PRD ~43 Hz, PRD "120 shipped words", ARCHITECTURE "four words". FALSE but owned by later briefs or outside the allowed files: PRD:52-53 centre "near the bottom" (44), fallback heights (43), PRD:123 "creak concentrates on Tone 3" for Jane (41), `PitchTracker.ts:22,38` and `mpm.ts:7` hop numbers (42).

### Final scorecard output
```

> flappytone@0.0.0 bench
> node src/dev/bench39/scorecard.mjs

pitch scorecard — reference: Praat | src/pitch hash 68cab46e98 | 788 clips (T1–T4, pairs)
number | value | baseline | allowed | result
live.err.asDrawn.med.textbook.T1 | 0.09 | 0.09 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.textbook.T1 | 0.46 | 0.46 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.textbook.T1 | 0.02 | 0.02 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.textbook.T1 | 0.22 | 0.22 | ≤ +0.02 st | PASS
live.delay.ms.textbook.T1 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.textbook.T1 | 93.7 | 93.7 | ≥ −1 pp | PASS
live.heard.firstThird.pct.textbook.T1 | 81.3 | 81.3 | ≥ −1 pp | PASS
live.heard.lastThird.pct.textbook.T1 | 100.0 | 100.0 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.textbook.T1 | 1.6 | 1.6 | ≤ +1 pp | PASS
live.lowEndLost.med.textbook.T1 | 0.02 | 0.02 | ≤ +0.02 st | PASS
live.lowEndLost.p90.textbook.T1 | 0.05 | 0.05 | ≤ +0.02 st | PASS
live.highEndLost.med.textbook.T1 | 0.05 | 0.05 | ≤ +0.02 st | PASS
live.highEndLost.p90.textbook.T1 | 0.26 | 0.26 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.textbook.T1 | 0.02 | 0.02 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.textbook.T1 | 0.23 | 0.23 | ≤ +0.02 st | PASS
live.err.asDrawn.med.textbook.T2 | 0.65 | 0.65 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.textbook.T2 | 1.72 | 1.72 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.textbook.T2 | 0.05 | 0.05 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.textbook.T2 | 0.23 | 0.23 | ≤ +0.02 st | PASS
live.delay.ms.textbook.T2 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.textbook.T2 | 93.9 | 93.9 | ≥ −1 pp | PASS
live.heard.firstThird.pct.textbook.T2 | 82.2 | 82.2 | ≥ −1 pp | PASS
live.heard.lastThird.pct.textbook.T2 | 100.0 | 100.0 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.textbook.T2 | 0.6 | 0.6 | ≤ +1 pp | PASS
live.lowEndLost.med.textbook.T2 | 0.01 | 0.01 | ≤ +0.02 st | PASS
live.lowEndLost.p90.textbook.T2 | 0.04 | 0.04 | ≤ +0.02 st | PASS
live.highEndLost.med.textbook.T2 | 0.79 | 0.79 | ≤ +0.02 st | PASS
live.highEndLost.p90.textbook.T2 | 1.67 | 1.67 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.textbook.T2 | 0.05 | 0.05 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.textbook.T2 | 0.23 | 0.23 | ≤ +0.02 st | PASS
live.err.asDrawn.med.textbook.T3 | 0.93 | 0.93 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.textbook.T3 | 1.98 | 1.98 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.textbook.T3 | 0.07 | 0.07 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.textbook.T3 | 0.32 | 0.32 | ≤ +0.02 st | PASS
live.delay.ms.textbook.T3 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.textbook.T3 | 93.7 | 93.7 | ≥ −1 pp | PASS
live.heard.firstThird.pct.textbook.T3 | 81.5 | 81.5 | ≥ −1 pp | PASS
live.heard.lastThird.pct.textbook.T3 | 99.7 | 99.7 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.textbook.T3 | 0.8 | 0.8 | ≤ +1 pp | PASS
live.lowEndLost.med.textbook.T3 | 0.03 | 0.03 | ≤ +0.02 st | PASS
live.lowEndLost.p90.textbook.T3 | 0.16 | 0.16 | ≤ +0.02 st | PASS
live.highEndLost.med.textbook.T3 | 0.59 | 0.59 | ≤ +0.02 st | PASS
live.highEndLost.p90.textbook.T3 | 1.29 | 1.29 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.textbook.T3 | 0.07 | 0.07 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.textbook.T3 | 0.32 | 0.32 | ≤ +0.02 st | PASS
live.err.asDrawn.med.textbook.T4 | 1.20 | 1.20 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.textbook.T4 | 2.55 | 2.55 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.textbook.T4 | 0.10 | 0.10 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.textbook.T4 | 0.38 | 0.38 | ≤ +0.02 st | PASS
live.delay.ms.textbook.T4 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.textbook.T4 | 90.5 | 90.5 | ≥ −1 pp | PASS
live.heard.firstThird.pct.textbook.T4 | 78.9 | 78.9 | ≥ −1 pp | PASS
live.heard.lastThird.pct.textbook.T4 | 94.2 | 94.2 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.textbook.T4 | 2.3 | 2.3 | ≤ +1 pp | PASS
live.lowEndLost.med.textbook.T4 | 0.28 | 0.28 | ≤ +0.02 st | PASS
live.lowEndLost.p90.textbook.T4 | 1.07 | 1.07 | ≤ +0.02 st | PASS
live.highEndLost.med.textbook.T4 | 0.10 | 0.10 | ≤ +0.02 st | PASS
live.highEndLost.p90.textbook.T4 | 0.29 | 0.29 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.textbook.T4 | 0.10 | 0.10 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.textbook.T4 | 0.37 | 0.37 | ≤ +0.02 st | PASS
live.err.asDrawn.med.textbook.pairs | 0.57 | 0.57 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.textbook.pairs | 2.04 | 2.04 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.textbook.pairs | 0.06 | 0.06 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.textbook.pairs | 0.31 | 0.31 | ≤ +0.02 st | PASS
live.delay.ms.textbook.pairs | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.textbook.pairs | 91.3 | 91.3 | ≥ −1 pp | PASS
live.heard.firstThird.pct.textbook.pairs | 88.1 | 88.1 | ≥ −1 pp | PASS
live.heard.lastThird.pct.textbook.pairs | 96.4 | 96.4 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.textbook.pairs | 2.0 | 2.0 | ≤ +1 pp | PASS
live.lowEndLost.med.textbook.pairs | 0.05 | 0.05 | ≤ +0.02 st | PASS
live.lowEndLost.p90.textbook.pairs | 0.97 | 0.97 | ≤ +0.02 st | PASS
live.highEndLost.med.textbook.pairs | 0.04 | 0.04 | ≤ +0.02 st | PASS
live.highEndLost.p90.textbook.pairs | 0.44 | 0.44 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.textbook.pairs | 0.06 | 0.06 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.textbook.pairs | 0.32 | 0.32 | ≤ +0.02 st | PASS
live.err.asDrawn.med.natural.T1 | 0.09 | 0.09 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.natural.T1 | 0.38 | 0.38 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.natural.T1 | 0.02 | 0.02 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.natural.T1 | 0.12 | 0.12 | ≤ +0.02 st | PASS
live.delay.ms.natural.T1 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.natural.T1 | 91.8 | 91.8 | ≥ −1 pp | PASS
live.heard.firstThird.pct.natural.T1 | 75.8 | 75.8 | ≥ −1 pp | PASS
live.heard.lastThird.pct.natural.T1 | 100.0 | 100.0 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.natural.T1 | 2.0 | 2.0 | ≤ +1 pp | PASS
live.lowEndLost.med.natural.T1 | 0.02 | 0.02 | ≤ +0.02 st | PASS
live.lowEndLost.p90.natural.T1 | 0.07 | 0.07 | ≤ +0.02 st | PASS
live.highEndLost.med.natural.T1 | 0.16 | 0.16 | ≤ +0.02 st | PASS
live.highEndLost.p90.natural.T1 | 0.58 | 0.58 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.natural.T1 | 0.02 | 0.02 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.natural.T1 | 0.11 | 0.11 | ≤ +0.02 st | PASS
live.err.asDrawn.med.natural.T2 | 0.58 | 0.58 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.natural.T2 | 1.62 | 1.62 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.natural.T2 | 0.05 | 0.05 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.natural.T2 | 0.21 | 0.21 | ≤ +0.02 st | PASS
live.delay.ms.natural.T2 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.natural.T2 | 92.9 | 92.9 | ≥ −1 pp | PASS
live.heard.firstThird.pct.natural.T2 | 79.3 | 79.3 | ≥ −1 pp | PASS
live.heard.lastThird.pct.natural.T2 | 99.6 | 99.6 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.natural.T2 | 0.5 | 0.5 | ≤ +1 pp | PASS
live.lowEndLost.med.natural.T2 | 0.01 | 0.01 | ≤ +0.02 st | PASS
live.lowEndLost.p90.natural.T2 | 0.08 | 0.08 | ≤ +0.02 st | PASS
live.highEndLost.med.natural.T2 | 0.77 | 0.77 | ≤ +0.02 st | PASS
live.highEndLost.p90.natural.T2 | 1.39 | 1.39 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.natural.T2 | 0.05 | 0.05 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.natural.T2 | 0.23 | 0.23 | ≤ +0.02 st | PASS
live.err.asDrawn.med.natural.T3 | 0.73 | 0.73 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.natural.T3 | 1.85 | 1.85 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.natural.T3 | 0.06 | 0.06 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.natural.T3 | 0.26 | 0.26 | ≤ +0.02 st | PASS
live.delay.ms.natural.T3 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.natural.T3 | 91.4 | 91.4 | ≥ −1 pp | PASS
live.heard.firstThird.pct.natural.T3 | 75.9 | 75.9 | ≥ −1 pp | PASS
live.heard.lastThird.pct.natural.T3 | 98.9 | 98.9 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.natural.T3 | 0.5 | 0.5 | ≤ +1 pp | PASS
live.lowEndLost.med.natural.T3 | 0.05 | 0.05 | ≤ +0.02 st | PASS
live.lowEndLost.p90.natural.T3 | 0.12 | 0.12 | ≤ +0.02 st | PASS
live.highEndLost.med.natural.T3 | 0.99 | 0.99 | ≤ +0.02 st | PASS
live.highEndLost.p90.natural.T3 | 2.64 | 2.64 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.natural.T3 | 0.06 | 0.06 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.natural.T3 | 0.28 | 0.28 | ≤ +0.02 st | PASS
live.err.asDrawn.med.natural.T4 | 1.26 | 1.26 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.natural.T4 | 2.58 | 2.58 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.natural.T4 | 0.11 | 0.11 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.natural.T4 | 0.44 | 0.44 | ≤ +0.02 st | PASS
live.delay.ms.natural.T4 | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.natural.T4 | 85.1 | 85.1 | ≥ −1 pp | PASS
live.heard.firstThird.pct.natural.T4 | 72.0 | 72.0 | ≥ −1 pp | PASS
live.heard.lastThird.pct.natural.T4 | 83.2 | 83.2 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.natural.T4 | 2.4 | 2.4 | ≤ +1 pp | PASS
live.lowEndLost.med.natural.T4 | 0.50 | 0.50 | ≤ +0.02 st | PASS
live.lowEndLost.p90.natural.T4 | 2.09 | 2.09 | ≤ +0.02 st | PASS
live.highEndLost.med.natural.T4 | 0.15 | 0.15 | ≤ +0.02 st | PASS
live.highEndLost.p90.natural.T4 | 0.45 | 0.45 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.natural.T4 | 0.10 | 0.10 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.natural.T4 | 0.38 | 0.38 | ≤ +0.02 st | PASS
live.err.asDrawn.med.natural.pairs | 0.55 | 0.55 | ≤ +0.02 st | PASS
live.err.asDrawn.p90.natural.pairs | 2.10 | 2.10 | ≤ +0.02 st | PASS
live.err.delayRemoved.med.natural.pairs | 0.07 | 0.07 | ≤ +0.02 st | PASS
live.err.delayRemoved.p90.natural.pairs | 0.38 | 0.38 | ≤ +0.02 st | PASS
live.delay.ms.natural.pairs | 40 | 40 | ≤ +0 ms | PASS
live.heard.all.pct.natural.pairs | 85.9 | 85.9 | ≥ −1 pp | PASS
live.heard.firstThird.pct.natural.pairs | 71.1 | 71.1 | ≥ −1 pp | PASS
live.heard.lastThird.pct.natural.pairs | 94.3 | 94.3 | ≥ −1 pp | PASS
live.voiceWherePraatSilent.pct.natural.pairs | 1.0 | 1.0 | ≤ +1 pp | PASS
live.lowEndLost.med.natural.pairs | 0.09 | 0.09 | ≤ +0.02 st | PASS
live.lowEndLost.p90.natural.pairs | 1.41 | 1.41 | ≤ +0.02 st | PASS
live.highEndLost.med.natural.pairs | 0.23 | 0.23 | ≤ +0.02 st | PASS
live.highEndLost.p90.natural.pairs | 0.86 | 0.86 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.med.natural.pairs | 0.07 | 0.07 | ≤ +0.02 st | PASS
pipe.err.delayRemoved.p90.natural.pairs | 0.42 | 0.42 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.textbook.T1 | 0.0 | 0.0 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.textbook.T1 | 0.00 | 0.00 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.textbook.T2 | 0.0 | 0.0 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.textbook.T2 | 0.01 | 0.01 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.textbook.T3 | 0.2 | 0.2 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.textbook.T3 | 0.00 | 0.00 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.textbook.T4 | 0.8 | 0.8 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.textbook.T4 | 0.20 | 0.20 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.textbook.pairs | 0.1 | 0.1 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.textbook.pairs | 0.04 | 0.04 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.natural.T1 | 0.1 | 0.1 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.natural.T1 | 0.01 | 0.01 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.natural.T2 | 0.1 | 0.1 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.natural.T2 | 0.01 | 0.01 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.natural.T3 | 0.0 | 0.0 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.natural.T3 | 0.01 | 0.01 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.natural.T4 | 0.1 | 0.1 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.natural.T4 | 0.30 | 0.30 | ≤ +0.02 st | PASS
deep0.6.underBand.pct.natural.pairs | 0.1 | 0.1 | ≤ +1 pp | PASS
deep0.6.lowEndLost.med.natural.pairs | 0.06 | 0.06 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.textbook.T1 | 0.3 | 0.3 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.textbook.T1 | 0.00 | 0.00 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.textbook.T2 | 0.5 | 0.5 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.textbook.T2 | 0.01 | 0.01 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.textbook.T3 | 33.1 | 33.1 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.textbook.T3 | 2.20 | 2.20 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.textbook.T4 | 22.9 | 22.9 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.textbook.T4 | 2.96 | 2.96 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.textbook.pairs | 11.8 | 11.8 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.textbook.pairs | 1.58 | 1.58 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.natural.T1 | 0.1 | 0.1 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.natural.T1 | 0.00 | 0.00 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.natural.T2 | 21.6 | 21.6 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.natural.T2 | 0.48 | 0.48 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.natural.T3 | 47.1 | 47.1 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.natural.T3 | 2.30 | 2.30 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.natural.T4 | 22.8 | 22.8 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.natural.T4 | 3.28 | 3.28 | ≤ +0.02 st | PASS
deep0.5.underBand.pct.natural.pairs | 12.0 | 12.0 | ≤ +1 pp | PASS
deep0.5.lowEndLost.med.natural.pairs | 1.10 | 1.10 | ≤ +0.02 st | PASS
gate40.T4.lastThirdHeard.pct.textbook | 46.5 | 46.5 | ≥ −1 pp | PASS
gate40.T4.lastThirdHeard.pct.natural | 41.3 | 41.3 | ≥ −1 pp | PASS
reader.singlesRight.pct.calibrated.textbook | 97.8 | 97.8 | ≥ −1 pp | PASS
reader.pairsSplitInTwo.pct.textbook | 67.3 | 67.3 | ≥ −1 pp | PASS
reader.pairsBothRight.pct.textbook | 55.3 | 55.3 | ≥ −1 pp | PASS
reader.singlesRight.pct.calibrated.natural | 89.1 | 89.1 | ≥ −1 pp | PASS
reader.pairsSplitInTwo.pct.natural | 3.9 | 3.9 | ≥ −1 pp | PASS
reader.pairsBothRight.pct.natural | 2.5 | 2.5 | ≥ −1 pp | PASS
reader.singlesRight.pct.voice2stLower.textbook | 92.3 | 92.3 | ≥ −1 pp | PASS
reader.singlesRight.pct.voice2stLower.natural | 55.0 | 55.0 | ≥ −1 pp | PASS
heights.gapChao.med.T1 | 0.18 | 0.18 | ≤ +0.02 chao | PASS
heights.gapChao.med.T2 | 0.24 | 0.24 | ≤ +0.02 chao | PASS
heights.shapeMatch.med.T2 | 0.99 | 0.99 | ≥ −0.02 r | PASS
heights.gapChao.med.T3 | 0.36 | 0.36 | ≤ +0.02 chao | PASS
heights.shapeMatch.med.T3 | 0.97 | 0.97 | ≥ −0.02 r | PASS
heights.gapChao.med.T4 | 0.58 | 0.58 | ≤ +0.02 chao | PASS
heights.shapeMatch.med.T4 | 0.98 | 0.98 | ≥ −0.02 r | PASS
heights.gapChao.med.pairs | 0.41 | 0.41 | ≤ +0.02 chao | PASS
heights.shapeMatch.med.pairs | 0.96 | 0.96 | ≥ −0.02 r | PASS

209 numbers, 0 FAIL. Time 1.2 s.
```
