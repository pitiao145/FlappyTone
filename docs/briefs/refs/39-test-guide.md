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
| 1 | 媽 mā: first-tone line where your easy high note is? | Take 1: ok, score 20%, tone 68%, read T1 (76%). Take 2: good, score 80%, tone 81%, T1 (80%). Bird struggles to reach the top. | Take 1: good, score 64%, tone 80%, read **none** (9%). Take 2: perfect, score 93%, tone 93%, T1 (98%). Bird reaches the top easily. **Right.** |
| 2 | 八 bā, 天 tiān (older lifted words): same height as 媽? | 八: ok, score 13%, tone 72%, T1 (80%). 天: **collision** (wall hit), score 0%, tone 78%, read none (7%). | 八: good, score 85%, tone 94%, T1 (96%); same height as 媽. **Right.** 天: ok, score 52%, tone 57%, T1 (70%); corridor a little lower than old. |
| 3 | 罵 mà, 看 kàn: fourth tone starts at the top; reachable without strain? Fall ends where your voice ends? | 罵: perfect, score 100%, tone 86%, T4 (100%). 看: perfect, 100%, tone 87%, T4 (100%). | 罵: perfect, 100%, T4. 看: perfect, 100%, tone 87%, T4 (100%). Both feel fine; **behaves very much the same as old.** But 罵's target still rises from 3 to 5 before the fall (see notes). |
| 4 | 麻 má: lower start of the second tone feels natural? | Take A (old started first): ok, 50%, tone 83%, read **T3** (90%). Take B (new first): ok, 50%, tone 85%, T2 (73%). | Take A (started second): **collision**, 0%, tone 50%, T2 (99%). Take B (started first): perfect, 94%, tone 93%, T2 (99%). Whole second tone sits a bit lower; feels **OK**. |
| 5 | 好 hǎo (Standard): third tone ends at 4.5; OK? | Take A: ok, 43%, tone 67%, read **T2** (59%). Take B: good, 82%, tone 72%, T3 (95%). | Take A: perfect, 100%, tone 90%, T3 (100%). Take B: perfect, 100%, tone 92%, T3 (100%). Third tone drawn lower; **fine**. Behaviour similar. |
| 6 | 馬 mǎ in **Natural** style: still read as third tone? Any wall hit? | Take A: good, 62%, tone 75%, read none (46%). Take B: ok, 17%, tone 46%, T3 (98%). No wall hit. | Take A: perfect, 100%, tone 63%, T3 (100%). Take B: perfect, 100%, tone 87%, T3 (100%). No wall hit. Sometimes read **none** when Pierre does not rise back up. |
| 7 | 小時 xiǎoshí, 公園 gōngyuán: corridor join in the right place? Pair read in the Visualiser? | 小時 game: ok, 31%, tone 70%, read "T2" (99%). Visualiser 美國 měiguó (T3+T2), 4 tries: T3·T3, T3·none, none·T2, none·T2. **0 of 4 both right**; tone accuracy 44→62%. 公園, 7 tries: T4·T2, T4·T4, T1·T3, T1·T3, ?·T3, T4·T2, T3·T2. **0 of 7 both right**; tone accuracy 81–86%. | 小時 game: **collision**, 0%, tone **0%**, read "T2" (99%). Visualiser 美國, 6 tries: T3·T2 on the first 4, then none·T2 twice. **4 of 6 both right**, never a wrong tone; tone accuracy 79→81%. Pierre: **pretty good**. 公園 gōngyuán (T1+T2), 7 tries: ?·?, T4·T2, ?·T3, T1·T3, ?·T3, T4·T2, T3·T2. **0 of 7 both right**; tone accuracy 76–86%. |
| 8 | Deliberately **low voice** (~2 semitones down) on 媽 / 馬 for 20+ gates: does the new mode follow you? Wall hits in each mode? | Same low voice: **died after the first 3 gates.** | Tone Drill first tone, ~20 gates: died after ~3 gates each run; no learning felt. Scale moved anyway: middle 129 → 109 Hz. Then one Classic run: **clearly better, a long run.** Scale after 65 gates: middle 106 Hz, up 4.92, down 3.0 (limit). **Works.** |
| 9 | New calibration "middle" step: clear? Too long, or repetitive (same words as the flight)? | — | Re-calibrated: **142 Hz**, +2.0 / −4.5 st (first new take was 129 Hz, +2.3 / −3.8). Feels **weird: a pre-calibration before the real one.** **Bug:** a long 媽 runs on into the 馬 slot and is counted there. Needs its own review session. |
| 10 | Wall hits on gates you said correctly: any? (Hard rule: unclear signal is never scored wrong.) | **1:** 天 tiān (tone shape 78%, read none). | **2:** 麻 má (tab started second, read T2 99%), 小時 (read T2 99%). Both likely include the late-start effect; recheck in a single tab. No others. |
| 11 | Visualiser: band on/off button; band width vs the game; resize the window: line stays steady? | — | Band option: **good**. Button: **unclear**; Pierre does not know what the icon means and thinks no one would. Needs a clearer control (label or better icon). Screenshot (a first + fourth tone pair): band shape uneven, see notes. Off state **kept after reload**; line **steady on resize**. |
| 12 | Visualiser pairs with `localStorage["ft.stretchPairs"]="1"`: does the stretched faded line read better? (Option, not decided.) | — | **Keep the code, off by default.** Not in the Visualiser now. Maybe later as a user toggle in a richer analysis view, to compare more easily. |
| 13 | **Real iPhone:** calibration middle step and a run (mic and audio need a tap). Then `__frameGaps.report()` in the console with the Visualiser open ~30 s (brief 47 phone timing check). | — | Calibration works: 133 Hz, +2.0 / −4.3 st. Run and mic taps: **fine**. Timing: 2505 frames, hop 21.3 ms, median gap 21 ms, p95 22 ms, max 42 ms, off share 0.1%, drift −21.7 ms, **`useCountedTime: false` → pass**, no follow-up needed. |

Per test, write: wall hits, the tone the end screen names, and "right / too high / too low / weird".

## Test session notes (18 Nov 2026, Pierre, Mac)

Setup: two tabs on the same port (https://localhost:5190), left = old, right = new, calibrated in both.

| calibration | middle | up to line 5 | down to line 1 |
|---|---|---|---|
| old (talking middle) | 138 Hz | +2.0 st | −4.0 st |
| new (媽 馬 馬 middle) | 129 Hz | +2.3 st | −3.8 st |

- **Unexpected:** the new middle is 1.2 semitones *lower* than the old one. The guide expects the opposite (talk middle ~1.5 st *under* the tone middle). Could be two different calibration takes; worth a check.
- **Test caveat:** both tabs share one browser storage. The mode switch and the learned scale are stored there. Reloading the left tab would turn it into "new" too. Ports with separate storage are safer for the next session.
- **Method:** Pierre flies the same gate in both tabs at once (one voice take, two readings). Fair A/B.
- **Test 1:** new is better on both takes (score 64/93% vs 20/80%). First tone height feels right in new. One watch item: new take 1 flew well (good, 64%) but the reader said "none" (9%). No heart lost (correct per hard rule 8), but that gate gives no tone to the stats.
- **Test 2:** 八 sits at the same height as 媽 in new: the shared lift works for 八. 天 sits a little lower in new than in old. **Old mode hit a wall on a correct 天** (tone accuracy 78%, so the shape was right): the case hard rule 8 and the "wall hits on a correct speaker" count guard against. New mode did not hit a wall on the same take.
- **Test 3:** both fourth tones perfect in both modes; Pierre feels no difference. **Possible bug:** in new, 看's dashed target starts at the top (as the guide says), but 罵's target still climbs from line 3 to line 5 and then falls, like the old shape. Either 罵 keeps its old shape in new (for example the new shape did not fit the clip length and the old one was used), or Jane's 罵 really rises first. Check which shape 罵 gets in new mode.
- **Method caveat (from test 4):** the two "Fly this gate" buttons cannot be clicked at the same moment. The tab started second hears the voice early on its own gate clock. Pierre now alternates which tab starts first. Compare each mode on the take where it started first.
- **Test 4:** the lower second tone feels OK. When each mode started first: new perfect 94% vs old ok 50%. Old misread a correct second tone as T3 (90%) once. New hit a wall once while the reader said T2 at 99%: most likely the late-start artefact above, but a wall hit on a confidently read correct tone is worth a check in a single-tab run.
- **Test 5:** new is better (perfect 100% on both takes, read T3 at 100%). Old misread a correct third tone as T2 (59%) once. Pierre finds the lower third tone fine. Small visual notes for later: in new the dashed target ends near line 4, not 4.5 as the guide says; the lower wall runs off the bottom of the canvas (flat cut); the upper wall makes a narrow spike above line 5 at the end and comes back down.
- **Test 6:** no wall hits in either mode; new scores perfect 100% on both shown takes. **Watch item:** in Natural style, a third tone that only goes low and does not rise again (the normal everyday form) is sometimes read as "none". No heart lost, but the stats miss it, and it is the very form Natural style is meant to accept. Pierre is not sure his own tones were clean. The Natural target itself still ends with a rise (to about line 3.5 in new, line 4 in old).
- **Test 7 (小時, game):** pairs are hard to judge in the game. New hit a wall on 小時 with tone accuracy 0%, while the reader said "T2" at 99% (the second syllable was right). Possible wall hit on a correct speaker; it could also be the late-start effect. The end card shows one tone ("T2") for a two-syllable pair, which hides how syllable 1 was read. 
- **Test 7 (Visualiser, screen video, word 美國 měiguó T3+T2):** new is clearly better. New read both syllables right on 4 of 6 tries and never named a wrong tone (the misses were "none" on syllable 1). Old got 0 of 4: it named the second syllable T3 once and gave "none" on one syllable three times. Tone accuracy about 80% (new) vs 44–62% (old).
- **Test 7 (Visualiser, 公園 gōngyuán T1+T2): known bug confirmed, in both modes.** Pierre's line follows the dotted target closely (tone accuracy 76–86%), yet 0 of 7 tries named both tones right in either mode. Syllable 1 (first tone): new said ? ×3, T4 ×2, T3 ×1, T1 ×1. Syllable 2 (second tone): read T3 in 3 of 7 tries in both modes; Jane's 園 dips deep before it rises, so a close copy of it looks like a third tone to the reader. So the shape score says "good" while the names say "wrong": the pair reader, not the voice, is the problem. New mode at least says "?" more often than a wrong name.
- **Test 8 (low voice, Tone Drill first tone, ~20 gates in short runs):** Pierre died after about 3 gates each run and could not see any learning. **UX gap:** the Settings calibration card shows the calibration, not the learned scale, so a player (or tester) cannot see that the scale is learning. Learning closes 10% of the gap per heard gate and at most 1.5 st per run.
  - **Learned scale after the test (console read, 52 heard gates):** middle **129 → 109 Hz (−2.9 st)**, top half 2.3 → **4.29 st**, bottom half 3.8 → **3.0 st (the lower limit, `gridHalfMin`)**. So the scale *did* learn the low voice, and a little more than the ~2 st asked. But the player could not feel it while dying every ~3 gates. Watch items: the bottom half is pinned at its limit; the top half almost doubled; one low-voice session moved the middle almost 3 st, which a tired or sick learner would also trigger.
  - **After one Classic run in the low voice (65 gates):** middle 106 Hz (−3.4 st from calibration), top half **4.92 st** (still growing), bottom half 3.0 (still at the limit). New mode gave a long run; old mode died after the first 3 gates on the same voice. **Learning works and helps.** Watch: the top half keeps widening (2.3 → 4.3 → 4.9) while the bottom stays pinned, so the scale gets lopsided.
  - **Pierre (after test 8):** this is a strong feature; the learned scale should apply everywhere (Visualiser, all game parts), and the calibration should update with it. Recorded as his lean on decision 5; confirm at the decisions step. Claude's view: every tool *uses* the learned scale; only game gates (known target, heard signal) *feed* it; Settings shows the live learned values with "learned from N gates" and a reset to the calibration; keep the calibration as the anchor, do not overwrite it.
  - **Pierre agreed (18 Nov):** keep the original calibration. Settings gets a richer calibration view: the original calibration *and* the learned scale side by side, with "go back to my calibration" and "re-calibrate". (Follow-up brief.)
- **Test 9 (new middle step):** two new-mode calibrations on the same day gave 129 Hz and 142 Hz, **1.7 st apart** (Pierre: his own voice and room noise vary). So one calibration is a rough start; the in-game learning is the better way to fine-tune. Pierre: the middle step feels like a pre-calibration before the real one. **Bug:** if the first-tone 媽 lasts long, the step moves on to the third-tone 馬 while he is still voicing, and the 媽 sound is counted as 馬. Pierre wants the whole calibration reviewed in its own session.
- **Test 11 (Visualiser band):** keep the band, fix the toggle: its icon (an arc next to the mic) says nothing to a user. Seen on the screenshot: on a first + fourth tone pair the band is lopsided: around the first tone it covers only line 4 up to above the top of the canvas (the line-5 target sits on its lower part), then at the join it steps into a thin strip that runs down past line 1 off the canvas.
- **Test 13 (iPhone):** everything works. Phone timing is clean: gaps sit on the 21.3 ms hop (48 kHz), one late frame at most (42 ms = one skipped hop), 0.1% off, drift about one hop over ~53 s. Brief 47's rule says keep the current time stamp. Phone calibration 133 Hz sits between the two Mac takes (129, 142).

## Decisions waiting on you

1. Release note wording (draft in the brief 48 report, step 4). The sentence "accuracy may go up" is a guess.
   - **→ Pierre (19 Nov): no release note.** Not needed; drop it. (It had no place to appear: the app has no "what's new" screen.)
2. Stats: go live on a Monday + a "new tone scale" marker in Progress, or something else.
   - **→ Pierre (19 Nov): neither.** Few players today. Pierre explains the better calibration and scoring in an email himself. No Monday rule, no Progress marker.
3. Logging: room noise + share heard only (A), or also your learned scale (B, a voice profile; reverses brief 35).
   - **→ Pierre (19 Nov): A.** Log only `noiseDb` and `heardPct` (plus the one usage-analytics clause from the brief 48 report, step 7). No voice profile; brief 35 stands. Still needed at go-live: the privacy line about the on-device voice-range summary (hard rule 12).
4. Site pages: regenerate their tone lines from the new shapes at go-live, so site and game agree?
   - **→ Pierre (19 Nov): yes.** Regenerate in the same go-live step (brief 48 step (c)); spot-check a few site pages after (for example the fourth tone on the tone chart).
5. Visualiser, public tone checker, TONEder: should they also use your learned scale?
   - **→ Pierre (19 Nov): yes, for the Visualiser and the public tone checker.** TONEder does not apply: it is a listening game, no mic, no scale. Tools *use* the learned scale; only game gates *teach* it. Settings shows the original calibration and the learned scale side by side, with "go back to my calibration" and "re-calibrate". Visitors with no calibration keep the default scale.
6. Bottom of the scale learning from wall-hit third tones (above).
   - **→ Pierre (19 Nov): the bottom line learns only from third tones that did not hit a wall.** A failed third tone teaches nothing, so the floor never rises to meet a mistake. Keep `gridHalfMin` as a second safety. (Test 8 showed the bottom half already pinned at that limit.)
7. Stretch pairs as a Visualiser option (test 12).
   - **→ Pierre (18 Nov, test 12): keep the code, off by default.** Maybe later as a user toggle in a richer analysis view.
8. Do the 4 old `jane_ma*` captures stay "the" ground truth, or does the Praat scorecard take over?
   - **→ Pierre (19 Nov): the Praat scorecard (`npm run bench`, 829 clips) becomes the main ground truth.** The 4 `jane_ma*` captures stay as fast fixture tests. The CLAUDE.md ground-truth sentence changes in a follow-up, not in this session.

## Not meant to work yet (go-live blockers)

- First tone read as fourth tone in voiced-join pairs (公園). Needs a pair-reading brief and more of your pair takes (especially first + second tone: 公園, 今年, 中國).
- Natural pair reading: only ~8% of natural pairs read both right. Many syllables are too short to judge.
- 30 older first-tone words: re-record.
- About 39% of natural pairs may have their corridor join in the wrong place.
- `process-clips` still makes new words on the old scale.
- Merge `main` first. Go-live = one database write with a backup (`npm run golive-shapes`, dry run tested), only on your yes.
