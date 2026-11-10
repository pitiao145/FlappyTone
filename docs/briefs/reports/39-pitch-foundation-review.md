# Report: 39 Pitch foundation review — Phase A (analysis)

- Result: partial. Phase A is done. Phase B waits for Pierre's review.
- Branch: `research/37-visualiser-pairs-deep-start` (worktree `research-37`).
- What changed: new dev-only bench `src/dev/bench39/` (11 scripts + README), this report, the brief's status line. No production file changed.
- Checks run: `npm run typecheck` pass. `npm run test` pass (135 files, 1824 tests). `npm run build` pass. The hard rule 7 grep prints nothing (also checked for `bench39`).

Every claim below has one label:
- **MEASURED**: I ran it. The command and the numbers are given.
- **READ IN CODE**: file:line.
- **ASSUMED**: I could not check it. I say why and what would check it.

---

## 1. Summary (five minutes)

### The question
Is the shape the bird flies a true picture of the tone's pitch movement, for Jane's recordings and for players, for every voice and every room?

### The answer
**Partly.** The part that hears pitch is good. The parts around it are the problem.

Think of three steps:
1. **Hear**: find the pitch in the sound.
2. **Place**: put that pitch on the 1–5 board.
3. **Read**: compare it with a target and name the tone.

| Step | State | How sure |
|---|---|---|
| Hear, clean audio, a voice like Jane's | **Right.** The pitch is correct to 0.05 semitone (typical), 0.4 semitone (worst 10%). A semitone is one piano key. The line is 40 ms late. | High, for one speaker. Checked on 829 clips with a second, independent method. |
| Hear, steady noise (wind, fan-like hiss) | **Right.** Noise is not drawn as voice, at any level I tested. The pitch stays correct. But the loudness gate throws away real voice in loud rooms and gives nothing back. | High for wind and hiss. Not tested on real fan, café, street. |
| Hear, another voice in the room (TV, people) | **Wrong.** 10–38% of the other voice is drawn as the player's voice. | High. |
| Hear, deep or high voices | **Wrong at the edges.** The listener only looks between 70 and 400 Hz. A deep male voice loses its low end. A high voice loses its peaks. | Medium. Jane's clips played slower/faster, not real people. |
| Place, Jane's targets | **Not her real pitch, on purpose.** The target keeps her timing and direction. Its heights are set to textbook levels. On a player's board the target moves about 50–70% as far as she really did. | High that it happens (it is in the code). Medium on the size. |
| Place, the player | **Fragile.** The board comes from one calibration. If the player's voice sits 2 semitones lower later, the tone reader falls from 89% to 55% on Jane's natural single tones. | High for Jane's clips. No learner data. |
| Read, single tones | **Right when calibration fits** (98% textbook, 89% natural on Jane). | High for Jane. |
| Read, tone pairs (Visualiser, public page) | **Wrong.** It reads both tones right on 55% of Jane's own textbook pairs and 2% of her natural pairs. | High. 411 pairs. |

### What is right today
- The pitch detector itself (the McLeod method in `src/pitch/mpm.ts`). I see no reason to replace it.
- "Voice-likeness" (the code calls it clarity: how regular the sound wave is) rejects steady noise without help.
- Creak (the rattling, very low voice at the bottom of a third or fourth tone) is mostly shown as silence, not as a wrong pitch. That fits hard rule 8.
- Target shapes follow Jane's timing and direction well (shape match 0.96–0.99 out of 1).
- Brief 37's facts about pairs hold on the full data.

### What is wrong, in order of evidence
1. **The pair read does not work** (MEASURED). It cuts at silences only. Most pairs have no silence.
2. **Reading depends on absolute height, and height depends on one calibration** (MEASURED). Jane herself speaks 1.4 semitones higher in textbook style than in natural style.
3. **Targets are textbook heights, not Jane's heights** (READ IN CODE + MEASURED). The game's wide corridor hides this. The Visualiser's thin line shows it.
4. **The voice band 70–400 Hz cuts deep and high voices** (MEASURED on a stand-in).
5. **The loudness gate costs voice and helps only against other voices** (MEASURED). At its cap, with a player who speaks softer than in calibration, low ends go missing.
6. **The line is 40 ms late** (MEASURED). Same delay for Jane and the player, so comparisons still match.
7. **Jane's targets were measured with a fixed gate that is high for her clips** (MEASURED): 19–25% of her voice loudness. Quiet endings are cut.
8. Smaller items: the player's time axis uses message arrival time (READ IN CODE), frame-based settings change with the device sample rate (READ IN CODE), the tone reader is fitted to the listener's own delay and smoothing (MEASURED).

### What I do not know
- Anything about **learners**. There is no learner audio.
- **Real** deep, high or child voices, real phone and laptop mics, Bluetooth headsets, real noisy rooms.
- How Jane's catalog clips were recorded (device, any processing). They are very clean (noise about 45 dB under the voice).
- Foorgol's device, page, calibration values.

### Brief 37 and brief 39: what I confirm and what I correct
- Confirmed: pair read failure (55% / 32% unsplit / natural about 0%). Pair targets do not start lower than single tones. Thin line vs wide corridor. The Visualiser measures room noise again on every canvas resize.
- **Corrected**: "at a 20% gate the whole fourth-tone fall is gone". That is true for one clip (`jane_ma4`). On 106 fourth-tone clips, a 40% gate removes a median of 1.3–1.6 semitones of a 12–16 semitone fall. Only 3–7% of clips lose more than 4 semitones. So the room-noise gate **alone** is a weak explanation for Foorgol. It becomes strong only when the gate is at its cap **and** the player speaks softer than in calibration.
- Corrected: frames are 21 ms, not 23 ms. All local audio is 48 kHz, not 44.1 kHz.
- Corrected: "Jane's reference is 181.3 Hz / 6.5" in the catalog. That is her **natural** session. Her textbook median is 196 Hz.

### Decisions I need from you before Phase B
1. **Reference tool.** May I add Praat (through the Python package `praat-parselmouth`) as an offline dev-only tool? Details in section 8. If no, I keep my own two-method reference.
2. **Target heights.** Must the target show Jane's real pitch heights, or textbook heights with her timing (today)? This is a product choice. Section 5.
3. **Other voices in the room (TV, people).** In scope or not? It is the only noise type that needs more than what we have.
4. **Voice range.** Must deep male voices (centre under about 95 Hz) and children work? Section 4.4.
5. **Recordings.** Will you collect the list in section 9? Without learner and male voices, Phase B is designed on one speaker again.
6. **Foorgol.** Can you ask them the five questions in section 7?
7. **Clip recording chain.** Which device and mic recorded the September and October sessions? Any processing?

---

## 2. The bench (reproducible)

All scripts are in `src/dev/bench39/`. Run order and commands are in `src/dev/bench39/README.md`. They are plain Node scripts. They are not imported by the app and are not in `dist/`. They write numbers only, to `node_modules/.cache/bench39/` (ignored by git).

### 2.1 The audio we really have
MEASURED: `node src/dev/bench39/inventory.mjs`

| Folder | Files | Sample rate | What it is |
|---|---|---|---|
| `clips/jane` | 357 | 48 kHz (4 at 44.1) | Textbook cut clips. 91 single tones, 246 pairs, 17 longer, 3 neutral. |
| `clips/jane/natural` | 472 | 48 kHz | Natural cut clips. 211 single tones, 240 pairs, 17 longer. |
| `clips/verify` | 595 | 48 kHz | Not used. Looks like a check copy of natural clips. |
| `recordings/jane/2026-09-20-jus5s9` | 351 | 48 kHz | Raw textbook session. |
| `recordings/jane/2026-09-28-kh04zm` | 473 | 48 kHz | Raw natural session. |
| `recordings/2026-08-07-xujzgs` | 120 | 48 kHz | The August single tones. Their cut clips are **not** local. |
| `captures` | 8 | 48 kHz | The early iPhone clips, with real wind (voice about 22–28 dB over the wind). |
| `tonepairs/wav` | 8 | 48 kHz | 4 early pairs, two versions each. |

- The catalog clips are very clean: quiet parts are about 45 dB under the voice. The captures are 28 dB. (dB = a loudness ratio. 20 dB = 10 times, 40 dB = 100 times.)
- 120 of the 477 fallback catalog rows have no local clip (the August single tones). MEASURED: counted against `src/data/wordsFallback.json`.
- `docs/TESTING.md` says fixtures are 44.1 kHz. They are 48 kHz.

### 2.2 The independent reference
`src/dev/bench39/ref.mjs`. I wrote it from scratch. It shares no code with `src/pitch/`.
- Method A works on the wave shape: it compares the sound with a shifted copy of itself and then picks the one smooth pitch path through the whole clip. It sees the whole clip at once, so it has no delay.
- Method B works on the spectrum (the list of frequencies in the sound): it asks which base pitch explains the most overtones.
- A frame is **trusted** when both agree within 1 semitone.

MEASURED: `node src/dev/bench39/ref-test.mjs`. On signals with a known pitch (flat 80, 200, 450 Hz, a 380→130 Hz fall in 0.2 s, a 150→60 Hz fall) the reference is right to 0.03 semitone typical, 0.3 worst.
MEASURED: `node src/dev/bench39/build-ref.mjs`. The two methods agree on 92.0% of voiced frames (textbook) and 87.1% (natural).

**Limit.** This is "two methods agree", not a gold standard. An error that both methods make would be invisible. Praat would close that gap (decision 1).

### 2.3 What I could not build
- Real rooms: we have about 8 s of real wind and no other real noise. I used wind (real), pink noise (synthetic hiss, a stand-in for a fan) and other Jane clips (real speech, a stand-in for a TV or a person).
- Other voices: none. I replayed Jane slower and faster. That moves the pitch but also the vowel colour and the speed. It tests the arithmetic only.

---

## 3. How it works today (what I read, where it differs from the brief)

- One `PitchTracker` everywhere. READ IN CODE: `src/ui/Game.tsx:572`, `src/ui/Visualiser.tsx:542`, `src/site/checker/engine.ts:239`, `src/dev/clipCut.ts:191,280`.
- Frames are 2048 samples, a new one every 1024. READ IN CODE: `src/audio/mic.ts:148-149`. The context uses the device's rate (`mic.ts:244`, `new AudioContext()` with no rate). On most phones and Macs that is 48 kHz. Then one step is 21.3 ms.
- Every per-frame setting changes with the rate: slew limit 3 semitones per frame, rescue for 3 frames, median of 5 frames, reset after 5 frames. READ IN CODE: `src/pitch/PitchTracker.ts:27,40,53`. At 44.1 kHz they are 8% longer in time. Small, but nobody chose it.
- A frame is voice when it is loud enough (`floor × 3`) and regular enough (clarity ≥ 0.7), or by the "glide rescue". READ IN CODE: `src/pitch/math.ts:130-146`.
- After that: octave fix, median of the last 5 frames, slew limit, board mapping with a clamp at 1 and 5, a light smoother. READ IN CODE: `PitchTracker.ts:173-202`, `math.ts:24-32`.
- Player board: centre = median pitch of the calibration "talk" step (`src/ui/Calibration.tsx:393`). Top (5) = the 90th percentile of the player's first-tone gates. Bottom (1) = the 10th percentile of their third-tone gates. READ IN CODE: `src/game/run.ts:747,973-978`, `src/pitch/calibration.ts:211-226`.
- Targets, single syllable: measured contour → **each tone's whole group is moved and stretched onto the textbook levels** (`src/dev/clipNormalize.ts:105-115`, called from `src/dev/process-clips.ts`) → reduced to 2–4 points per tone (`src/dev/clipCut.ts:488-517`) → smooth curve (`src/game/gates.ts:174`). The brief did not mention the first step. It matters most (section 5).
- Natural clips use the textbook group's stretch. READ IN CODE: `clipNormalize.ts:158-164`.
- Clip pipeline gate: fixed floor 0.0033, so the gate is 0.0099 and the rescue needs 0.033. READ IN CODE: `PitchTracker.ts:41`, `math.ts:105-108`.
- The Visualiser target is a 2-pixel dashed line. READ IN CODE: `src/render/visualiser.ts:161-163`. The game corridor is ±0.73 chao (±0.95 with a third tone). MEASURED: `toleranceChao(1, 0.11)` = 0.733, `toleranceChao(3, 0.11)` = 0.953.
- The Visualiser measures room noise inside an effect that runs again when the canvas size changes. READ IN CODE: `src/ui/Visualiser.tsx:536,685` (deps `[settings, canvasW, canvasH]`). There is no quiet hold.
- The catalog's `meta.reference` on 463 textbook rows names session `2026-09-28-kh04zm`, 181.3 Hz, ±6.5. That session is the natural one (473 raw files). MEASURED. Nothing in the app reads this field (READ IN CODE: no use outside `src/dev/`). It is harmless but misleading.

---

## 4. The listener, measured

### 4.1 Clean audio: the pitch is right, 40 ms late
MEASURED: `node src/dev/bench39/eval.mjs` and `node src/dev/bench39/detail.mjs`. 829 clips.

The raw detector (no gate, no smoothing), against trusted reference frames:

| Group | Typical error (semitones) | Worst 10% | Errors over 3 semitones |
|---|---|---|---|
| First tone | 0.01 | 0.05 | 0.0–0.1% |
| Second tone | 0.03 | 0.13 | 0.1–0.2% |
| Third tone | 0.03–0.04 | 0.17 | 0.0–0.5% |
| Fourth tone | 0.06 | 0.25 | 1.1–2.5% |
| Pairs | 0.03 | 0.17 | 0.5–0.9% |

The full tracker (live settings, lowest gate), same clips:

| Group | Error as drawn now | Error after I shift the line 40 ms earlier | Over 3 semitones after the shift |
|---|---|---|---|
| First tone | 0.09 | 0.02–0.03 | 0.0% |
| Second tone | 0.6 | 0.05 | 0.0% |
| Third tone | 0.7–0.9 | 0.05–0.06 | 0.0% |
| Fourth tone | 1.3 | 0.10–0.11 | 0.0–0.5% |
| Pairs | 0.5–0.6 | 0.05–0.06 | 0.0–0.1% |

- So the error "as drawn now" is almost all **delay**. The median of 5 frames answers 2 frames late. The best-fit delay is 40 ms for every group.
- The clip pipeline has the same 40 ms. So the target and the player are late by the same amount, and they still line up with each other.
- What the delay costs: the bird reacts 40 ms later than it could. During a fast fall, 40 ms is about 3–4 semitones behind the live voice.

Where voice is missed, live settings, lowest gate:
- First third of the voiced part: 73–91% heard. The middle: 90–100%. The last third: 92–100%.
- The start loss is by design: `minVoicedRun` 3 waits for 3 voice frames in a row (READ IN CODE: `PitchTracker.ts:190-200`). It costs about 43 ms at each start.
- Wrong voice on clean clips: under 2% of clearly silent frames.

Creak:
- 0–2.8% of Jane's frames are creak (I count a reference pitch more than 10 semitones under her centre).
- In creak the tracker is silent 67–100% of the time. In pairs it reports an octave too high on 5–18% of creak frames.
- ASSUMED: Jane creaks little. Many speakers, and many learners copying a third tone, creak more. That needs other voices.

### 4.2 The loudness gate
MEASURED: `eval.mjs`, `gate-t4.mjs`, `soft.mjs`. "Gate at 20%" means: a frame must be at least 20% as loud as the clip's typical voice.

Share of voice heard, live settings:

| Group | Lowest gate | 10% | 20% | 40% (today's cap) |
|---|---|---|---|---|
| First tone, last third | 100% | 97–98% | 88–91% | 64–74% |
| Fourth tone, last third | 92–94% | 88–90% | 80–87% | 51–66% |
| Pairs, all | 90–93% | 89–92% | 89–91% | 85–87% |

How much of a fourth-tone fall goes missing (106 clips):

| Gate | Low end lost, typical | Worst 10% | Clips that lose over 4 semitones |
|---|---|---|---|
| 2% | 0.3–0.4 | 1.2–1.6 | 0–1% |
| 20% | 0.5–0.6 | 1.6–2.5 | 0–4% |
| 40% | 1.3–1.6 | 2.8–3.8 | 3–7% |

- Third-tone dips and second-tone lows do not move at any gate up to 40%. The low point is in the loud middle of the syllable.
- The glide rescue is used on about 2% of Jane's fourth-tone frames at a low gate and 0% at 40%. On these clean clips it matters little. On the old iPhone capture `jane_ma4` it matters a lot. MEASURED: I re-ran `docs/briefs/assets/39/noise.ts`; its numbers reproduce (lowest point 1.22 → 1.92 → 4.70).
- **So brief 37's key number came from the one clip where the effect is largest.**

The cap plus a softer voice. The cap is 40% of the loudness measured in calibration. If the player then speaks softer:

| Gate vs the voice in use | Fourth tone heard | Fourth tone low end lost (typical / worst 10%) | Pairs heard | Pairs low end lost |
|---|---|---|---|---|
| 40% (same loudness) | 82% | 1.0 / 2.6 | 87% | 0.2 / 1.9 |
| 57% (3 dB softer) | 74% | 2.3 / 4.3 | 80% | 0.3 / 3.7 |
| 80% (6 dB softer, half as loud) | 64% | 4.2 / 9.0 | 67% | 1.0 / 5.4 |

This is the case where "the line will not go low" is real. It needs two things at once: the floor at its cap, and a softer voice.

### 4.3 Rooms
MEASURED: `node src/dev/bench39/noise.mjs`. 208 clips. 0.8 s of noise alone before each clip, then the clip in the noise. "App rule" = the floor the app would measure in that noise, with the cap. "None" = no loudness gate, only voice-likeness and the 3-in-a-row rule.

| Noise | Voice vs noise | Gate | Voice heard | Fourth tone, last third | Noise drawn as voice | Pitch error typical |
|---|---|---|---|---|---|---|
| Wind (real) | 20 dB (normal room) | app rule | 90% | 87% | 0.0% | 0.05 |
| | | none | 92% | 91% | 0.0% | 0.06 |
| | 10 dB (loud room) | app rule | 83% | 64% | 0.0% | 0.06 |
| | | none | 88% | 85% | 0.1% | 0.07 |
| | 5 dB (very loud) | app rule | 64% | 23% | 0.0% | 0.07 |
| | | none | 77% | 52% | 0.1% | 0.08 |
| Pink (synthetic) | 10 dB | app rule | 85% | 65% | 0.0% | 0.06 |
| | | none | 89% | 86% | 0.0% | 0.06 |
| | 5 dB | app rule | 68% | 28% | 0.0% | 0.08 |
| | | none | 82% | 69% | 0.0% | 0.09 |
| Other speech (real) | 30 dB (quiet TV) | app rule | 93% | 93% | 10.5% | 0.05 |
| | | none | 93% | 95% | 44% | 0.05 |
| | 10 dB | app rule | 88% | 77% | 15% | 0.07 |
| | | none | 93% | 95% | 49% | 0.07 |
| | 5 dB | app rule | 79% | 55% | 38% | 0.09 |
| | | none | 88% | 73% | 50% | 0.10 |

What this says:
- Against **steady noise**, the loudness gate adds nothing. Voice-likeness already keeps the noise out. The gate only removes real voice, most of all quiet endings.
- Against **another voice**, the gate helps (44–50% down to 10–15%) and is still not enough.
- Where the voice is heard, the pitch stays right in every case.
- Already in a normal room (20 dB) the gate sits at 27% of the voice, and the rescue (10 × the floor) needs more than the typical voice loudness. READ IN CODE for the rule, MEASURED for the 27%.

Limits: 8 s of real wind, synthetic hiss, and Jane's own voice as "the TV". Real fan, café and street audio are needed.

### 4.4 Other voices (stand-in)
MEASURED: `node src/dev/bench39/voices.mjs`. Jane's clips played slower or faster. 208 clips.

| Centre pitch | Like | Reference frames under 70 Hz | Over 400 Hz | Voice heard | Heard, inside the band only | Low end lost (typical / worst 10%) | High end lost |
|---|---|---|---|---|---|---|---|
| 181 Hz | Jane | 0% | 0% | 93% | 93% | 0.04 / 0.6 | 0.1 / 0.8 |
| 136 Hz | low female, high male | 0% | 0% | 95% | 95% | 0.02 / 0.6 | 0.04 / 0.6 |
| 109 Hz | typical male | 0.1% | 0% | 96% | 96% | 0.02 / 0.6 | 0.02 / 0.4 |
| 91 Hz | deep male | 13% | 0% | 82% | 94% | 1.2 / 3.5 | 0 / 0.2 |
| 76 Hz | very deep male | 38% | 0% | 59% | 93% | 4.5 / 6.7 | 0 / 0.1 |
| 254 Hz | high female, child | 0% | 6.5% | 83% | 88% | 0.1 / 1.1 | 1.1 / 4.7 |

- Inside the band the listener is as good at every pitch (93–96% heard, 0.05 semitone error). The method is not the problem.
- The band is. READ IN CODE: `fMin` 70, `fMax` 400 (`PitchTracker.ts:42-43`). A deep voice's third and fourth-tone lows fall under 70 Hz and vanish. A high voice's fourth-tone start and second-tone end go over 400 Hz and vanish.
- For Jane herself: no clip has more than 5% of frames over 400 Hz. 34 clips have more than 5% under 70 Hz, which is creak.
- ASSUMED: typical adult male centres are about 100–130 Hz and female about 190–220 Hz (the code comment at `src/game/tuning.ts:634-640` says the same). So the low limit hits roughly the deepest tenth of men, and the high limit hits high female voices and children. Real recordings would check this.

### 4.5 The clip pipeline's fixed gate
MEASURED: `eval.mjs`, last tables.
- Jane's typical voice loudness is 0.053 (textbook) and 0.039 (natural). The fixed gate 0.0099 is therefore **19% and 25%** of her voice. For the quietest tenth of natural clips it is 36%.
- 122 of 472 natural clips have a typical loudness under the rescue level 0.033. For them the rescue is mostly off.
- Effect on targets: the last third of a fourth tone is 87% heard, of a first tone 86–93%. The top of a second or third-tone rise is cut about 1.2–1.5 semitones short (0.3–0.7 with the lowest gate).
- The later stretch onto textbook levels hides the height loss. The loss stays in the timing: the target finishes its rise or fall a little early.

---

## 5. The targets: are they a true picture of what Jane said?

MEASURED: `node src/dev/bench39/heights.mjs --worst`. 354 textbook rows that have a local clip.

### 5.1 What Jane really does (reference, semitones from her own median)

| Style | Tone | Start | Lowest | Highest | End |
|---|---|---|---|---|---|
| Textbook (median 196 Hz) | 1 | +5.2 | +4.3 | +5.4 | +4.9 |
| | 2 | −2.9 | −4.8 | +6.5 | +5.8 |
| | 3 | −1.7 | −7.2 | +5.1 | +4.7 |
| | 4 | +8.5 | −7.3 | +9.0 | −6.9 |
| Natural (median 181 Hz) | 1 | +3.1 | +2.1 | +3.4 | +2.8 |
| | 2 | −2.6 | −4.8 | +4.1 | +3.6 |
| | 3 | −1.9 | −6.2 | +1.6 | +1.0 |
| | 4 | +6.0 | −5.9 | +6.5 | −5.7 |

Three facts that the board does not show today:
- Her fourth tone starts **3 semitones above** her first tone. On the board both sit near 5.
- Her textbook voice is **1.4 semitones higher** overall than her natural voice.
- Her natural third tone rises back to only +1.6. In textbook it rises to +5.1.

### 5.2 Target vs what she said
To compare, I put her real pitch on the board that the app's calibration rule would give her: centre 181 Hz, top +7 semitones, bottom −5.75.
ASSUMED: her natural clips stand in for the "talk" step, and her textbook first and third tones stand in for the calibration flight. A real calibration by Jane would check it.

| Group | Gap between her and her target (chao, typical / worst 10%) | Her frames inside her own game corridor | Her frames above the board top | Shape match (1 = same) | Target movement ÷ her movement |
|---|---|---|---|---|---|
| First tone | 0.14 / 0.29 | 100% | 13% | flat | — |
| Second tone | 0.25 / 0.34 | 100% | 8% | 0.99 | 0.72 |
| Third tone | 0.38 / 0.49 | 100% | 3% (12% under the bottom) | 0.97 | 0.69 |
| Fourth tone | 0.60 / 0.80 | 100% (worst 10% of clips: 70%) | 34% | 0.98 | 0.51 |
| Pairs | 0.42 / 0.59 | 100% (worst 10%: 88%) | 21% | 0.96 | 0.68 |

Heights for single tones, on that board (said → target):
- Fourth tone start: 5.83 → 4.38. End: 1.05 → 1.49.
- Third tone start: 2.90 → 3.38. Low: 0.99 → 1.28.
- Second tone start: 2.48 → 2.75.
- First tone: 4.89 → 4.81.

What this says:
- **Direction and timing are true.** The shape match is 0.96–0.99.
- **Height is not hers.** It is the textbook level, by design. READ IN CODE: `clipNormalize.ts:12-17` ("her recordings supply the dynamics, the tone marks supply the height").
- **The target moves less than she does** on a calibrated board (about half for the fourth tone).
- **The corners are simplified** to 2–4 points per single tone. The remaining shape gap after the best stretch is small: 0.08–0.17 chao.
- In the **game**, the corridor (±0.73) swallows all of this. Jane would stay inside her own corridors.
- In the **Visualiser**, the target is a thin line. Jane herself would be drawn 0.14–0.60 chao away from her own line.
- Words where the target is furthest from her real shape: `ditie43`, `kuaile44`, `huan4`, `qiaokeli344`, `nali33`, `bi3b`, `yiqi13`, `ying2`, `suoyi33`, `haishi24`.

How much comes from where (my estimate from the numbers above):
- The stretch onto textbook levels: most of the height gap (up to 1.45 chao at the fourth-tone start).
- The 2–4 point templates: 0.08–0.17 chao of shape gap.
- The listener and its fixed gate: under 0.1 semitone of pitch error, 40 ms of delay (shared with the player), and endings cut a little early.

**My view.** The repo treats "textbook heights" as settled. It is a real trade:
- For: the board, the tone marks and the cue text agree. A first tone looks high.
- Against: the target is not "what a native speaker does". A learner is trained toward a clean diagram with a native speaker's timing. The stats and the Visualiser then judge the player against that diagram.
Both are defensible. It is your product decision (decision 2). The simple option is to keep it and say so plainly in the product.

---

## 6. The reading side

MEASURED: `node src/dev/bench39/reading.mjs`. Jane's clips through the live tracker, drawn on the board from 5.2, then read by the real `classifyToneV2` and `readContourSyllables`.

### 6.1 Single tones

| Case | Set | T1 | T2 | T3 | T4 | All |
|---|---|---|---|---|---|---|
| Calibration fits | textbook | 100% | 88% | 100% | 100% | 98% |
| | natural | 93% | 72% | 88% | 99% | 89% |
| Voice 2 semitones lower than at calibration | textbook | 100% | 65% | 95% | 100% | 92% |
| | natural | 16% | 47% | 63% | 79% | 55% |
| Voice 2 semitones higher | natural | 95% | 87% | 92% | 96% | 93% |
| Board 30% narrower than the voice | textbook | 100% | 29% | 100% | 100% | 87% |
| | natural | 95% | 21% | 83% | 97% | 76% |
| Board 40% wider | natural | 91% | 96% | 75% | 94% | 89% |

- The reader depends on **absolute height**. READ IN CODE: `tuning.ts` `toneV2T1MinChao: 3`, `toneV2T4MinPeakChao: 3.4`, and the `low` anchors.
- A 2-semitone drop is small. Jane's own two styles differ by 1.4. A voice in the morning, a tired voice, or a shy voice can do it.
- When I give the reader the **reference** contour (the true pitch, no delay, no smoothing), natural second tones read right only 40% of the time, against 72% from the tracker. So the reader's thresholds are fitted to the tracker's own smoothing. **Any change to the listener in Phase B will need the reader to be tuned again.**

### 6.2 Pairs

| Source | Set | Pairs | Split into two | Not split | Both tones right |
|---|---|---|---|---|---|
| Live tracker | textbook | 208 | 67% | 32% | 55% |
| | natural | 203 | 4% | 96% | 2% |
| Reference (true pitch) | textbook | 208 | 46% | 52% | 35% |
| | natural | 203 | 0% | 100% | 0% |

- Brief 37 said 56% / 31% / 0% on 48 pairs. On 411 pairs from the real audio I get 55% / 32% / 2%. **Confirmed.**
- With the true pitch it is worse, not better. So this is not a hearing problem. The method (cut at a silence longer than 150 ms, READ IN CODE: `src/game/freeAttempts.ts:29-45`) cannot work: in natural speech there is no silence between the two syllables.

### 6.3 Not measured in Phase A
- Corridor scoring and the tone-accuracy percentage per noise level. Reason: the pitch stays right in noise; what changes is how much is heard, which section 4.3 gives. I can add it if you want the exact scores.
- The public page's own 10-second calibration (`src/site/checker/quickCal.ts`).

---

## 7. Foorgol's case

"Calibration works for playing, not for the visualizer. Tone pairs: I would have to start with a much deeper voice than in the game."

Ranked by the evidence I have. None is proven.

| # | Possible cause | Evidence | What would confirm it |
|---|---|---|---|
| 1 | **The pair read fails anyway.** The page says "wrong" for most pairs whatever the player does. The player then hunts for a voice that passes. | MEASURED: 55% right on Jane's textbook pairs, 2% natural. | Which style was on. A screenshot of the result card. |
| 2 | **Thin line + textbook heights + their own calibration.** In the game, ±0.73 chao hides a height offset. In the Visualiser, 0.4–0.6 chao off the line is visible even for Jane. If their calibration third tones were very deep (people exaggerate in a tutorial), the bottom of the board is very deep, and every low target asks for that depth. | MEASURED gap sizes (5.2). READ IN CODE for the line and the calibration rule. ASSUMED for their calibration. | Their saved values: centre, top range, bottom range. |
| 3 | **Their voice sits higher in practice than in the "talk" step.** Then everything is drawn too high and they must go lower to reach the line. | MEASURED for Jane: 1.4 semitones between styles. MEASURED: the reader breaks at 2. ASSUMED for Foorgol. | The same saved values, plus a screenshot of one attempt. |
| 4 | **Room-noise gate at its cap, and a softer voice than in calibration.** | MEASURED: needs both (4.2). READ IN CODE: no quiet hold in the Visualiser; measured again on resize. | Device and browser. Did they rotate or resize? Do they practise quietly? |
| 5 | **Time, not height.** Jane's textbook pairs last 1.2–1.6 s. The Visualiser draws on real time. A player who says the pair at normal speed is on the second syllable while the target still shows the first. | READ IN CODE: `src/render/visualiser.ts:149-174` (target and contour share one millisecond axis). ASSUMED effect. | A screenshot. |

Questions for Foorgol:
1. Device, browser, and is it the app's Visualiser or the public page?
2. Standard or Spoken style? Which pairs?
3. A screenshot of one failed attempt with the dashed line visible.
4. Their calibration numbers (centre pitch, both range values, noise floor), if Settings shows them or they are willing to copy them.
5. Do they speak more quietly in the Visualiser than in the game? Did they rotate the phone or resize the window?

What to log later (Phase B, with a privacy-policy change): the session noise floor, the share of frames heard, and the three calibration numbers. Today none of that reaches us, so a report like this one cannot be checked.

---

## 8. Decision 1 in detail: the reference tool

| Option | What | Licence | Size | Note |
|---|---|---|---|---|
| A (my advice) | `praat-parselmouth`: Praat's pitch method from Python. Praat is the standard tool in speech research. | GPL-3 | ASSUMED: about 10–20 MB plus `numpy` (about 20 MB). I did not install it, so I did not measure. | Offline, dev-only, runs once, writes JSON. Nothing ships. Python 3.11 is on this machine (MEASURED). GPL does not touch the app because the tool is not distributed with it. |
| B | `librosa` pYIN | ISC | ASSUMED: over 100 MB with its own dependencies | Heavier, not better for this job. |
| C | CREPE or another neural tracker | MIT | ASSUMED: several hundred MB (TensorFlow) | Too heavy for the gain. |
| D | No dependency | — | 0 | Keep `ref.mjs`. Two methods agree on 87–92% of frames. Good enough to rank problems. Weaker as proof of a new design. |

---

## 9. Decision 5 in detail: what to record

Use the recording booth (`/record`) where possible, so the audio takes the same path as the game (raw mic, no browser processing). A phone voice memo is second best. Volunteers only. Never player audio from the app (hard rule 12).

**Voices** (about 10 minutes each):
- 2 men with a low voice, one of them very deep.
- 1 man with a middle voice. 1 woman with a high voice. 1 child if possible.
- 3–4 learners with different first languages. You yourself count as one.
- If possible a second native speaker.

**What each person says:**
- 10 s of normal talk (their own language is fine).
- 5 s of silence in the same place.
- The four tones on `ma`, `yi`, `shu`, two times each (24 syllables).
- 8 pairs, two times each: 你好, 好玩, 可能, 幫忙, 工人, 牛奶, 對面, 媽媽.
- Learners: say them as they naturally would. Do not coach.

**Devices:** iPhone built-in mic, one Android phone, a laptop built-in mic, and Bluetooth earbuds (AirPods). Bluetooth in mic mode sends a narrow, heavily processed signal. ASSUMED: that could hurt the listener a lot. It is untested.

**Rooms** (10–20 s of the room alone, then the word list, same device):
- Quiet room. Fan or air-con close by. Café. Street. TV or radio with speech on. Wind outdoors.

**Labels:** file name with speaker, device, room and the word, as `fixtures/captures/` does.

---

## 10. Rules in the repo that I would question

- **"The room is quiet while the player waits"** (`src/pitch/noiseMeter.ts` header). The measurement has no way to know that. And against steady noise the gate it feeds does not help (4.3).
- **`voiceCapFraction` 0.4** is marked "NOT YET TUNED". At the cap, quiet endings are cut (4.2).
- **`rescueRmsMult` 10** ties the rescue to the noise floor. In a normal room it already asks for more than the typical voice loudness (4.3).
- **`fMin` 70 / `fMax` 400** exclude real voices at both ends (4.4). `docs/TESTING.md` already lists "a low male voice near the 70 Hz band floor" as missing.
- **CLAUDE.md "ground truth is `fixtures/captures/jane_*.wav`"**: 8 clips, one of which gave brief 37 its strongest and least typical number. The 829 catalog clips are the better regression set.
- **CLAUDE.md "the tone classifier never costs a heart"**: I did not test hearts. But the reader's accuracy depends on calibration fit (6.1), and `classifier-check` runs on contours that are already on Jane's own board, so it cannot see that.
- **"Tone accuracy is checked against Jane's real measured contours"**: those contours come from the same listener. They prove the reader agrees with the listener, not that either is right. Brief 39 says this too. It is correct.

---

## 11. What Phase B should start from (not a design yet)

Only the facts that the design must respect:
- Keep the detector. Fix what is around it.
- The delay, the band limits, the loudness rule and the per-frame settings are separate, small things. Each can be changed and measured alone on this bench.
- The pair read needs a different idea (not silence). The clip pipeline already splits at a loudness dip; the bench can test that on 411 pairs.
- A reading that does not depend on absolute height would remove the largest player-side risk. A cheap alternative is to re-centre from the player's own recent speech.
- If the listener changes, the reader's thresholds and the catalog must be measured again.

## Follow-ups
- Phase B, after your decisions.
- Fix `docs/TESTING.md` (48 kHz, not 44.1) and the catalog `meta.reference` on textbook rows, when a brief touches them.
