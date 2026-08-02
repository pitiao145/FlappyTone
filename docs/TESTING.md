# TESTING.md — how to verify a pitch pipeline without ears

The core feature of this app is inaudible to a coding agent and invisible in a screenshot. This document turns it into something testable.

The principle: **`src/pitch/` is a pure function from audio frames to a Chao contour.** If you can feed it a recorded WAV offline, you can test it exactly as rigorously as any other code — no browser, no microphone, no vibes.

---

## 1. Recording the fixtures

Record these yourself, once, before writing pipeline code. **Use the same microphone you'll actually play the game with** — a laptop mic and a headset produce very different signals, and tuning against the wrong one is wasted work.

**Format:** mono WAV, 44.1 kHz, 16-bit. Quiet room. Normal speaking volume, ~20cm from the mic. Trim to the utterance plus ~200ms of silence either side.

### Required

| File | Content | Why |
|---|---|---|
| `ma1.wav` | `mā` (high level), single clean utterance | T1 baseline |
| `ma2.wav` | `má` (rising) | T2 baseline — the rise is what smoothing tends to flatten |
| `ma3.wav` | `mǎ` (dipping), citation form, fully drawn out | T3 baseline |
| `ma4.wav` | `mà` (falling) | T4 baseline |
| `ma3_creaky.wav` | `mǎ` produced with deliberate creak on the low portion | **The critical failure case.** Must trigger "couldn't hear that", not a wrong score. |
| `sequence.wav` | `mā má mǎ mà` with ~1s gaps | Tests segmentation and recovery between utterances |
| `silence.wav` | 5s of room tone | Must produce zero voiced frames |
| `noise.wav` | 5s of background noise — fan, traffic, a TV | Must produce <5% voiced frames |
| `hum.wav` | 3s of flat humming | Documents the known v1 hole; asserts it *does* register (we're not pretending otherwise) |

### Strongly recommended

| File | Content | Why |
|---|---|---|
| `native_ma1..4.wav` | The four tones from a native speaker | Your ground truth. If the pipeline fails these, the pipeline is wrong. |
| `female_ma1..4.wav` | The four tones from a higher-pitched voice | The single best test of speaker normalisation. A 120Hz and a 250Hz voice must land on the same Chao values. |
| `fast_ma2.wav` | `má` at conversational speed, not citation speed | Real speech is much faster than drill speech |
| `mobile_ma1.wav` | `mā` recorded on a phone in a normal room | The actual deployment condition |

Commit them. They're small and they're the most valuable artifact in the repo.

---

## 2. `npm run analyze` — giving the agent something to look at

Build this in the first slice. It is the highest-leverage 40 lines in the project.

```bash
npm run analyze fixtures/ma2.wav
```

Decodes the WAV, runs it through `src/pitch/` with the exact same code path the browser uses, and prints:

```
fixtures/ma2.wav   1.14s   f0Center 118Hz   RANGE 5st

chao 5 |                        ▁▃▅███
     4 |                  ▂▄▆███
     3 |        ▃▅▇██
     2 |   ▁▂
     1 |
       +------------------------------------
        0ms                            1140ms

voiced   87%  (49/56 frames)
clarity  mean 0.91  min 0.71
chao     start 2.3  end 4.9  delta +2.6
verdict  RISING
```

A coding agent can read that. It cannot read a waveform. This closes the loop — the agent changes a smoothing constant, runs `analyze`, and sees whether the rise survived.

Add `--raw` to dump per-frame `f0, clarity, rms, voiced, chao` as CSV for deeper debugging.

---

## 3. The fixture tests

`src/pitch/__tests__/fixtures.test.ts`, run under Vitest.

### Shape assertions

Compare the first and last quartile of voiced frames, so the assertions are robust to exact timing.

| Fixture | Assertion |
|---|---|
| `ma1` | ≥80% voiced · stddev of chao < 0.5 · mean chao ≥ 4.0 |
| `ma2` | ≥80% voiced · `chao(Q4) - chao(Q1) ≥ 1.2` · no frame more than 0.8 below the running max after the midpoint |
| `ma3` | ≥50% voiced (relaxed — creak) · min chao occurs in the middle 60% · `chao(end) - chao(min) ≥ 1.0` |
| `ma4` | ≥80% voiced · `chao(Q1) - chao(Q4) ≥ 2.0` |
| `ma3_creaky` | **voiced fraction < 60% → the "couldn't hear that" path fires.** Assert the pipeline reports low confidence rather than emitting a confident wrong contour. |
| `silence` | 0 voiced frames |
| `noise` | <5% voiced frames |
| `female_ma1..4` | Same shape assertions as `ma1..4` after calibration to that speaker's `f0Center`. **Chao values must land within ±0.5 of the male equivalents.** |

### Unit tests, no fixtures needed

- **Octave-jump correction** — synthesise a 120Hz sine, splice in three frames of 240Hz, assert the corrector snaps them back.
- **Hz → semitone → Chao** — round-trip and boundary cases: `f0 === f0Center` → chao 3; `+5st` → chao 5; `+8st` → clamped to 5.
- **Voicing gate** — assert `clarity 0.9 / rms below floor` reads unvoiced, and `clarity 0.5 / rms high` reads unvoiced.
- **Unvoiced grace** — 100ms of silence holds Y; 300ms starts the drift toward Chao 3; inside a T3 gate the grace extends to 250ms.

### Golden snapshots

For each fixture, snapshot the resulting chao series (rounded to 1dp) to `__snapshots__/`.

These will fail whenever you tune the smoothing alpha or clarity threshold — **that's the point.** The workflow is: change the constant → snapshots fail → read the diff → decide whether the new shape is better. Without this you'll tune blind and silently break Tone 2 while fixing Tone 3.

Rule for the agent: never update a snapshot without showing the before/after contour from `npm run analyze` and saying which one is more correct and why.

---

## 4. The capture → report tuning loop

The dot's behaviour on *real* voices (through the real acoustic path: speaker →
room → laptop mic) is tuned with three dev tools built for the purpose:

1. **Phone soundboard** — `https://<laptop-ip>:5173/?soundboard` on a phone.
   Tiles for every native clip in `public/clips/` (fetched by
   `npm run fetch-clips` from audio-cmn, CC-BY-SA; speakers `chen` male,
   `tan` female). Point the phone at the laptop mic and tap.
2. **Capture screen** — laptop, Title → `dev` → `capture`. Record while a clip
   plays; Stop downloads `<name>.wav` + `<name>.telemetry.json`. Naming:
   `<speaker>_<syllable><tone>[_note]` (e.g. `chen_ma3`, `pierre_ma2_fast`) —
   the trailing digit tells the report CLI which contour to score against.
   Move WAVs into `fixtures/captures/` and commit them.
3. **Report CLI** — `npm run report [files...] [--set alpha=0.6,clarity=0.8]...
   [--json out.json] [--f0 hz]`. Defaults to all of `fixtures/captures/*.wav`.
   Replays each file through `PitchTracker` per parameter set and prints, per
   auto-segmented utterance: **fit** (rmse vs the tone's ideal contour, chao),
   **lag** (smoothing delay in ms), **wiggle** (excess shake), **voiced%**,
   **maxDrop**, plus an ASCII overlay of raw (·), smoothed/dot (o) and ideal
   (-). `--json` dumps full frame series for machine reading. Per-speaker
   `f0Center` goes in `fixtures/captures/speakers.json` (`{"pierre": 118}`);
   measure it with `npm run analyze` (median voiced f0 of a tone-1 capture).

Tuning workflow: capture once → `npm run report --set ... --set ...` → pick the
winner on the numbers → update `DEFAULT_CONFIG` → re-run fixture tests and
report which goldens moved. To *feel* a candidate, use the Capture screen's
"replay a WAV into the game" input: the game runs with the recording standing
in for the mic, identical input every time.

---

## 5. What still needs a human

The fixture tests cover the pipeline. They do not cover *feel*. These require Pierre with a microphone:

- Does the bird respond fast enough to feel like a controller rather than a laggy remote?
- Does the trail read as a clean, legible contour or as a nervous scribble?
- Is a run exhausting? (Vocal fatigue inside 3 minutes means runs are too long.)
- iOS Safari, on a real device: does the gesture-gated audio flow actually start?

When reporting a feel problem, use the dev panel numbers, not adjectives. "Clarity drops to 0.4 during the T3 dip and the bird freezes for ~400ms" is actionable. "Tone 3 feels bad" is not.
