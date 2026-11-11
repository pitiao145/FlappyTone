# Report: 44 One ruler for the player: short calibration and a grid that learns
- Result: **blocked at step 1** (the brief's own stop rule)

## Why blocked
Step 1 says: "If the two voices differ by more than 2 semitones in either half, stop and report; the fallback step in point 5 is then needed from the start." They do, in the down half.

| voice | middle | up (T1 p90) | down (−T3 p10) | source |
|---|---|---|---|---|
| Jane | 197.4 Hz | 5.75 st (raw 5.69) | 7.25 st (raw 7.37) | `src/dev/local/shapes-v2.json` `ruler` (brief 43), 357 newer textbook clips |
| Pierre, Praat frames | 132.4 Hz | 4.5 st (raw 4.57) | 4.0 st (raw 4.02) | `node src/dev/bench39/player-halves.mjs` |
| Pierre, live tracker | 132.7 Hz | 4.5 st (raw 4.48) | 4.0 st (raw 4.06) | same command |
| Pierre, clean T3 only (ma3_1, shu3_2 left out) | 133.4–134.6 Hz | 4.25–4.5 st | 4.25 st | `node src/dev/bench39/player-halves.mjs --clean` |

All MEASURED. Same rule for both voices: middle = median of all tone-syllable frames, creak (> 10 st under) left out; up = p90 of single first-tone frames; down = −p10 of single third-tone frames; `computeRangeHalvesFromExtremes` (quarter-semitone rounding).

- Up half: Jane 5.75, Pierre 4.25–4.5 → gap **1.25–1.5 st** (inside 2).
- Down half: Jane 7.25, Pierre 4.0–4.25 → gap **3.0–3.25 st** (over 2). Leaving out his two off-shape third tones does not close it.

## What it means, in plain words
A "standard" grid is one size for everybody before the game has heard them. Jane's low third tone goes about 7 semitones under her middle. Pierre's goes about 4. If the game starts Pierre on Jane's size, the bottom line of the screen sits about 3 semitones below anything he says. His third tone would then never reach the floor of its corridor until the grid has learned. That is the case the brief told me to stop on.

The gap may be a learner effect (a learner does not yet drop as low in the third tone) or a voice effect. With one native voice and one learner voice, the data cannot say which (ASSUMED, not measured).

## What changed
- `src/dev/bench39/player-halves.mjs` (new, dev-only): step 1 measurement, so the numbers above can be re-run.
- Brief status line → `blocked`. Report and handover entry.
- Nothing else. No `tuning()`, `src/pitch/`, settings or calibration change. No checks needed beyond the measurement (no code path touched).

## Decision for Pierre
The brief says the top/bottom fallback (point 5) is "needed from the start". Options:
1. **Keep a short top/bottom step in calibration from the start** (the brief's own rule): middle from tone syllables, halves from the player's own first tone and third tone, then slow learning in play. This is close to what ships today (`run.ts` `voicedByTone`), plus the new middle and the learning.
2. **Start halves from the smaller voice** (up 4.5, down 4.0, Pierre's), so nobody starts with a floor out of reach; the learning then widens the grid for a voice like Jane's. Needs the brief's acceptance to be checked from a "halves too small" start, which it already asks for (30% too small).
3. **Start halves as the average** (up ~5.1, down ~5.6): each voice is then 1.5–1.6 st off at most, inside the 2 st rule, and learning closes the rest.
4. Record more voices first (another learner, another native speaker) before choosing a standard.

## Needs Pierre's eyes
- Which option. Options 2 and 3 change the brief's step 1 rule ("take them from data … more than 2 semitones → stop"), so they are Pierre's call, not mine.

## Follow-ups (from earlier briefs, still open for 44)
- The calibration talk step still searches from 70 Hz; a 90 Hz voice is measured 1.4 st too high (42 review). Step 2 of this brief (middle from tone syllables) must run with the speaker's floor.
