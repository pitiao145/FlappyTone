# PRD — Working title: **ToneFlap** (Mandarin tone contour game)

**Version:** 0.1 (v1 scope)
**Date:** 2 Aug 2026
**Owner:** Pierre
**Status:** Spec for build — feed to coding agent

---

## 1. One-liner

A browser game where your voice is the controller: you steer a bird through corridors shaped like Mandarin tone marks by producing the matching tone. Your pitch contour *is* the flight path.

## 2. Why this design

The core insight is that the four Mandarin tone marks (ˉ ˊ ˇ ˋ) are literally pitch-contour diagrams. So the obstacle and the lesson are the same object: **the gap you fly through is the shape of the tone you have to make.**

Three design decisions follow from that, and they're the ones that matter:

1. **Pitch drives the bird continuously, frame by frame** — not "classify the tone, then move the bird." Classification requires the syllable to finish (~400–500ms), which would make the game feel broken. Continuous f0 → Y position is zero-latency and makes the mechanic legible in three seconds without instructions.
2. **Slot-based gates, not endless free-flight.** A real Mandarin tone lasts ~400ms. Sustaining one for three seconds to clear a long pipe would train drawn-out, unnatural speech. Each gate is a ~600ms window: one syllable, one gate.
3. **v1 verifies pitch contour only, not the syllable.** No ASR, no ML model download, fully client-side. Framed honestly as a *tone contour trainer*, not a pronunciation checker. Yes, humming beats it. That's an acceptable v1 trade — see §11.

## 3. Non-goals for v1

- No speech recognition / syllable verification
- No accounts, backend, leaderboard, or persistence beyond the current session
- No sandhi, connected speech, multi-syllable words, or sentences
- No native/mobile app build
- No tone perception (listening) drills
- No monetisation

## 4. Platform & stack

| Item | Decision |
|---|---|
| Type | Static web app, 100% client-side |
| Framework | React + Vite, TypeScript |
| Rendering | Canvas 2D + `requestAnimationFrame`. **Game loop must live outside React state** — React only renders the shell, menus and end screen. Do not drive per-frame updates through `useState`. |
| Audio | Web Audio API via `AudioWorkletNode` (not the deprecated `ScriptProcessorNode`) |
| Pitch detection | [`pitchy`](https://github.com/ianprime0509/pitchy) (McLeod Pitch Method — returns a `clarity` value, which we need for voicing detection). Fallback option: `pitchfinder`'s YIN. |
| Styling | Tailwind |
| Deploy | Static host, subdomain of pierrebuilds.dev |
| Target | Portrait mobile-first layout, playable on desktop |

**Layout:** 9:16 portrait canvas, max-width 420px, centred, dark neutral backdrop filling the rest of the viewport. It should read as a phone game even on a laptop.

---

## 5. Core mechanic spec

### 5.1 Pitch → screen position

Pitch perception is logarithmic, so **all mapping is in semitones, never raw Hz.**

```
semitones = 12 * log2(f0 / f0_center)
chao      = clamp(3 + (semitones / RANGE_SEMITONES) * 2, 1, 5)
```

Where `RANGE_SEMITONES = 5` by default (a 10-semitone total tone space, adjustable in settings, 3–8).

Chao 1–5 is the standard Chinese tone-level scale. Map it to the playable vertical band:

```
y(chao) = 0.80H - ((chao - 1) / 4) * 0.60H
```

| Chao | Meaning | Screen Y |
|---|---|---|
| 5 | high | 0.20 H |
| 4 | | 0.35 H |
| 3 | mid (rest) | 0.50 H |
| 2 | | 0.65 H |
| 1 | low | 0.80 H |

### 5.2 Pitch detection pipeline

Run at ~60 Hz (every ~16ms), analysis window 2048 samples @ 44.1kHz.

1. **Band-limit the search** to 70–400 Hz. Anything outside is rejected — this alone kills most octave errors.
2. **Voicing gate.** Frame counts as voiced only if `clarity >= 0.85` **AND** `rms >= noiseFloor * 3`. `noiseFloor` is measured during a 1-second silence captured in calibration.
3. **Octave-jump correction.** If the new f0 is within 5% of 2× or 0.5× the previous voiced f0, snap it to the nearest octave of the previous value.
4. **Median filter**, window of 5 frames, on raw f0.
5. **Exponential smoothing** on the resulting Y: `y = y + 0.35 * (yTarget - y)`. This is the key tuning knob — too low and the bird jitters, too high and the contour flattens out and Tone 2/4 stop registering. Expose it in a dev panel.

### 5.3 Unvoiced behaviour

- **Grace period:** hold the last Y for 120ms. This covers stop consonants, brief dropouts, and creak.
- **After grace:** drift toward Chao 3 (centre line) at 0.8 screen-heights/sec.
- Inside a gate, drifting means you'll clip a wall. Between gates it's harmless — this is deliberate, so the player can breathe.
- **The bird never falls from gravity.** Silence is not punished outside gates. This is a voice game; forced continuous phonation causes vocal fatigue within two minutes.

### 5.4 Calibration (first run, and re-runnable from settings)

1. "Stay quiet for a second" → capture `noiseFloor` (RMS).
2. "Say **ma** three times, normal speaking voice" → take the median voiced f0 across the three → `f0_center`.
3. Show a live preview: a dot moving with their voice against the Chao 1–5 grid, with a "does this feel right?" range slider before they continue.

Persist to `localStorage` so it isn't re-run every session (this is the one exception to "no persistence" — it's a settings value, not game data).

---

## 6. Tone gate geometry

A **gate** is a corridor whose centreline traces the target tone's Chao contour. Defined as a polyline over normalized horizontal progress `t` (0 → 1):

| Tone | Chao | Polyline (t → chao) | Feel |
|---|---|---|---|
| **1** `mā` | 55 | (0, 5) → (1, 5) | flat corridor near the top |
| **2** `má` | 35 | (0, 3) → (1, 5) | ramp up from middle to top |
| **3** `mǎ` | 214 | (0, 2) → (0.4, 1) → (1, 4) | dip to the floor, then climb |
| **4** `mà` | 51 | (0, 5) → (1, 1) | steep slide from top to bottom |

**Corridor tolerance (half-height of the gap):** starts at `0.12 * H`, tightens to a floor of `0.07 * H` as difficulty ramps.

**Gate duration:** 600ms of travel. Gate width in px = `scrollSpeed * 0.6`.
**Rest interval between gates:** 900ms at start, shrinking to a floor of 600ms.

**Difficulty ramp:** every 5 gates cleared — `scrollSpeed *= 1.08` (cap 2.2× base), `tolerance *= 0.95` (floor 0.07H), `restInterval *= 0.95` (floor 600ms). Base `scrollSpeed = 220 px/s`.

### Tone 3 needs special handling

This is the known killer, from the research: **creaky voice destroys f0 tracking, and creak concentrates on Tone 3** — precisely the tone learners struggle with most. If unhandled, the app will show a broken curve on the hardest tone and the player will assume the app is wrong (it is).

v1 mitigations:

- Inside a T3 gate, extend the unvoiced grace period from 120ms to **250ms**, and *hold* rather than drift.
- Widen T3 tolerance by 1.3× relative to other tones.
- Never render a T3 gate as failed due to signal loss alone — if >40% of frames in the gate were unvoiced, mark the gate **"couldn't hear that"** (neutral, no score, no heart lost) rather than scoring it 0.

That last rule generalises: **when the app isn't sure, it says so rather than scoring you wrong.** Every competitor in this space loses trust the first time it tells a correct speaker they're wrong.

---

## 7. Scoring

Per gate, sample the bird's Y every frame within the gate window:

```
err_t      = |birdY_t - corridorCentreY_t| / tolerance
accuracy   = clamp(1 - mean(err_t), 0, 1)
```

| Accuracy | Rating | Points |
|---|---|---|
| ≥ 0.85 | Perfect | 300 |
| ≥ 0.60 | Good | 150 |
| cleared without collision | OK | 50 |
| wall collision | — | lose 1 heart, gate scores 0 |
| >40% unvoiced | "Couldn't hear that" | 0, no heart lost |

**Combo:** consecutive Perfect/Good gates multiply score — ×1, ×1.5, ×2, ×3 (caps at ×3). Any OK or worse resets it.

**Hearts:** 3 per run. Not instant-death — a learning tool that kills you after three gates is demoralising and people won't get past the tone they're worst at.

---

## 8. Screens

1. **Title** — Play, Calibrate, Settings, How to play. Must include a visible "needs a microphone and a quiet room" line before the mic prompt.
2. **Calibration** — as in §5.4.
3. **Tutorial run** — 8 gates, one tone type at a time in order 1→4→2→3, double tolerance, no hearts, no scoring. Text cue on each gate: *"say it flat and high"*, *"start low, slide up"* etc.
4. **Game** — the run.
5. **Game over** — total score, best combo, and **the actual learning payload: per-tone accuracy breakdown** (e.g. T1 92% · T2 71% · T3 34% · T4 88%) plus a one-line takeaway ("Tone 3 is your weak spot — it dips before it rises"). Retry / Home.

### HUD (in-game)

- Target syllable, large, in pinyin with tone mark + hanzi + tone number — e.g. **mā 妈 (1)** — shown as the gate approaches
- Score, combo multiplier, hearts
- The Chao 1–5 grid as faint horizontal guide lines

### The one visual that matters

**The bird leaves a trail of its last ~1.5s of movement.** That trail is the player's actual pitch contour, drawn live. Inside a gate, draw a faint dashed ghost line along the corridor centreline — the ideal contour — so the player sees their trace against the target in real time. This single element is the whole product; everything else is packaging.

---

## 9. Audio reference

Play a native recording of the target syllable **300ms before the gate enters the screen**. Call-and-response: hear it, then produce it.

**Source:** [MSU Tone Perfect](https://tone.lib.msu.edu/) — 9,860 free open-access clips, 410 syllables × 4 tones × 6 native speakers.
**⚠️ Check the licence before shipping publicly.** It's open access for research/education; commercial or redistribution terms need verifying. If it doesn't clear, fall back to [audio-cmn](https://github.com/hugolpz/audio-cmn) (open-licensed) or record a handful of syllables with a local native speaker.

**v1 syllable set:** 8 syllables × 4 tones = 32 clips. Suggested: `ma, ba, yi, wu, shu, li, hao, tang`. Preload all on game start; they're tiny.

---

## 10. Edge cases the coding agent must handle

| Case | Behaviour |
|---|---|
| Mic permission denied | Friendly screen explaining the game is unplayable without it, with browser-specific re-enable instructions |
| No microphone present | Same screen, different copy |
| iOS Safari | `getUserMedia` **and** `AudioContext.resume()` both require a user gesture. Everything must be behind an explicit "Tap to start" button. Test this specifically — it's the most common silent failure. |
| `AudioWorklet` unsupported | Show an unsupported-browser message. Do not silently fall back to `ScriptProcessorNode`. |
| Tab backgrounded / `visibilitychange` | Pause immediately, suspend the AudioContext |
| Loud background noise | The `rms >= noiseFloor * 3` gate handles most of it. If >60% of frames over a 3s window are voiced-but-erratic, surface a non-blocking "it's noisy in here" hint. |
| Voice outside calibrated range | Clamp to Chao 1 or 5, and flash a subtle edge indicator so the player knows they're pinned rather than thinking the game is stuck |
| Bluetooth headset | Adds 100–200ms latency and will feel wrong. Detect if possible; otherwise note it in How to play. |

---

## 11. Known limitations — state these in the product, not just the PRD

1. **Humming beats it.** No syllable verification in v1. Don't market it as a pronunciation checker. Call it what it is: a tone *contour* trainer.
2. **Isolated syllables only.** Every substantive complaint about tools in this category is that they work on single syllables and collapse on connected speech. v1 is squarely in that trap. Own it rather than papering over it.
3. **Tones aren't only pitch.** Duration and amplitude carry real cues; native listeners can identify Tone 3 from creak alone with the pitch flattened out. A pitch-only game measures an incomplete signal.
4. **Sustained tones aren't natural speech.** The 600ms gate keeps this closer to reality than a Flappy pipe would, but it's still slower than conversational Mandarin.
5. **Vocal fatigue.** Runs should be short by design. If playtesting shows people's voices tiring inside 3 minutes, shorten runs rather than adding more content.

---

## 12. Build order — de-risk first

**Step 0 (≈2 hours, do this before anything else):** a single page with one dot whose Y is driven by your voice, over a Chao 1–5 grid, with a trail. No game, no gates, no menu.

Then say `mā má mǎ mà` into it and look at the trails.

**If that doesn't feel immediately good and legible, stop and rethink the mechanic.** Everything in this PRD is downstream of that 2-hour prototype working. Specifically check: does Tone 2 read as a clean rise, or does smoothing flatten it? Does Tone 3 produce a visible dip or does creak blank the trace?

Only then:

1. Calibration flow + localStorage
2. Scrolling world, one hardcoded Tone 1 gate, collision detection
3. All four gate shapes from the polyline table
4. Scoring, hearts, combo
5. Difficulty ramp + gate sequencing
6. Reference audio playback
7. Tutorial run
8. Game-over screen with per-tone breakdown
9. Polish: art, sound, feel

---

## 13. Definition of done for v1

- [ ] Playable start to finish on desktop Chrome and iOS Safari
- [ ] Calibration completes in under 30 seconds
- [ ] A native Mandarin speaker can hit ≥80% average accuracy on their first run — **if they can't, the pitch mapping or tolerances are wrong, not the player**
- [ ] A complete beginner survives the tutorial without reading instructions
- [ ] Tone 3 gates do not produce false failures from creaky voice
- [ ] Per-tone breakdown on game over is accurate and legible
- [ ] No console errors, no memory growth over a 5-minute session

---

## 14. Open questions for after the prototype

- Does the trail read better as a solid line, dots-per-frame, or a fading ribbon?
- Should the gate show the target syllable in hanzi at all for beginners, or pinyin only? (Three separate learners in the HN thread asked for pinyin-only modes.)
- Is 600ms the right gate width, or does it need to flex per tone? Tone 3 in citation form is genuinely longer than Tone 4.
- Taiwan vs Beijing reference audio — you're in Taiwan and MSU's corpus is mainland standard. Worth flagging to testers.
- Does anyone play it twice? That's the only question that matters after week one.
