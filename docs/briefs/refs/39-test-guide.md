# Branch research/39-pitch-foundation — what changed and what to test

Written 18 Nov 2026 for Pierre. Plain words first; details are in `docs/briefs/reports/40-…48-*.md`.
Run it: `npm run dev` **from this worktree** (`.claude/worktrees/research-37`) → https://localhost:5190/app (or the port Vite prints). Each port keeps its own browser storage.

## The big picture in one paragraph

The game hears you, draws a target, places that target on a scale fitted to your voice, and then judges your tone. Phase A found that each of these four parts used a slightly different idea of "high" and "low". Phase B made them use **one ruler** (one scale) for Jane and for you. It also made the listener faster and checked everything against Praat, a standard pitch tool that serves as an answer sheet. Nothing is live in production. Everything sits on this branch.

## What is always on in this branch (both Lab modes)

These are not behind the switch. You see them in "old" and "new" mode.

| what | in plain words | look out for |
|---|---|---|
| **Faster line** (brief 42) | The pitch line now trails your voice by 20 ms instead of 40 ms. The game smooths over 3 small time slices, not 5. | The line should feel a bit more "glued" to your voice. Bad sign: more jitter or small jerks, mostly on fast fourth tones. |
| **Low-voice floor** (42) | The game used to stop listening under 70 Hz. Now, for a deep voice (middle under ~117 Hz), it listens down to 55 Hz. Your voice (~128 Hz) and Jane's do not change. | Only a real deep male voice can test this. Nobody has yet. |
| **Pair splitting** (46) | To read a pair (小時), the game first finds where syllable 1 ends. Before: only at a silence. Now: at a silence, or else at a real dip in loudness. If neither exists, it says "?" instead of guessing. | Visualiser pairs tab. **Known bug:** at joins without silence (公園 gōngyuán, 工人), the first tone is often read as a fourth tone. Do not ship before a fix (planned brief). |
| **Visualiser band** (47) | The Visualiser now draws the target as a band as wide as the game's tunnel, not a thin line. A button next to mute turns it off. The room noise is measured once per mic session, not again on every resize. | Does the band match how forgiving the game is? Does the button stay in its position after you reload? |

## What the Lab switch changes ("Old foundation" ↔ "New foundation")

Title → type `lab` → top of the Tuning panel. The page reloads. **Calibrate again after each switch** for a fair comparison.

### 1. Target shapes (brief 43)
- **Before:** the target was Jane's line, stretched per tone onto textbook heights. Shapes right, heights a bit made up.
- **Now:** every word is measured on Jane's one ruler: 3 = her middle, 5 = her first-tone height, 1 = her third-tone low. Nothing is stretched. Targets also follow her timing (a "knee" where the voice turns).
- **What you will see:** first tone: **no change**. Fourth tone **starts at the top at once**, then falls fast and holds low. Second and third tones start lower and dip deeper. Third tone ends at 4.5 instead of 5.
- **Watch:** the 30 older first-tone words (八 bā, 天 tiān, 三 sān, …) got one shared lift, because Jane said them lower in that older session. They must be re-recorded before go-live. Do they sit at the same height as 媽 mā?

### 2. Your scale: calibration + learning (brief 44)
- **Before:** the middle came from your normal talking, the top from your first tone and the bottom from your third tone. It was measured once and then fixed. The talk middle sits about 1.5 semitones under the middle of your tones.
- **Now:** a **new short "middle" step**: you say 媽, 馬, 馬. The middle comes from tone words. While you play, the scale **keeps learning**: the middle follows how you say every word, the top follows your first tones, the bottom follows your third tones. Small steps per gate, capped per run.
- **Watch:** start with a voice 2 semitones too low. After ~20 gates the scale should have followed you. **Product question:** the bottom also learns from third tones that hit a wall. A learner whose third tone is not low gets a higher floor, so the game asks less of them. Fair or too easy?

### 3. Tone reader + tone accuracy (brief 45)
- **Before:** the reader that names your tone ("that was a second tone") partly used absolute height. On a scale that is off by 2 semitones it failed often (natural words: 89% → 55% right).
- **Now:** it reads the *shape* (when the turn comes, how much it rises or drops), not the height. It has five safety rules: when a read is unsure, it never costs a heart. Tone accuracy uses the new averages.
- **What you will see:** tone accuracy numbers a bit higher (Jane: 0.77 → 0.84). That is the new scale, not you getting better.
- **Watch:** a correct third tone named "second tone" when your scale is too wide (that is likely for you: your range is smaller than the standard). It costs no heart, but the stats say "second tone".

## Checklist (fly in both modes; write what you see)

| # | test | old | new |
|---|---|---|---|
| 1 | 媽 mā: first-tone line where your easy high note is? | | |
| 2 | 八 bā, 天 tiān (older lifted words): same height as 媽? | | |
| 3 | 罵 mà, 看 kàn: fourth tone starts at the top; reachable without strain? Fall ends where your voice ends? | | |
| 4 | 麻 má: lower start of the second tone feels natural? | | |
| 5 | 好 hǎo (Standard): third tone ends at 4.5; OK? | | |
| 6 | 馬 mǎ in **Natural** style: still read as third tone? Any wall hit? | | |
| 7 | 小時 xiǎoshí, 公園 gōngyuán: corridor join in the right place? Pair read in the Visualiser? | | |
| 8 | Deliberately **low voice** (~2 semitones down) on 媽 / 馬 for 20+ gates: does the new mode follow you? Wall hits in each mode? | | |
| 9 | New calibration "middle" step: clear? Too long, or repetitive (same words as the flight)? | | |
| 10 | Wall hits on gates you said correctly: any? (Hard rule: unclear signal is never scored wrong.) | | |
| 11 | Visualiser: band on/off button; band width vs the game; resize the window: line stays steady? | | |
| 12 | Visualiser pairs with `localStorage["ft.stretchPairs"]="1"`: does the stretched faded line read better? (Option, not decided.) | — | |
| 13 | **Real iPhone:** calibration middle step and a run (mic and audio need a tap). Then `__frameGaps.report()` in the console with the Visualiser open ~30 s (brief 47 phone timing check). | | |

Per test, write: wall hits, the tone the end screen names, and "right / too high / too low / weird".

## Decisions waiting on you

1. Release note wording (draft in the brief 48 report, step 4). The sentence "accuracy may go up" is a guess.
2. Stats: go live on a Monday + a "new tone scale" marker in Progress, or something else.
3. Logging: room noise + share heard only (A), or also your learned scale (B, a voice profile; reverses brief 35).
4. Site pages: regenerate their tone lines from the new shapes at go-live, so site and game agree?
5. Visualiser, public tone checker, TONEder: should they also use your learned scale?
6. Bottom of the scale learning from wall-hit third tones (above).
7. Stretch pairs as a Visualiser option (test 12).
8. Do the 4 old `jane_ma*` captures stay "the" ground truth, or does the Praat scorecard take over?

## Not meant to work yet (go-live blockers)

- First tone read as fourth tone in voiced-join pairs (公園). Needs a pair-reading brief and more of your pair takes (especially first + second tone: 公園, 今年, 中國).
- Natural pair reading: only ~8% of natural pairs read both right. Many syllables are too short to judge.
- 30 older first-tone words: re-record.
- About 39% of natural pairs may have their corridor join in the wrong place.
- `process-clips` still makes new words on the old scale.
- Merge `main` first. Go-live = one database write with a backup (`npm run golive-shapes`, dry run tested), only on your yes.
