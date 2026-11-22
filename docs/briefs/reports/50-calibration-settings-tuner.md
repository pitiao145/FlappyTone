# Report: 50 Calibration: a calm tuner in Settings, a quick start in the game, the learned scale everywhere

- **Result: done.** Everything is behind the new foundation (`tuning().playerRulerV2`, the Lab's "New foundation" switch). With the switch off, the old first-run calibration and the old Settings card work as before.
- Branch `research/39-pitch-foundation`, worktree `.claude/worktrees/research-37`. Not pushed, not merged.

## Step 1: a first run with no calibration (measured before building)

Tool: `node src/dev/bench39/quickstart.mjs` (new). It plays recorded clips as a first run. The scale starts from the preset the player picked (lower 115 Hz or higher 200 Hz, +6 / −5 st). The game's own learner (`learnGridFromGate`) fits the scale after each gate. A wall hit = voiced frames outside the "wide" corridor (the default) for 200 ms. Timing is the player's own clock, so the model never charges a late start (best case for timing, fair case for height). 3 hearts per run. 60 gates, 5 gate orders (seeds), the game's own tone mix.

Voices: Pierre's 40 single-word takes (true middle 133 Hz, up 4.5, down 4.0 st), the native speaker's 357 textbook clips (197 Hz, up 5.7, down 7.3 st). "Voice at 150 Hz" = the same clips moved to a 150 Hz middle (between the presets: 4.6 st over "lower", 5 st under "higher").

| voice, pick | learning speed | wall hits, gates 1–10 | gates 1–30 | run 1 lasts (gates) |
|---|---|---|---|---|
| Pierre, **calibrated** (reference) | today (10%, cap 1.5/run) | 1.2 | 2.6 | 31 |
| Pierre 133 Hz, lower | today | 0.8 | 2.2 | 37 |
| | **start 70% ×3, no cap until learned** | 0.8 | 2.0 | 48 |
| native 197 Hz, higher | today | 0.0 | 0.0 | 60 (no death) |
| | start 70% ×3 | 0.0 | 0.0 | 60 |
| Pierre's voice at 150 Hz, lower | today | 1.8 | 3.6 | 19 |
| | start 70% ×3 | 1.6 | 2.8 | 31 |
| Pierre's voice at 150 Hz, higher | today | 3.4 | 7.2 | **9** |
| | start 70% ×3 | 2.2 | 4.4 | 14 |
| native voice at 150 Hz, lower | today | 0.2 | 0.6 | 60 |
| | start 70% ×3 | 0.0 | 0.0 | 60 |
| native voice at 150 Hz, higher | today | 2.6 | 3.4 | **12** |
| | start 70% ×3 | 0.6 | 0.6 | 60 |
| Pierre 133 Hz, higher (wrong pick) | today | 4.2 | 9.2 | 6 |
| | start 70% ×3 | 2.2 | 4.6 | 14 |

Also tried: 50% ×3, 50% ×5, 30% ×8, 80% ×2, and "no start rate, only no cap". 70% ×3 and 80% ×2 were best and nearly equal; 50% ×3 was a little worse on the far starts (run 1 of 12 gates instead of 14 for Pierre at 150 Hz, higher). "No cap" alone did almost nothing: the slow 10% rate is the real brake.

**Where the extra walls fall** (walls per gate 1–10, of 5 orders, 70% ×3): Pierre at 150 Hz, higher: `3 2 1 0 1 1 1 2 0 0`; native at 150 Hz, higher: `2 1 0 0 0 0 0 0 0 0`. So the cost of a far start is gate 1 (and sometimes gate 2): the scale cannot learn before the first gate. After gate 3 an in-between voice flies about like a calibrated one.

**Choice: the first 3 heard gates close 70% of the gap; no per-run cap until the top and bottom pools are full; then today's speed (10%, cap 1.5 st per run).** Only for a scale seeded from a preset. A calibrated player learns exactly as before.

**Gate check (does an in-between voice still fail often in its first run?): no.** With today's speed it did (died at gate 9–12). With the chosen start, a native-range voice at 150 Hz never dies in 60 gates on either pick, and a narrow-range learner voice (Pierre's) at 150 Hz loses about one extra heart on gate 1, then flies like his calibrated self; the worst pick still lasts 14 gates (calibrated: 31). So I built the quick start. If you want the first gate to be softer still, one option (not built, it changes "hearts count as normal"): the very first heard gate of a quick-start player costs no heart.

Limits: replayed clips, not live play; Pierre's 40 takes are a learner's takes (his calibrated walls are 1.2 per 10 gates), so the numbers are a comparison between speeds, not a promise of wall counts.

## What changed

Commits on `research/39-pitch-foundation`:
- `a18bd94` learner + tuner core: `src/pitch/calibration.ts` (`startRate`/`startGates`/`uncappedUntilLearned`, `wallHit`, `middleVote`), `src/game/tuning.ts` (new fields, `quickStartLearnParams`), `src/game/playerRuler.ts` (`quickStart` record), `src/game/run.ts` (`GateVoice.wallHit`, reported after scoring), `src/ui/Game.tsx`, `src/game/voiceStart.ts` (new), `src/ui/landing/miniGame.ts` (the demo saves the voice choice), `src/game/settings.ts` (`quickStart` flag), `src/game/tuner.ts` (new), `src/dev/TuningPanel.tsx` (Lab knobs), bench scripts `quickstart.mjs`, `tophalf.mjs`.
- `a81d747` screens: `src/ui/VoiceChoice.tsx`, `src/ui/VoiceTuner.tsx`, `src/ui/VoiceCard.tsx` (new), `src/app/GameApp.tsx` (quick start routing, tuner screen, Visualiser on the learned scale), `src/ui/Settings.tsx`, `src/site/checker/engine.ts` (`savedBoard` reads the learned scale), `src/ui/Visualiser.tsx` + `src/App.css` (labelled band button, tuner styles), `src/analytics/session.ts`.
- Docs commit (this report, `docs/PRD.md` §5.4, `docs/ARCHITECTURE.md`, handover).

By brief step:
1. Measured above.
2. **Quick start.** No settings + new foundation → "Which voice is closer to yours? Lower / Higher" (one tap), then straight on to the level picker or run. Skipped when the landing demo saved a choice on this device (`toneflap.voiceStart.v1`). The settings record is the preset, marked `quickStart: true`; the learned scale is seeded from it with the faster start. No calibration screen in the first-run path when the new foundation is on. The Visualiser from a fresh profile asks the same question, then opens.
3. **Tuner in Settings** (`VoiceTuner.tsx`, design row "Chosen: Paper tuner, revised"): step bar, one instruction, five lines with the corridor for the word's tone, the player's line drawn in place, 5 voice bars and a hold bar, "▶ Hear 媽", "Try again", Cancel. Room: 2 s, 7 bars, Quiet / A bit noisy / Too noisy scale with a marker, verdict with its effect and a tip, "Listen again" / "Continue". Done: check mark, "Your voice is set", Top / Middle / Bottom in semitones with Redo, room row with "Check again", Done. Lock rule (`tuner.ts` `StepCapture`): a take listens only after 300 ms of quiet, needs 450 ms of voice, locks after 300 ms of silence (or after 2.5 s of voice); a voice that stops too soon gives "Couldn't hear that, try again" and listens again. No voice for 4 s: "A bit louder?". All of these are `tuning()` fields with Lab knobs ("quick start + voice tuner").
   - **Middle words: 媽 and 馬 once each (2 takes, was 4).** Why: `middle-words.mjs` shows one first-tone + one third-tone word is the closest small set for Pierre (+0.66 st); repeating them did not make the middle steadier (test 9: two full calibrations on one day were 1.7 st apart anyway), and the learned scale now fixes the middle within about 10 gates. Fewer repeats also answers "feels like a pre-calibration". `middleTakesPerWord` stays a Lab knob.
   - Top and bottom: p90 of the 媽 take and p10 of the 馬 take, in semitones from the middle, creak (10 st under) cut, halves clamped 3–10: the learner's own rule (`gridTopPct`, `gridBottomPct`, `gridCreakSt`, `gridHalfMin/Max`).
4. **Settings card "Your voice"** (`VoiceCard.tsx`): Calibration and "Now (learned)" columns for Top / Middle / Bottom in semitones, "Learned from N gates", Calibrate, Adjust one part (opens the Done screen to redo one part), Back to calibration (re-seeds the learned scale), "Room: quiet · checked today", and the "New here?" note when not calibrated. A new calibration (full or one part) re-seeds the learned scale. No Hz.
5. **Learned scale everywhere:** `withLearnedScale(settings)` reads the stored scale for this calibration, else returns the calibration; it never writes. The Visualiser (new foundation) and the public checker (`savedBoard`) use it. TONEder untouched.
6. **Safer learning:** a third tone that cost a heart does not feed the bottom pool (decision 6); it still feeds the middle. `gridHalfMin` kept. **Top-half finding**, below.
7. **Visualiser band button:** now "◠ Target zone on / off" (icon + visible label + state), same behaviour, remembered on reload.
8. Docs: `PRD.md` §5.4 and screen list, `ARCHITECTURE.md` (new foundation bullet). Analytics: `calib_step` / `calib_abandoned` / `calib_done` from the tuner with the new step names `room`, `middle`, `top`, `bottom`, `done`; `setting_changed` gains keys `voice_start` (lower / higher) and `voice_scale` ("calibration"). No voice numbers in any event.

## Why the top half kept widening in test 8

Your test-8 numbers, as lines (semitones from your 129 Hz calibration): the **top line fell 0.9**, the **bottom line fell 2.1** (about the 2 st you lowered your voice), the **middle fell 2.9**. So the top half (top minus middle) grew because the **middle overshot downward by about 1 st**, not because the top rose. The bottom half sat at its 3.0 limit for the same reason: the bottom line was held 3 st under a middle that was too low.

Why the middle overshot: the middle learns from "votes": each frame's pitch minus where the target puts that moment. A first-tone target sits at about line 4.5, so its vote subtracts about 0.75 × the up half. And the up half is itself "top minus middle". In a first-tone-only drill every vote is of this kind, so the two feed each other: a lower middle → a bigger up half → lower votes → a lower middle. Resting point of that loop: the up half ≈ (spread of a held first tone) ÷ (1 − 0.75), about 4× the spread. A held first tone that spreads 1 st gives an up half of about 4 st: what you saw (4.3, then 4.9).

Shown offline (`node src/dev/bench39/tophalf.mjs`): a steady first tone said 2 st low, 20 drill gates then 65 classic gates: **today** the middle sinks 4.3 st in the drill and the classic run ends at up 4.1 / down 3.0 (at the limit), the test-8 pattern. **With the fix** the drill leaves the middle alone and the classic run ends at middle −1.4 st (true −1.5), down 4.4. Your recorded first tones (2 st lower) do not trigger the loop offline (the up half stays at its 3.0 minimum either way), so the effect depends on how a first tone is held in live play; the synthetic case reproduces it.

**Fix: Tone Drill does not vote on the middle** (`middleVote: false` from `Game.tsx` in drill mode). The drill still teaches its own line (first tones → top pool, third tones → bottom pool). Classic, Pairs and the other modes vote as before. I also tried two wider fixes and rejected them on numbers: (a) only targets between lines 2 and 4 vote (3 FAIL in `grid-learn.mjs`); (b) no first- or third-tone gate votes in any mode (4 FAIL). Both made Pierre's learning slower.

## Checks run

- `npm run test`: 1906 passed (new: `src/game/tuner.fixtures.test.ts` 15, `src/pitch/gridLearn.test.ts` +5, `src/game/playerRuler.test.ts` +3, `src/site/checker/learnedScale.test.ts` 1).
  - Each tuner step locks on silence after enough voice, and a long 媽 never counts for the next step: tested on the recorded `jane_ma1.wav` / `jane_ma3.wav` frames (a 媽 step locked mid-word by the voice cap; the rest of that 媽 + 馬 go to the next step, which keeps only 馬's frames).
  - Redo of one part changes only that part (`applyTunerResult`, 4 cases).
  - Visualiser and checker draw on the learned scale and never write it (`withLearnedScale`, `savedBoard`, storage write count 0).
  - A wall-hit third tone teaches the bottom nothing (`gridLearn.test.ts`).
- `npm run typecheck`: clean. `eslint` on the new files: 0 errors.
- `npm run classifier-check`: "wall hits on a correct speaker" **0** (unchanged).
- `node src/dev/bench39/grid-learn.mjs`: 0 FAIL (calibrated learning unchanged).
- `npm run bench`: 387 numbers, **0 FAIL**.
- `npm run build` + the hard rule 7 grep: build passes, grep prints nothing.
- `npm run report`: fit 0.95, lag 0 ms, wiggle 0.061, voiced 97%. The pitch tracker is untouched (the `src/pitch/` change is the learner only), so nothing moved.

## What Pierre should fly and look at

Run `npm run dev` from this worktree (https://localhost:5190), Lab → "New foundation".
1. **New player, fresh browser profile** (or a new port): Play → you should see one "Which voice is closer to yours?" screen, then the level picker / silent-mode gate as usual, then the first gate. No calibration screen. Fly 10–20 gates: does the bird follow you within the first 3 gates?
2. **Demo first**: on a fresh profile, try the landing page's "Try it now" with a voice, then open /app → Play: no voice question at all.
3. **Settings → Your voice**: the card shows "—" under Calibration and the learned values after a few gates ("Learned from N gates"), plus the "New here?" note.
4. **Calibrate** (Settings): each of the four steps. Watch: does each step wait for you and lock right after you stop? Hold a very long 媽 on the Top step: it must not leak into Bottom. Say nothing for 4 s: "A bit louder?". A very short sound: "Couldn't hear that, try again". Room step in a quiet and a noisy spot (a fan). Does the corridor and your line on the five lines make sense?
5. **Done screen**: Redo one part (e.g. Top); only that row should change. Then Done.
6. **Adjust one part** and **Back to calibration** in the card (Back needs some learned gates).
7. **Visualiser**: the band button now reads "Target zone on/off". Turn it off, reload: still off. The scale should match the game's learned one.
8. **Tone Drill, first tone, low voice** (test 8 again): the middle in the card should no longer sink during a drill; Classic still moves it.
9. **iPhone**: the voice choice tap, then the mic tap; the tuner's "▶ Hear 媽" and each step (mic and audio need a tap: the tuner is opened from Settings' Calibrate tap).

Copy to check: "Which voice is closer to yours?", the room verdicts (Quiet / A bit noisy / Too noisy, each with its effect and a tip), "Your voice is set", "1 semitone = one key on a piano".

## Open items for go-live

- **Privacy line (hard rule 12):** the policy must mention the on-device voice summary (the learned scale), and now also the stored voice choice (one word, lower / higher) and the room verdict. All stay in the browser; none is uploaded.
- The old calibration flight (`Calibration.tsx`, the measuring tutorial) is now only reached with the new foundation off. Delete it at go-live once the switch is gone, or keep it as the fallback, your call.
- "Fine-tune" (live dot + sensitivity slider) is not on the new card; the tuner's per-part redo replaces it.
- Brief 49 (pair reader) is on its own branch; nothing here touches `syllables.ts`.
- Not built: a softer first gate for quick-start players (see step 1).

## Fix after Pierre's first test (19 Nov 2026)

- **Bug:** on the Middle step, saying 媽 did nothing. The voice bars moved, but the hold bar stayed empty and the step never moved on. Cause: the tuner built its pitch tracker with `fMin: undefined`. That overrode the tracker's default floor, so it found no pitch at all (checked: 0 voiced frames on the recorded `jane_ma1.wav`). The voice bars use loudness only, so they still moved. The unit tests missed it because they fed the step logic directly, not through the tuner's own tracker setup.
- **Fix:** `tunerTrackerConfig()` in `tuner.ts` (never sets a key to undefined). New test: the tuner's own tracker setup hears a recorded 媽 and locks on the Middle, Top and Bottom steps.
- **Feedback:** if you speak before the short quiet that opens a take, the meter now says "Ready when you are. Stop for a moment, then say it once." The screen no longer stays silent.

## Changes after Pierre's screen recording (19 Nov 2026)

- **The middle came out too high.** In the recording, the 媽 on the Top step sat right on line 3: the middle step had landed on the 媽 height. Cause: the middle was the median of all frames from 媽 and 馬, and a held 媽 has more frames. Then the top half fell to its 3-semitone minimum ("Top: 3 semitones up") and the bottom came out too deep (5 to 6½). **Fix:** each word's own middle, then their average in semitones (`measureMiddleTakes`). Measured (`middle-words.mjs`, last table, st from the full middle): Pierre take 1 pooled +0.67 → each word once −0.28; take 2 +0.45 → +0.14; with a 3× longer 媽, pooled +2.54 → each word once +0.14 (unchanged); the native speaker +2.86 → −1.03. Test: a 3× longer recorded 媽 does not move the middle.
- **Live feedback like the Visualiser** (Pierre: "we don't see the line or the bird"): each voice step now shows your voice all the time as a line moving right to left with a dot at your pitch now (faint before the take starts, bold while it counts). The axis is plain semitones around your middle (±9 st), so nothing sticks to an edge while a line is being measured. Shown: your middle (solid, "3"), line 5 and line 1 as they are now (dashed), on Top and Bottom an "Aim here: high, easy, flat" / "Aim here: low, and stay low" zone, and after the take locks the measured line ("5 ✓" / "1 ✓"), held 1.4 s so you can see it.
- **Room "Check again" removed** from the Done screen. Agreed: the game measures the room again at the start of every run and every Visualiser visit, so a second check in the tuner changes nothing you can act on. The room result stays as information (Done screen, Settings card).
- Done screen layout: row sub-lines left-aligned, not italic; the Top and Middle dots now differ (warm / green).
- **The word, big** (Pierre: learners should see, not read): each voice step shows the word large (媽 / 馬, 64 px), its pinyin, and one short line ("Say it in your normal voice", "First tone: high, easy, flat", "Third tone: go low, stay low"). The step name is a small label above it.
- **Hold ring on the dot**, inside the stage where the player looks: a ring around the live dot fills while the word is held, turns green and shows a tick when the take locks. Before any voice, a dashed ring with the word sits where the dot will appear. The hold bar under the stage is gone.

## Redesign of the voice steps (Pierre, 22 Nov 2026)

Replaces the semitone stage, the small dot ring and the big word above it.
- **Hold ring at the top, with the word inside it** (the pattern of voice-enrolment screens such as "Hey Siri" or Face ID setup: one big ring, one thing to do, the ring fills while you do it). The ring fills while the voice is held and turns green when the take locks. Under it: one plain instruction for a beginner and one live status line ("Say it now. Hold it until the circle is full." → "Keep going… stop when the circle is full." → "Got it ✓"; "I can't hear you yet. A bit louder?"; "Stop for a second, then say it once."; "Couldn't hear that. Say it once more, a bit longer.").
- Instructions: Middle "Your normal voice: say it like you are talking to a friend. Not high, not low." Top "Your high note: one high, steady note, like a long “maaa”. Easy, not a shout." Bottom "Your low note: low and relaxed. Let your voice drop and stay down, like a sigh."
- **The stage is the Visualiser's own renderer** (`drawVisualiser`, scroll mode): the bird starts on the left as in the game, the line scrolls behind it, and on Top and Bottom the word's target band is the guide. The bird flies on your current scale (learned if any, else calibration), read only.
- Buttons: "▶ Hear it", "Start over". The voice-bar meter under the stage is gone.
