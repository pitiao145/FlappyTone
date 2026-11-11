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

---

## Second run (Pierre chose option 1: top/bottom step from the start) — blocked before building

### Why blocked: acceptance 2 cannot pass, even with a perfect learner
Acceptance 2: after learning from a "2 semitones lower" start, single tones right within 3 points of "as calibrated". Acceptance 1 makes the learner land within 1 st of the true ruler. So I measured the reader on the true ruler itself, the best any learner can do (MEASURED, `node src/dev/bench39/reader-on-ruler.mjs`, same clips, tracker cache and contour rule as `scorecard.mjs` section 4):

| style | as calibrated (scorecard today) | ruler halves, old centre | old halves, ruler middle | full ruler = perfect learner |
|---|---|---|---|---|
| textbook | 98.9% | 97.8% | 93.4% | **93.4%** (−5.5) |
| natural | 91.0% | 91.0% | 71.1% | **78.2%** (−12.8) |

(The baseline file holds 97.8 / 89.1; today's scorecard prints 98.9 / 91.0, both PASS.)

In plain words: the halves are not the problem. The **middle** is. The scorecard's "as calibrated" grid sits at 181.3 Hz (the catalog centre, close to how Jane talks). The one ruler puts the middle at 197.4 Hz, her median on tone syllables (step 2 of this brief asks for exactly that). That is 1.47 st higher, so every contour draws 1.47 st lower on the screen. The tone reader was fitted to the old centre, so it now reads fewer tones right. Natural speech suffers most, because Jane talks lower in natural speech than in textbook words.

So acceptance 2 checks the tone reader, not the learning. The plan gives the reader to brief 45 ("the reader is tuned last because it is fitted to whatever the listener and the ruler give it").

### Two more things the rerun needs decided
1. **Learning rule, brief vs plan.** Brief step 3 says top = p95 and bottom = p5 of all voiced frames. The plan's "What one ruler means" (revised 11 Nov, after the brief) says top from the player's first tones (p90) and bottom from their third tones (p10). These give different tops: about a third of Jane's fourth-tone frames sit above her first tone. Acceptance 1 ("within 1 st of the true ruler") only makes sense with the plan's rule. I would follow the plan.
2. **Standard halves under option 1.** With the top/bottom step from the start, the standard halves are only used when the calibration flight hears too little first or third tone. Today that fallback is ±5. Average of the two voices: up 5.25, down 5.75 (quarter-rounded).

### Decision for Pierre
- **Acceptance 2:** (a) compare the reader after learning from the −2 start with the reader after learning from a correct start (both on the learned ruler); this checks the learning only, and the reader's level goes to 45; or (b) run brief 45 first; or (c) keep the middle at the talk median (no step 2), which keeps the reader at today's level but leaves Jane's ruler and the player's ruler on different middles.
- Confirm the plan's T1 p90 / T3 p10 rule for learning (point 1 above).
- Confirm standard halves 5.25 / 5.75 (point 2 above).

### What changed in the second run
- `src/dev/bench39/reader-on-ruler.mjs` (new, dev-only). Brief status line. This report section and a handover entry. No production code.
