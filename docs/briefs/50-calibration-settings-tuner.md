---
status: ready
notion_task:
risk: needs-approval
---
# 50 Calibration: a calm tuner in Settings, a quick start in the game, the learned scale everywhere

## Goal
Make calibration feel calm and professional, and take it out of the way of a new player. Decided with Pierre on 19 Nov 2026, after the test session (`docs/briefs/refs/39-test-guide.md`, tests 8, 9, 11 and decisions 5, 6):

1. **New players do not calibrate.** Before their first run they pick "lower voice" or "higher voice" once (one small screen), unless the landing demo already saved that choice on this device. The game starts from the demo's wide preset and the learned scale (brief 44) fits it to their voice while they play.
2. **Calibration lives in Settings only**, as a tuner: no bird, no scrolling, no practice-gate flight. Four steps: room, middle, top, bottom. Each step can also be redone on its own.
3. **The learned scale is used everywhere** (the game, the Visualiser, the public tone checker). Only game gates teach it.
4. **Safer learning**, and a clear Visualiser band button.

Players are Mandarin learners, not singers: no Hz anywhere on screen. Talk in lines (1–5) and semitones ("1 semitone = one key on a piano").

## Design (chosen by Pierre)
Canvas: https://claude.ai/artifact/YCqPjBetjNjVCp7u8Cqoqe, bottom row **"Chosen: Paper tuner, revised"** (`A2-Room`, `A2-High`, `A2-Done`, `A2-Settings`). The rows above are rejected directions, kept for reference. Match the chosen row in the app's own tokens (`src/ui/tokens.css`), not new colours.

- **Every step:** step bar (Room · Middle · Top · Bottom), one short instruction in learner words, the familiar five lines with the corridor for that word's tone, the player's line drawn in place, a signal-bar voice meter (5 bars) plus a hold bar. A step **locks when the player stops speaking** after enough voice (fixes the test-9 bug where a long 媽 ran into the next word). Stalled about 4 s: a hint ("a bit louder?"). Not heard: "Couldn't hear that, try again", never a wrong score (hard rule 8). "▶ Hear 媽" plays the example; "Try again" restarts the step.
- **Room:** 2 s of quiet. Show the noise level as signal bars and a Quiet / A bit noisy / Too noisy scale with a marker, then a verdict in plain words with its effect ("the game may hear your low notes less well, so your bottom line could come out too high") and a tip. Buttons: "Listen again", "Continue".
- **Middle:** the middle from tone words (brief 44 `computeMiddleHz`, creak rule). Keep the number of words as low as gives a stable middle; say in the report what you chose and why.
- **Top:** 媽 mā as a first tone, high and flat. **Bottom:** a third tone said low (for example 馬 mǎ). Measure each line from that take with the same percentiles and creak rule the learned scale uses (`gridTopPct`, `gridBottomPct`, `gridCreakSt`), so calibration and learning agree.
- **Done:** a check mark, "Your voice is set", one row per part in semitones ("Top: 2½ semitones up", "Middle: your normal voice", "Bottom: 4 semitones down"), Redo on each row, the room result with "Check again", Done.
- **Settings card "Your voice":** calibration and learned values side by side in semitones, "Learned from N gates", buttons "Calibrate", "Adjust one part", "Back to calibration", the room status. A short note for new players: calibrating is optional.

## Read first
- `docs/briefs/refs/39-test-guide.md` (test session notes, decisions), `docs/briefs/refs/39-handover.md`, reports `44-one-ruler-player-calibration.md`, `47-visualiser-honest-target.md`.
- `docs/ARCHITECTURE.md` ("Three entries", "Play analytics", "Accounts, tiers and the leaderboard"), `docs/PRD.md` (calibration).
- `src/ui/Calibration.tsx`, `src/app/GameApp.tsx` (first-run flow, `measuredRange`, `saveRuler`), `src/game/playerRuler.ts`, `src/pitch/calibration.ts` (`learnGridFromGate`), `src/game/tuning.ts` (`gridLearn*`), `src/ui/landing/miniGame.ts` (`PRESETS`, lower 115 Hz / higher 200 Hz, +6 / −5 st), `src/ui/landing/TryItNow.tsx`, `src/game/visualiserCore.ts`, `src/site/checker/engine.ts`, the Settings screen.

## Do
1. **Measure first:** with the scorecard tools (`src/dev/bench39/`, `gridsim.mjs`, `grid-learn.mjs`), replay Pierre's takes (`fixtures/captures/pierre/`) and Jane's clips on the two presets as a first run. Report wall hits per run and how many gates until the scale settles, with today's learning speed and with a faster start (for example: the first few heard gates close about half the gap each, no per-run cap until the scale is "learned", then today's speed). Pick the start speed from the numbers. Simulate also a voice midway between the presets (about 150 Hz). If such a voice still fails often in its first run, stop and report to Pierre before building the quick start.
2. **Quick start:** the voice choice screen before the first run (skip it when the demo saved a choice; save the choice on this device, never uploaded). Seed the learned scale from the preset, with the faster start from step 1. Hearts count as normal.
3. **Tuner calibration** in Settings, as designed above, with per-part redo. Remove the calibration from the game's first-run path. Keep the old flow working when the new foundation is off (`tuning().playerRulerV2`), like the rest of this branch.
4. **Settings card** as designed. "Back to calibration" re-seeds the learned scale from the calibration. A new calibration (full or one part) also re-seeds it.
5. **Learned scale everywhere:** the Visualiser and the public tone checker read the learned scale when it exists, else the calibration, else today's default. They never teach it. TONEder is out of scope (no mic).
6. **Safer learning:** the bottom line learns only from third-tone gates that did not hit a wall (decision 6); keep `gridHalfMin`. Find out why the top half kept widening in test 8 (2.3 → 4.3 → 4.9 st while the bottom stayed at its limit) and fix it or explain it with numbers.
7. **Visualiser band button:** a control a first-time user understands (a label, or an icon with a visible label), same behaviour as now (remembered on reload).
8. Update `docs/PRD.md` and `docs/ARCHITECTURE.md` in the same commits as the behaviour they describe. Analytics: keep `calib_step` / `calib_abandoned` working with the new step names; any new event follows "Play analytics" and never carries voice numbers (decision 3, option A).

## Constraints
- Branch `research/39-pitch-foundation`, in the worktree `.claude/worktrees/research-37`. Another session (brief 49) works on `src/game/syllables.ts` and the pair reader on its own branch: do not touch those files.
- Never push, deploy or merge. No writes to Supabase, R2, the Worker or PostHog. No schema change. Ask before adding a dependency.
- Hard rules 1 (the live line and meters update outside React state, like the Visualiser), 2, 3, 4 (every mic and audio start behind a tap; the voice choice tap may open the mic), 5, 6 (new numbers are `tuning()` fields with Lab knobs), 7, 8, 9 (Traditional hanzi), 10, 12 (the voice choice and the learned scale stay on the device; the privacy-policy line about the on-device summary is go-live work, list it in the report), 13 (site pages load no mic code up front; the checker reads the learned scale from storage only).
- Copy: "the bird", never "Pip"; never name Jane ("our native speaker"); ordinal tone names ("first tone", not "Tone 1"); no Hz on screen.
- Do not check the UI yourself with a browser or screenshots: Pierre checks the screens. Tell him what to look at.

## Acceptance checks
- Step 1 numbers in the report, and the chosen start speed with its reason.
- A new player reaches the first gate with one tap of choice (none when the demo saved it). No calibration screen in the first-run path when the new foundation is on.
- Each tuner step locks on silence after enough voice; a long 媽 never counts for the next step (unit test on recorded frames).
- Redo of one part changes only that part.
- Visualiser and public checker draw on the learned scale (unit tests); they never write it.
- Bottom line: a wall-hit third tone teaches nothing (unit test).
- `npm run classifier-check`: "wall hits on a correct speaker" stays 0. `npm run test`, `npm run typecheck`, `npm run bench` (0 FAIL), `npm run build` + the hard rule 7 grep.

## Report back with
- `docs/briefs/reports/50-calibration-settings-tuner.md`: the step 1 table and the choice, what changed (files, commits), the top-half finding, a short "what Pierre should fly and look at" list (new player on a fresh browser profile; each tuner step; redo one part; Settings card; Visualiser band button; iPhone), open items for go-live (privacy line). Handover entry.
