---
status: blocked  # step 2: no delay option passes the whole scorecard; see reports/42-listener-delay-band-ms.md
notion_task:
risk: needs-approval
---
# 42 Listener: less delay, a wider voice band, settings in milliseconds

## Goal
Keep the detector (`src/pitch/mpm.ts`). Change three things around it and prove each with the scorecard:
1. the line is 40 ms late → 25 ms or less;
2. the band 70–400 Hz cuts deep voices → a voice with a centre of 91 Hz keeps its low end;
3. settings counted in frames → counted in milliseconds, so 44.1 kHz and 48 kHz devices behave the same.

**Strong-model review required before this brief is done.**

## Read first
- `docs/briefs/refs/39-handover.md` (every entry) and `docs/briefs/refs/39-phase-b-plan.md` ("Rules for every brief").
- `src/dev/bench39/README.md`.
- `docs/TESTING.md`, `docs/DECISIONS.md` (search: median, slew, rescue, fMin, detectWindow), memory notes "T4 clarity collapse" and "Dot tuning loop".

## Do, one step at a time; run `npm run bench` after each and keep the table
1. **Settings in ms.** Derive the slew limit, rescue length, stale reset and `minVoicedRun` from milliseconds and the real hop (`HOP / sampleRate`). At 48 kHz every derived value must equal today's value, so no number on the scorecard moves. Add a unit test at 44.1 kHz and 48 kHz.
2. **Delay.** Try, in this order, and stop at the first that passes: (a) median of 3 instead of 5; (b) median of 3 plus the existing octave check; (c) keep 5 but report the newest value when it is within 1 semitone of the median. Measure each. Do not invent a new filter.
3. **Band.** Lower `fMin` to 55 Hz. A 1024-sample search window holds too few cycles of a 55 Hz wave, so test `detectWindow` 1024, 1536 and 2048 for low pitch only (for example: widen the window when the last voiced pitch is under 110 Hz). Report CPU time per frame for each option (median over the 829 clips, Node on this machine) and state it as a share of the 21 ms budget.
4. `fMax`: measure only. Report how many of Jane's Praat frames sit above 350 Hz. Do not change it unless brief 41 shows a need.

## Constraints
- `src/pitch/` stays free of Web Audio (hard rule 5). New settings are fields on `PitchTrackerConfig`; anything the Lab should move goes through `tuning()` (hard rule 6).
- No change to the loudness gate, the rescue rule or `voiceCapFraction` (noise is out of scope).
- The clip pipeline uses the same new listener. Do not re-measure the catalog here (brief 43 does).
- Golden snapshots and fixture tests will move. List every one, and why, in the report.

## Acceptance checks (all on `npm run bench`, Praat reference)
- Delay ≤ 25 ms for every group, both styles.
- Pitch error with the delay removed: no group worse than baseline by more than 0.02 semitone (median) and 0.05 (90th percentile).
- Errors over 3 semitones and octave errors: not above baseline + 0.2 percentage points.
- Frames drawn as voice where Praat is silent: not above baseline + 0.3 points. The wind before the voice in `fixtures/captures/jane_*.wav` stays unvoiced (existing test).
- Voice heard %: not below baseline − 1 point in any third.
- Deep-voice stand-in, factor 0.5 (centre 91 Hz): low end lost ≤ 0.4 semitone median (today 1.2) and ≤ 1.5 at the 90th percentile (today 3.5). Factor 0.6: no worse than today.
- If brief 41 is done: Pierre's low end lost ≤ 0.4 semitone median. If not, say so; the deep-voice sign-off stays open in the handover.
- CPU per frame ≤ 25% of the hop time on this machine.
- `npm run test`, `npm run typecheck`, before/after `npm run report` (state which of fit / lag / wiggle / voiced% moved, also the worse ones), `npm run classifier-check` (wall hits on a correct speaker stay 0), build + grep.

## Report back with
- The step-by-step table (option → every scorecard number that moved). The option chosen and why. Snapshots moved. What the player will notice. Update `39-baseline.json` only for the numbers this brief was meant to move. Handover entry.
