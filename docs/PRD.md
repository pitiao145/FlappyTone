# PRD — FlappyTone

**Status:** Living spec, tracks the shipped codebase. Historical v1 spec (with
its full amendment trail) is archived at `docs/_archive/PRD-v0.1-annotated.md`
— read it if you want the reasoning behind a decision; this file states
current behavior only. Design rationale that isn't part of the spec itself
lives in `docs/DECISIONS.md`.

## 1. One-liner

A browser game where your voice is the controller: you steer a bird through corridors shaped like Mandarin tone marks by producing the matching tone. Your pitch contour *is* the flight path.

## 2. Why this design

The four Mandarin tone marks (ˉ ˊ ˇ ˋ) are literally pitch-contour diagrams. The obstacle and the lesson are the same object: the gap you fly through is the shape of the tone you have to make.

1. **Pitch drives the bird continuously, frame by frame** — not "classify the tone, then move the bird." Classification requires the syllable to finish, which would make the game feel broken.
2. **Slot-based gates, not endless free-flight.** Each gate is one syllable, sized to that word's own recorded length.
3. **v1 verifies pitch contour, and now also a standalone tone-shape classifier — never a syllable.** No ASR, no ML model download, fully client-side. Framed honestly as a tone contour trainer.

## 3. Non-goals

- Speech recognition / syllable verification (ASR)
- Accounts, real backend/auth, payments
- Tone sandhi, connected speech, multi-syllable words, sentences
- Native/mobile app build
- Tone perception (listening) drills

**One scoped exception, not a reversal of the above:** the Progress tab's
local run history (`src/game/runHistory.ts`) and a "N of 5 free runs today"
limiter (`src/game/dailyLimit.ts`) are real, device-local, non-tamper-proof
state — no accounts, nothing leaves the device, no payment flow behind it.
See CLAUDE.md's scoped-exceptions note. Don't read this as license to build
more persistence or a monetisation flow on top of it without a deliberate
decision to do so.

## 4. Platform & stack

| Item | Current |
|---|---|
| Type | Static web app, three separate entries (see §CLAUDE.md "Three entries") |
| Framework | React 19 + Vite, TypeScript |
| Rendering | Canvas 2D + `requestAnimationFrame`, outside React state |
| Audio | Web Audio API via `AudioWorkletNode` only |
| Pitch detection | Custom band-limited McLeod Pitch Method implementation (`src/pitch/mpm.ts`) — no longer the `pitchy` package; `pitchy` remains a listed dependency but is unused in source |
| Styling | Plain CSS with a design-token system (`src/ui/tokens.css`, `docs/BRAND.md`) |
| Deploy | Vercel, static + a handful of small serverless functions under `api/` for the recording booth and newsletter signup (not gameplay — see CLAUDE.md) |
| Target | Portrait mobile-first layout, playable on desktop |

**Layout:** 9:16 portrait canvas, max-width 420px, centred, dark neutral backdrop filling the rest of the viewport.

## 5. Core mechanic

### 5.1 Pitch → screen position

All mapping is in semitones, never raw Hz:

```
semitones = 12 * log2(f0 / f0Center)
```

The tone space is **asymmetric**: an upward half and a downward half,
measured independently, because `f0Center` (median of conversational speech)
sits near the bottom of a speaker's range, not its middle.

```
half = semitones >= 0 ? rangeUp : rangeDown
chao = clamp(3 + (semitones / half) * 2, 1, 5)
```

`rangeUp` is bounded to **[2, 10]** semitones (`RANGE_UP_SEMITONES_MIN`/`RANGE_SEMITONES_MAX`), `rangeDown` to **[2, 10]** (`RANGE_DOWN_SEMITONES_MIN`/`RANGE_SEMITONES_MAX`) — see `src/pitch/calibration.ts`. Both halves come from the calibration flow (§5.4), not a fixed default.

Chao 1–5 maps to the playable vertical band:

```
y(chao) = 0.80H - ((chao - 1) / 4) * 0.60H
```

### 5.2 Pitch detection pipeline

Analysis window 2048 samples, 1024-sample hop (~43Hz update rate, 50% overlap) — see `src/pitch/PitchTracker.ts` for the exact constants below.

1. **Band-limit the search** to reject most octave errors outright.
2. **Voicing gate:** `clarity >= 0.7` (not a stricter textbook 0.85 — NSDF clarity collapses exactly when pitch slews fastest), **plus a glide rescue**: a loud, pitch-continuous, recent frame counts as voiced even below the clarity threshold (`isFrameVoiced()`). Also requires `rms >= noiseFloor * 3`.
3. **Octave-jump correction** against the previous voiced f0.
4. **Median filter**, window of 5 frames.
5. **Slew clamp** on frame-to-frame semitone movement (~3.0 st/hop, tuned from a native speaker's fastest measured Tone 4 fall).
6. **Exponential smoothing**, `alpha = 0.85` on the scoring-relevant Y — high, not low, because median-5 and the slew clamp already de-jitter upstream; alpha is monotonic across the tuning range on lag, contour survival, and jitter, and 0.85 is strictly better than a conservative value on all three.

**Visual-only easing is a separate stage**: `tuning().easeTauMs` (default 35ms) eases the *drawn* dot in `run.ts`/`loop.ts`/`Visualiser.tsx` and never touches scoring data.

### 5.3 Unvoiced behaviour

- Grace period: hold the last Y for `tuning().graceMs` (120ms default; 250ms inside a Tone 3 gate — creak concentrates there).
- After grace: drift toward Chao 3 at `tuning().driftChaoPerSec` (default 5.33 chao/s).
- The bird never falls from gravity. Silence is not punished outside gates.

### 5.4 Calibration

Current flow (redesigned 29 Aug 2026 — see DECISIONS.md for the two prior flows this replaced):

1. Quiet capture → `noiseFloor`.
2. A short calibration tutorial flies real Tone 1 and Tone 3 gates.
3. The board's **upward** half is anchored off the player's own measured Tone 1 level from that tutorial; the **downward** half off their measured Tone 3 floor. Both are used directly (`reachToToneSpaceUp`/`Down` = 1, no claw-back) — these are actual tones the player produced, not a maximal reach that needs scaling down.
4. Live preview + confirmation before continuing.

Persisted to `localStorage` (the one exception to "no persistence" — a settings value, not game data).

## 6. Tone gate geometry

**A gate is built from a recorded word, not a hand-drawn tone-mark shape.** Corridor centrelines (`DEFAULT_POLYLINES` in `src/game/tuning.ts`) are measured from Jane's own citation-form takes (`fixtures/captures/jane_ma*.wav`), not drawn from the ˉˊˇˋ marks — real tones hold, then move fast, which a constant-rate ramp between the mark's endpoints cannot represent. Every one of the 120 shipped words gets its own polyline via `shapeForWord`, built from the same measurement the four fallback/tutorial shapes use (`templateContour`).

Approximate current fallback shapes (2–4 vertices, monotone-cubic spline between them, not straight segments):

| Tone | Shape |
|---|---|
| 1 | flat, ~4.58 (not textbook 5 — where she actually holds a level tone) |
| 2 | dips below its start (~3.0→~1.8), then climbs to 5 and holds |
| 3 | falls to the floor (~2.2→~1.2), a real sample partway up the rise, then holds the peak at 5 |
| 4 | reaches a peak early, falls to the floor (~1.2), holds |

Every contour completes before the gate ends and then holds its final chao — a speaker who finishes and sustains the note must not fly above a corridor still climbing underneath them.

**Corridor tolerance** starts at `tuning().baseToleranceH` (0.11 × canvas height) and tightens as difficulty ramps (floor 0.07H). It also **widens near each vertex** (`corridorToleranceAt`/`splineAt` in `gates.ts`) — a timing-forgiveness bump shaped through the same spline evaluator as the centreline, concentrated where a speaker's timing error costs the most (the end of a steep climb) and tapering to nothing over flat stretches.

**Collision** requires `tuning().collisionSustainMs` (200ms default) continuously outside the corridor; an unvoiced frame clears the timer rather than bridging two excursions.

**Gate duration is per-word/per-tone** (`tuning().gateDurationS`, currently `{1: 0.55, 2: 1.07, 3: 1.25, 4: 0.6}` seconds), built to equal each clip's own recorded length — except **T1 and T3 have since been tuned shorter than their clips** (a known, unresolved gap between demo length and gate length for those two tones — see CLAUDE.md's Known Limitations and DECISIONS.md). Gate width in px = `tuning().baseScrollSpeed * gateDurationS[tone]`.

**`scrollSpeed` is fixed** at `tuning().baseScrollSpeed` (200 px/s) — it does not increase with difficulty. Difficulty ramps by tightening corridor tolerance (×0.95 per 5 gates cleared, floor 0.07H) and shrinking the rest interval between gates (×0.95, floor `tuning().restMsFloor`). There is no player-selectable pace setting.

### Tone 3

Creaky voice destroys f0 tracking, and creak concentrates on Tone 3. Mitigations:

- Extended unvoiced grace inside a T3 gate (250ms vs. 120ms).
- 1.3× wider tolerance for T3.
- A gate is never scored a failure from signal loss alone. The test is **absolute utterance duration**, not voiced fraction: the longest voiced run in the gate, merging gaps under `tuning().mergeGapMs` (150ms default), must reach `tuning().minUtteranceMs` (160ms default) or the gate is neutral — "couldn't hear that," no points, no heart lost.
- Gates seed from up to `tuning().preGateBufferMs` (400ms) of pitch history when they open mid-syllable, so an utterance begun just before the gate opened is still claimed.

## 7. Scoring

Per gate, sampled every frame:

```
err_t    = |birdY_t - corridorCentreY_t| / tolerance_t
accuracy = clamp(1 - mean(err_t), 0, 1)   // over voiced frames only
```

| Accuracy | Rating | Points |
|---|---|---|
| ≥ 0.85 | Perfect | 300 |
| ≥ 0.60 | Good | 150 |
| cleared without collision | OK | 50 |
| wall collision | — | lose 1 heart, gate scores 0 |
| no voiced run ≥ `minUtteranceMs` | "Couldn't hear that" | 0, no heart lost |

**Combo:** consecutive Perfect/Good gates multiply score — ×1, ×1.5, ×2, ×3 (caps at ×3). Any OK, collision, or drastic mismatch resets it; an unheard gate is neutral and does not reset it.

**Hearts:** 3 per run.

**Tone classifier (`src/game/toneClassifier.ts`), layered on top of corridor scoring, not replacing it:**

- `isDrasticToneMismatch` — a confident classifier read of a drastically wrong tone (T1/T4 confused with anything, or a confident T2↔T3 mixup) forces a wall-style collision even if the pitch trace happened to sit inside the wrong corridor. On by default.
- `applyClassifierBoost` — a confident (≥0.9) read of the *correct* tone can raise a gate's accuracy past what corridor tracking alone earned, floored at the "good" threshold. On by default. Never resurrects a collision or an unheard gate.

Known gaps in both are documented in `docs/DECISIONS.md`.

**Game-over takeaway:** picks the worst-accuracy tone with enough scored gates, and prefers a mismatch-based phrasing ("Tone 3 gates are landing like Tone 2") when the classifier's misses on that tone are dominated by one specific wrong read.

## 8. Screens

Actual screen set (`src/app/GameApp.tsx`'s `Screen` type): `play` (title/home), `modes`, `howto`, `calibrate`, `finetune`, `tutorial`, `seeding`, `tutorialdone`, `game`, `drill`, `learn`, `gameover`, `settings`, `visualiser`, `progress`, `profile`, `lab` (dev only).

**Run modes** (`RunMode` in `src/game/run.ts`): `game` (the real run), `tutorial`, `single`, `drill` (practice one tone repeatedly), `learn`. Chosen from the `modes` screen.

- **Title/Play home** — Play, Modes, Calibrate, Settings, How to play, and tabs into Progress/Profile.
- **Calibration** — as in §5.4, plus a re-calibrate/forget path from Settings.
- **Settings** — voice (calibration read-back, re-calibrate, forget), tunnel width, motion preference, link into the visualiser.
- **Tone visualiser** — no gates, no scrolling, no score; x is time-since-utterance-began so repeated attempts overlay each other and the target contour, and the standalone tone classifier gives a live read of which tone a shape most resembles.
- **Tutorial run** — fixed short sequence, one tone type at a time, double tolerance, no hearts, no scoring, text cue per gate.
- **Drill** — repeated single-tone practice, picked from `modes`.
- **Game** — the scored run: hearts, combo, difficulty ramp.
- **Game over** — total score, best combo, per-tone accuracy breakdown, one-line takeaway (§7).
- **Progress** — lifetime run/gate/word counts and the last 5 runs' per-tone accuracy, from `runHistory.ts`. Device-local only.
- **Profile** — account-free profile surface backed by the same local stats; also where the daily free-run count (`dailyLimit.ts`) is visible.

### HUD (in-game)

- Target syllable in pinyin with tone mark + hanzi + tone number, shown as the gate approaches
- Score, combo multiplier, hearts
- Chao 1–5 grid as faint horizontal guide lines
- The bird's trail: its last `tuning().trailSeconds` (1.0s default) of movement, the player's actual pitch contour drawn live, against a faint dashed ghost of the corridor centreline inside a gate

## 9. Audio reference

**Source:** 120 words (30 per tone), recorded by Jane (native Taiwanese speaker) at `/record` and cut with `npm run make-clips`. Not a third-party corpus — no MSU Tone Perfect, no audio-cmn; those were early options, never shipped, and no code references them today. See CLAUDE.md's "clip inventory" section for the recording→corridor pipeline.

Reference audio plays before the gate arrives (call-and-response): hear it, then produce it. `src/audio/reference.ts` handles playback and falls back to a synthetic sweep through the player's own calibrated range if a clip fails to load/decode.

## 10. Edge cases

| Case | Behaviour |
|---|---|
| Mic permission denied | Friendly screen explaining the game is unplayable without it, with browser-specific re-enable instructions |
| No microphone present | Same screen, different copy |
| iOS Safari | `getUserMedia` and `AudioContext.resume()` both require a user gesture, behind an explicit "Tap to start." |
| `AudioWorklet` unsupported | Unsupported-browser message. Never silently falls back to `ScriptProcessorNode`. |
| Tab backgrounded / `visibilitychange` | Pauses immediately, suspends the AudioContext |
| Voice outside calibrated range | Clamps to Chao 1 or 5 |

## 11. Known limitations — state these in the product, not just here

1. **Humming beats it, partially.** No syllable verification, but the tone-mismatch classifier (§7) now catches some of the worst cross-tone cases — not a full fix, and it has its own documented gaps (DECISIONS.md).
2. **Isolated syllables only.** No connected speech, no sandhi.
3. **Tones aren't only pitch.** Duration and amplitude carry real cues the game doesn't measure.
4. **T1/T3 gate duration no longer matches their reference clip's length** (§6) — a known scoring/demo mismatch, not yet resolved.
5. **Vocal fatigue.** Runs are kept short by design.

## 12. Open questions

- Does the trail read better as a solid line, dots-per-frame, or a fading ribbon? (Unresolved — not re-verified since the original v1 build; check current `render/` before assuming either way.)
- Should T1/T3's gate duration be restored to match their clip length, and if so, how is T1's regressed scoring (the reason it was shortened) addressed instead?
- `public/ref/*.wav` is still git-tracked; the R2 migration proposed in `docs/flappytone-SPEC-r2-clip-storage.md`/`docs/R2_SETUP.md` hasn't happened. Worth doing before the repo grows further, or drop the proposal?
- The Progress/Profile/daily-limit feature (§3, §8) is a real retention/monetisation-adjacent surface the v1 non-goals didn't anticipate. Is a paid tier actually on the roadmap, or does `dailyLimit.ts` stay a soft nudge indefinitely?
- Taiwan vs Beijing reference audio: resolved in practice (Jane's own voice is the whole inventory now), but the original open question about *which* register to default new content to, if the inventory is ever extended with another speaker, is still open.
- Does anyone play it twice? Read this from PostHog now, not a local report script.
