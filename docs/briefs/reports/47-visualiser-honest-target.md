# Report: 47 Visualiser: an honest target, and no room re-measure on resize
- Result: done for steps 1, 2 and the acceptance checks. Step 3 (time axis) has the dev logger, but no numbers yet: they need a real mic. Step 4 (stretch pairs) is built as a dev switch and waits for Pierre's look.

## What changed
- `src/render/visualiser.ts`: the target is now a soft band (`demo` token from `tokens.css`, alpha 0.16) with the dashed centre line inside. New exports: `visualiserTolerance(tones, corridor)` (base difficulty → `applyCorridorWidth` → `toleranceChao`, the same three steps `Run`/`makeGate` take), `targetBand(shape, tolChao, widenScale)` (half-width = `corridorToleranceAt`), `stretchContour` (dev drawing only). Scene fields `corridor` and `stretchToTarget`.
- `src/game/sessionNoise.ts`: `sessionNoiseFor(owner, voiceRms)`: one room measurement per mic session (WeakMap keyed by the mic session object). It keeps the measured floor.
- `src/game/visualiserSink.ts` (new): the Visualiser's frame sink, moved out of the React effect so it can be tested. A tracker made after a resize starts from the floor already measured (before: back to the saved calibration floor, and a new measurement).
- `src/ui/Visualiser.tsx`: uses the two above; reads `loadCorridorWidth()`; dev-only frame-gap logging and the stretch switch, both behind `import.meta.env.DEV` at the call site.
- `src/dev/frameGaps.ts`, `src/dev/stretchPairs.ts` (new, dev only).
- Tests: `src/render/visualiserBand.test.ts`, `src/game/visualiserSink.test.ts` (8 new tests).
- `docs/ARCHITECTURE.md` ("Three entries", tone visualizer paragraph).
- No change to scoring, `src/pitch/`, `tuning()`, or the game.

## Checks (MEASURED)
- Band test: half-width at t = 0, 0.5, 1 equals `corridorToleranceAt` for tones 1, 3, 4 (to 12 decimals); `tolChao` equals `makeGate(tone, 0, newDifficulty()).tolChao`; same for all four width settings (also `widenScale`). Pass.
- Noise test (counts `NoiseMeter` constructions with a counting mock): two effect runs on one mic session → 1 meter; the measured floor carries to the second run; a new mic session → 2. Pass.
- `npm run test`: 143 files, 1878 tests pass (was 1870). `npm run typecheck`: clean.
- `npm run build` + grep (`TuningPanel`, `copy gate log`, `soundboard`, `flappytone.gatelog`, `__frameGaps`, `ft.stretchPairs`, `stretchPairs`): nothing in `dist/`.
- `npm run bench`: 387 numbers, 0 FAIL. No number moved.

## Step 3: frame arrival times
- Numbers: **none yet**. I cannot open a real mic, and the brief says not to drive the UI. So the decision rule (over 5% of gaps more than 10 ms off the hop → stamp by counted audio time) has no input yet.
- Decision now: **change nothing** (frames keep the `performance.now()` stamp).
- How Pierre measures (about 1 minute per device): `npm run dev` from this worktree, open the Visualiser, talk or stay quiet for ~30 s, then in the console: `__frameGaps.report()`. It prints frames, hop time (21.3 ms at 48 kHz), median / p95 / max gap, the share of gaps off by over 10 ms, the drift between the two clocks, and `useCountedTime` (the brief's rule, true or false). Do it on the desktop and, if possible, on the iPhone (Safari Web Inspector). If `useCountedTime` is true on any device, a short follow-up changes the stamp.
- Plain words: the mic makes a small packet of sound every 21 ms. The screen notes the time each packet *arrives*. If packets arrive in bursts, the line is drawn a little uneven in time. The logger shows if that happens.

## Step 4: pairs stretched to the target
- Dev switch: `localStorage["ft.stretchPairs"] = "1"`, then reopen the Visualiser. Pairs tab only. Each finished attempt is stretched in time so it ends where Jane's line ends. The live (in-progress) line stays on real time, so it jumps when the attempt ends. Scoring never sees it.
- Whether it reads better: **not judged** (I do not look at the UI). Not shipped.

## Needs Pierre's eyes
1. The band in the app Visualiser (tone tab and pairs tab), on your corridor width setting. Change the width in Settings and reopen: the band should follow.
2. The public tone visualizer (`/tools/tone-visualizer`) also draws the band now behind its guide line ("normal" width; the site has no width setting). Say if you want it there.
3. `__frameGaps.report()` on desktop and phone (step 3).
4. The stretch switch on a few pairs (step 4): better or worse?

## Follow-ups
- The public tone visualizer (`src/site/checker/engine.ts`) and the game (`Game.tsx`) still make their noise meter inside their own effects. Not in this brief. The site one may have the same resize re-measure; not checked.
- The Visualiser's frame effect still makes a new `VisualiserCore` on resize (the attempts on screen are lost). Not in this brief.

## Follow-up (16 Nov 2026, Pierre's decision): the band is an option
- A round button next to mute in the app Visualiser (both layouts) shows or hides the band. The dashed line always stays. The choice is saved per account (`toneflap.visBand.v1`, `loadShowVisBand` / `saveShowVisBand` in `src/game/settings.ts`). Default: on.
- The button changes a ref the draw loop reads, so toggling does not restart the mic effect.
- The public tone visualizer has no toggle and always shows the band.
- Checks (MEASURED): `npm run test` 1879 pass (1 new render test: hiding the band removes exactly one fill, the dashed line stays); typecheck clean; build + grep clean.
- Needs Pierre's eyes: the new button and its icon, on phone and desktop.

