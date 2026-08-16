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

> **⚠️ Superseded.** The range is no longer a fixed default: calibration
> measures the speaker's own excursion and seeds it (`computeRangeSemitones`,
> half the p10–p90 span of their voiced semitones). Bounds are **3–10**, not
> 3–8 — measured speakers land between 3.5 and 6.0, and the old ceiling was
> low enough that a wide voice could not persist a value that fitted her.
> The slider still wins; the measurement is a starting point, not a verdict.
>
> **⚠️ Superseded again (9 Aug 2026) — the board is not symmetric.** There are
> two halves, `rangeSemitones` (centre → chao 5) and `rangeDownSemitones`
> (centre → chao 1), measured from their own sweeps:
>
> ```
> half = semitones >= 0 ? rangeSemitones : rangeDownSemitones
> chao = clamp(3 + (semitones / half) * 2, 1, 5)
> ```
>
> `f0Center` is the median of *conversational* speech, and a speaking voice
> sits near the bottom of a speaker's range, not its middle — so one shared
> half-width is wrong on both sides at once. A player reaching +10 st up and
> −2 st down was handed a symmetric ±6 board: their entire downward reach drew
> at chao 2.33 (reported as "the dot stays in the middle when I go low"), the
> top third of their upward reach was clamped dead against chao 5, and the T3
> corridor floor at chao 1.22 asked for three times the drop they had just
> demonstrated they had — which is the *second* reported symptom, and the same
> defect. Continuous and monotonic across the knee at chao 3, and identical to
> the old mapping when the halves are equal, which every offline caller
> (`clipCut`, `tone-synth`, `npm run report`) still is.

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

> **⚠️ Measured deviations — the code is right and this section is stale.**
> Do not "restore spec compliance"; these values were changed *because* the
> spec's numbers failed on real voices. Evidence in `fixtures/captures/`,
> reproduce with `npm run report`.
>
> | Spec says | Code does | Why |
> |---|---|---|
> | `clarity >= 0.85` | `0.7`, plus a **glide rescue** | NSDF clarity collapses exactly when pitch slews fastest, so a native Tone 4 fall was discarded at full loudness with correct pitch. A loud, pitch-continuous, recent frame is voiced even below threshold. See `isFrameVoiced()`. |
> | `alpha = 0.35` | `0.85` | The smoothness/responsiveness trade-off does not exist here: median-5 and the slew clamp de-jitter upstream, so alpha is monotonic across 0.15–1.0 on lag, contour survival *and* jitter. 0.35 is strictly worse on all three. |
> | analysis at ~60 Hz | ~43 Hz (2048 window, 1024 hop) | 50% overlap at 44.1–48kHz |
> | (slew unspecified) | `3.0 st/hop` | A native citation Tone 4 falls ~95 st/s, touching 140. An earlier 1.5 (≈65 st/s) clamped the real signal. |
>
> Visual smoothing is a *separate* stage the spec doesn't mention:
> `EASE_TAU_MS` in `src/game/dynamics.ts` eases the drawn dot and never touches
> scoring data. It now contributes more lag than alpha does.

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

> **⚠️ Superseded — the flow is now quiet → talk → high → low → preview.**
> "Say **ma** three times" asks a beginner to perform a syllable from the
> language they are here to learn, and it infers the range from whatever
> excursion three flat syllables happen to contain — which under-reports a
> range the speaker has but did not use.
>
> | step | asks for | yields |
> |---|---|---|
> | quiet, 1s | silence | `noiseFloor` (unchanged) |
> | talk, 6s | "say what you had for breakfast, or count to ten" | `f0Center` — more voiced frames, in the register they actually speak in |
> | high, 3s | "say ahh as high as is comfortable" | high semitone sweep |
> | low, 3s | "and as low as is comfortable" | low semitone sweep |
> | preview | free play + slider | confirmation |
>
> `computeRangeHalvesFromExtremes(high, low)` seeds the board: the up half from
> p90 of the high sweep, the down half from p10 of the low sweep, each trimmed
> for the same reason `computeRangeSemitones` trims — one octave-error or creak
> frame at either extreme would otherwise size the whole board around an
> artefact. **The two sweeps are not averaged into one number**; that was the
> defect §5.1 records. The up half is clamped to 3–10 and the down half to
> **2**–10: the 3 is a floor on how much space the four contours need to stay
> apart, which is a property of the whole board, not of each half. Measured on
> a player at +10.9 / −2.7 st (9 Aug 2026), a per-half floor of 3 rounded his
> down half up and put chao 1 — and with it the T3 corridor trough — just past
> the deepest note he has. His total board is 13.6 st, which is normal: Jane's
> widest excursion across 120 takes is 13.1. A speaker who never drops below
> their centre still gets a floored down half rather than one mirrored from a
> reach they did not make.
>
> The live dot runs during both sweeps, because seeing yourself reach is what
> makes "as high as is comfortable" legible without more words — and during the
> sweeps only, it *holds* on unvoiced instead of drifting to chao 3. A low reach
> goes creaky, creak reads as unvoiced, and snapping the dot back to the middle
> of the board at the moment the player is asked to look at how far down they
> got is the same lie the symmetric range told.

---

## 6. Tone gate geometry

A **gate** is a corridor whose centreline traces the target tone's Chao contour. Defined as a polyline over normalized horizontal progress `t` (0 → 1):

| Tone | Chao | Polyline (t → chao) | Feel |
|---|---|---|---|
| **1** `mā` | 55 | (0, 5) → (1, 5) | flat corridor near the top |
| **2** `má` | 35 | (0, 3) → (1, 5) | ramp up from middle to top |
| **3** `mǎ` | 214 | (0, 2) → (0.4, 1) → (1, 4) | dip to the floor, then climb |
| **4** `mà` | 51 | (0, 5) → (1, 1) | steep slide from top to bottom |

> **⚠️ Superseded — the polyline table above is drawn from the tone *marks*, not from speech.**
> Measured against `fixtures/captures/jane_ma*.wav` (native, citation), every
> contour tone is wrong in the same way: **real tones hold, then move fast; these
> ramp at a constant rate.** Her T4 sits at the top for ~60% of the syllable and
> falls in ~170ms — about 95 st/s, the same figure the slew clamp in
> `PitchTracker.ts` is set from. The linear 5→1 corridor asks for ~17 st/s, so no
> T4 she can produce fits it. A 22-gate run on 4 Aug 2026 bore this out: she
> cleared 90% of T1 gates — the only corridor with no rate demand — and 8% of
> T2/T3/T4, and sustained and stretched her tones to compensate.
>
> | Tone | was | now (measured) |
> |---|---|---|
> | 1 | (0,5) → (1,5) | unchanged |
> | 2 | (0,3) → (1,5) | (0,3) → (0.25, 2.2) → (1,5) — it dips before it climbs |
> | 3 | (0,2) → (0.4,1) → (1,4) | (0,3) → (0.45,1.2) → (0.72,1.2) → (1,5) — holds on the floor |
> | 4 | (0,5) → (1,1) | (0,5) → (0.6,5) → (0.9,1) → (1,1) — a plateau and a cliff |
>
> Evidence caveat: one speaker, one syllable, citation register. Thin, but a
> large improvement on a hand-drawn diagram. Widen it before treating as settled.
> Note also `jane_ma3_natural`: her *natural* T3 falls 3.3→1.8 in ~256ms and
> never rises. v1 teaches the citation contour deliberately — the ˇ mark is the
> game's premise — but the game is not teaching conversational T3.

**Corridor tolerance (half-height of the gap):** starts at `0.12 * H`, tightens to a floor of `0.07 * H` as difficulty ramps.

**Collision** requires `COLLISION_SUSTAIN_MS` (80ms) *continuously* outside the corridor. A single ~21ms frame is measurement, not a wall; an unvoiced frame clears the timer rather than bridging two excursions.

> **⚠️ Superseded — gate duration is per-tone, answering §14's open question.**
> `GATE_DURATION_S` in `gates.ts` is **0.88 / 1.07 / 1.33 / 0.60s** — the exact
> lengths of the shipped reference clips. Gate width in px =
> `scrollSpeed * GATE_DURATION_S[tone]`, so the ramp moves the world faster but
> never demands a faster tone.
>
> **The clips are the anchor.** `public/ref/ma{1-4}.wav` are cut by
> `npm run make-ref-clips` from `fixtures/captures/jane_ma*.wav`, the same takes
> the polylines are measured from. The player hears a contour, watches the demo
> dot trace that contour, and is scored against it — one clock for all three.
> Two separate failures came from those three disagreeing, so treat "demo length
> == gate length == polyline timeline" as an invariant, not a coincidence.
>
> Each contour **completes before the gate ends and then holds** its final chao.
> Load-bearing: a speaker who finishes a rise and sustains the note was
> otherwise above a corridor still climbing underneath her — 469ms and 512ms
> excursions and two collisions on correct T2 attempts (4 Aug 2026). The clips'
> own trailing *release* (T2 falls back to ~3.0 after its peak) is deliberately
> not modelled; releasing is not part of the tone.
>
> **Known tension.** These are citation-form takes, and the same speaker in play
> produced much shorter syllables (medians 501/342/235/341ms) and said "the
> corridor feels too long, we really need to sustain it for an unnatural amount
> of time." Matching the demo was chosen over matching natural tempo, on the
> grounds that call-and-response only works if both halves agree. The way to get
> both is shorter recordings, not a shorter corridor — see §14.

**Gate duration:** ~~600ms of travel. Gate width in px = `scrollSpeed * 0.6`.~~
**Rest interval between gates:** 900ms at start, shrinking to a floor of 600ms.

**Difficulty ramp:** ~~every 5 gates cleared — `scrollSpeed *= 1.08` (cap 2.2× base), `tolerance *= 0.95` (floor 0.07H), `restInterval *= 0.95` (floor 600ms). Base `scrollSpeed = 220 px/s`.~~

> **⚠️ Superseded (16 Aug 2026) — `scrollSpeed` is fixed game-wide, ramp or
> no ramp.** It no longer varies by the difficulty ramp — `rampDifficulty` in
> `gates.ts` returns `baseScrollSpeed` untouched. Reasoning: gate width in px
> is `scrollSpeed * shape.durationS`, and that only approximates a word's own
> recorded contour — the point of using each word's own measured shape at all
> — if `scrollSpeed` holds still. With it fixed, the corridor a player flies is
> a stable, direct rendering of the recording's own timing, at every point in
> a run. Difficulty still climbs — tolerance still tightens (`toleranceH *=
> 0.95` per 5 gates, floor 0.07H) and rest still shrinks (`restMs *= 0.95`,
> floor `restMsFloor`) — just never by making the world move faster.
> `baseScrollSpeed` itself moved too, from 220 to 200 px/s, as part of the
> same tuning pass (`DEFAULT_TUNING` in `tuning.ts`). Difficulty ramp is now:
> `tolerance *= 0.95` (floor 0.07H), `restInterval *= 0.95` (floor
> `restMsFloor`). Base `scrollSpeed = 200 px/s`, fixed.
>
> **⚠️ Superseded again (16 Aug 2026) — player-selectable pace is gone.** The
> relaxed/normal/fast pace setting (its only remaining effect after the
> change above: stretching the rest interval) has been removed entirely — it
> no longer changed anything a player could actually feel differently enough
> to justify a menu control, since scroll speed was already fixed. Rest
> interval is now the fixed constant the old "relaxed" default computed to
> (`baseRestMs`/`restMsFloor` in `tuning.ts`, doubled from their pre-pace
> values to preserve the shipped default breathing room).

> **⚠️ Superseded (16 Aug 2026) — corridor tolerance widens per vertex, not
> per scanned window.** The "Corridor tolerance" line above (`0.12*H` fixed)
> is stale: `corridorToleranceAt` in `gates.ts` adds a timing-forgiveness
> widening on top of the base tolerance,
> shaped like a tiny second polyline through the same t-coordinates as the
> tone's own corridor vertices, run through the identical spline evaluator the
> centreline uses (`splineAt`). Each vertex's own widening comes from the
> polyline segment immediately behind it, so a steep climb's *final* vertex —
> where a speaker's timing error costs the most — gets the most forgiveness,
> tapering back to nothing across genuinely flat stretches (T1 throughout,
> T4's plateau, T3's floor). Two earlier implementations of this same idea (a
> windowed max-scan with a 33-tap Gaussian blur, then a per-segment blend)
> both drew a visible "double-notch" flare-pinch-flare on T3's wall, most
> visible where the fall and rise meet at the floor — reported directly
> against screenshots of the Lab's paused gate preview. Fitting a spline
> through the vertices' own values, the same way the centreline already does,
> removed the notch because there is no local window left to pinch.

### Tone 3 needs special handling

This is the known killer, from the research: **creaky voice destroys f0 tracking, and creak concentrates on Tone 3** — precisely the tone learners struggle with most. If unhandled, the app will show a broken curve on the hardest tone and the player will assume the app is wrong (it is).

v1 mitigations:

- Inside a T3 gate, extend the unvoiced grace period from 120ms to **250ms**, and *hold* rather than drift.
- Widen T3 tolerance by 1.3× relative to other tones.
- Never render a T3 gate as failed due to signal loss alone — if the gate holds no utterance long enough to judge, mark it **"couldn't hear that"** (neutral, no score, no heart lost) rather than scoring it 0.

> **⚠️ Superseded — the ">40% unvoiced" rule is gone.** A 35-second real-device
> session (iPhone, 4 Aug 2026) fired "couldn't hear that" on roughly half of all
> gates while the player was speaking. A gate is 600ms of travel and a citation
> syllable carries pitch for ~300–400ms of it, so demanding 60% voiced frames
> demanded more voicing than the language produces. The test is now absolute
> duration: the longest voiced run in the gate, merging gaps under
> `MERGE_GAP_MS` (120ms, for T3 creak dropouts), must reach `MIN_UTTERANCE_MS`
> (180ms). See `longestUtteranceMs()` in `src/game/scoring.ts`.
>
> Gates also seed from up to `PRE_GATE_BUFFER_MS` (400ms) of pitch history when
> they open mid-syllable — the player answering the demo immediately, which the
> call-and-response design trains them to do, previously had that whole
> utterance discarded. Only a run seen to *begin* inside that buffer is claimed;
> a hum the player never stopped is not an answer.

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
| no voiced run ≥180ms | "Couldn't hear that" | 0, no heart lost (see §6 — this replaced ">40% unvoiced") |

**Combo:** consecutive Perfect/Good gates multiply score — ×1, ×1.5, ×2, ×3 (caps at ×3). Any OK or worse resets it.

**Hearts:** 3 per run. Not instant-death — a learning tool that kills you after three gates is demoralising and people won't get past the tone they're worst at.

---

## 8. Screens

1. **Title** — Play, Calibrate, Settings, How to play. Must include a visible "needs a microphone and a quiet room" line before the mic prompt.
2. **Calibration** — as in §5.4.
2b. **Settings** — voice (read-back of the saved calibration, re-calibrate,
   forget), speed, tunnel width, demo style, motion preference, and a way into
   the visualiser. Each control says what it changes; they were previously
   three unlabelled rows on the title screen.
2c. **Tone visualiser** — the game's screen with the game taken out: no gates,
   no scrolling, no score. x is time-since-the-utterance-began rather than
   world position, so repeated attempts at one tone lie on top of each other
   and on top of the target. This is the answer to "the game asks you to
   produce a tone *and* hit a moving corridor, and a failure does not say
   which half went wrong."
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
> **⚠️ Superseded again (8 Aug 2026) — the inventory is 120 of Jane's words**,
> 30 per tone, recorded at `/record` and cut by `npm run make-clips`. Each clip
> carries its own corridor polyline and its own length in `manifest.json`, and
> the gate is built from the clip the player is about to hear — so §6's
> "demo length == gate length == polyline timeline" now holds per word rather
> than per tone. One exception remains, deliberate and documented in
> CLAUDE.md: a clip's absolute Chao level comes from the tone mark rather than
> from her voice (her T1 measures at chao 3.3). The other exception this note
> used to list — T3 flying a citation polyline instead of its own word's
> shape — is gone (16 Aug 2026): that was a measurement defect in
> `clipCut.ts`, not a fact about her T3, and fixing the voicing rescue and the
> run-merge gap means all 30 T3 words now measure a real dip-and-rise. Every
> tone, including 3, flies its own recording's shape.
>
> **⚠️ Superseded — the shipped clips are Jane's own recordings**, cut from
> `fixtures/captures/jane_ma*.wav` by `npm run make-ref-clips`, used with her
> permission. That removes the audio-cmn CC-BY-SA attribution obligation *and*
> the speaker mismatch: the corridors are measured from these same takes. The
> note below applies only if a third-party corpus is ever reintroduced.
>
> **⚠️ Amended again (9 Aug 2026) — a clip is the whole take.** The first
> amendment restored the consonant at the front; the same bug was still eating
> the back. Cutting on voicing dropped a median of 360ms of audible material,
> and up to a second on Tone 3, where creak reads as unvoiced: `yuan3` shipped
> as 453ms of a 1495ms recording. Since the raw takes hold a median of 64ms of
> lead silence and none at the end, there was nothing to gain by cutting at all.
> `make-clips` now copies the recording verbatim (15ms fade at each end, so the
> takes that stop on the waveform do not click).
>
> The corridor is unchanged — still measured over the voiced window alone, and
> all 120 polylines are byte-identical across the change — so this moved audio
> and clocks only. `manifest.json` carries three lengths per clip: `clipS` (the
> file, and how long the world freezes), `onsetS` (file start → tone start, which
> the demo dot waits out) and `durationS` (the tone window, which is the gate).
> `clipS` is not the sum of the other two.

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

- Does the trail read better as a solid line, dots-per-frame, or a fading ribbon? (The visualiser is now the surface to answer this on — same data, stationary axis, no timing pressure.)
- Should the gate show the target syllable in hanzi at all for beginners, or pinyin only? (Three separate learners in the HN thread asked for pinyin-only modes.)
- Is 600ms the right gate width, or does it need to flex per tone? Tone 3 in citation form is genuinely longer than Tone 4.
- Taiwan vs Beijing reference audio — you're in Taiwan and MSU's corpus is mainland standard. Worth flagging to testers.
- Does anyone play it twice? That's the only question that matters after week one.
