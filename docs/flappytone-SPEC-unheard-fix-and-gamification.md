# FlappyTone — spec: fix the "couldn't hear that" bug, then gamify

**Date:** 4 Aug 2026
**Repo:** `~/repos/Pierrebuilds/FlappyTone`
**Status:** ready to hand to Claude Code via `/goal`

Two parts. **Part A is a bug fix and must land first** — it is small, and until it lands every judgement about how the game feels is measuring the bug rather than the game. Part B is a larger design session that assumes A is done.

---

## Context — what is already verified, and what is not

Verified, do not re-litigate:

- The pitch pipeline works well enough to build on. Band-limited MPM on a 1024-sample centre window, octave correction anchored to `f0Center`, clarity threshold 0.7, median-5 + exponential smoothing. Captures replay through `npm run report` with legible contours.
  - **Fixture quality, in descending order of trust:** `jane_*` (direct-mic native speaker, `f0Center` 168 — this is the ground truth, and it includes `jane_ma0_neutral` and both `jane_ma3` and `jane_ma3_natural`) → `pierre_*` (direct mic, non-native) → `chen_*` / `tan_*` (recorded speaker-into-mic; that round trip is a confound, per the repo's `CLAUDE.md`) → `fixtures/tone*.wav` (synthetic, proves nothing about real voices).
  - Still missing: `silence.wav` and `noise.wav`. Room-noise behaviour and the `rms >= noiseFloor * 3` voicing gate remain untested against a real room.
- The dot movement looks good in play. Smooth, responsive, legible. **Do not change `src/pitch/` in this work.**
- The mechanic itself is settled: continuous pitch drives the dot frame by frame. Not classify-then-move.

Not verified, and the subject of Part A:

- On a 35-second real device session (iPhone, Chrome, 4 Aug), **"couldn't hear that" fired on roughly half of all gates**: at t = 9, 10, 12, 15, 17, 20, 22, 28, 30 seconds. Score sat frozen at 150 from t≈12 to the end of the run. Hearts went 3 → 2 → run over.
- The player was speaking. The game was not registering it.

---

# PART A — the unheard-gate bug

## A1. Root cause: two candidates, both plausible, likely both real

### Candidate 1 — the voiced floor is a fraction of a window the voice cannot fill

`src/game/scoring.ts`:

```ts
export const UNHEARD_VOICED_FLOOR = 0.6;
...
const voicedFraction = samples.length === 0 ? 0 : voicedSamples.length / samples.length;
if (voicedFraction < UNHEARD_VOICED_FLOOR) {
  return { outcome: "unheard", accuracy: 0 };
}
```

A gate is 600ms of travel. This demands ≥360ms of confidently-voiced signal inside it. A Mandarin syllable in citation form runs ~400–500ms total, and the leading consonant carries no pitch — so the genuinely voiced portion is roughly 300–400ms. **A perfectly executed, perfectly timed attempt sits right on the threshold**, and anything less than perfect timing drops under it.

The rule was written to protect the player ("when unsure, say so rather than score you wrong"). It has become the thing that blocks them.

### Candidate 2 — the player speaks before the gate opens, and those samples are discarded

`Run.updateCue()` with `cueStyle: "pause"` sets `lead = 0`, so the cue fires when the gate's trailing edge reaches the right of the screen. The world then freezes for `cue.durationMs + CUE_PAUSE_HOLD_MS` (500ms).

When the world resumes, the gate still has to travel from screen-right to the bird at `BIRD_X_FRAC = 0.28` — i.e. **0.72 × canvas width** — before `syncActive()` makes it active. At base `scrollSpeed` that is well over a second of dead time after the demo ends.

`Run.tickAudio()` only pushes into `active.samples` when `this.active` is non-null. So a player who hears the example and answers straight away — the natural, call-and-response thing to do, and exactly what the "listen → your turn" design trains — has their entire utterance thrown away. Then the gate arrives, they are silent, and the gate scores `unheard`.

This is consistent with the recording, where the HUD read `listen…` in most sampled frames.

## A2. Instrument before fixing

Do not guess which candidate dominates. Add temporary instrumentation, get the number, then fix.

1. Add a dev-only counter to `src/dev/DevPanel.tsx` showing, per gate: sample count, voiced count, voiced fraction, and outcome.
2. Add a rolling log of the last 10 gates.
3. Log any voiced run of ≥150ms that occurs while `this.active === null` — this directly measures Candidate 2.

Play 20 gates on desktop. Report the numbers before changing behaviour.

## A3. The fix

Implement all three. They are independent and each is small.

**1. Give `GateSample` a timestamp.**

```ts
export interface GateSample {
  errChao: number;
  tolChao: number;
  voiced: boolean;
  atMs: number;   // NEW — host clock, from tickAudio's nowMs
}
```

Duration reasoning is currently impossible because samples carry no time. Audio frames arrive every ~23ms (1024-sample hop at 44.1kHz) but that is an assumption the scoring module should not have to make.

**2. Replace the fraction test with an absolute-duration test.**

The question is not "what proportion of the window was voiced" — it is "did the player produce an utterance long enough to judge". Replace `UNHEARD_VOICED_FLOOR` with:

```ts
/** A voiced run shorter than this is not an attempt — it is a cough or a click. */
export const MIN_UTTERANCE_MS = 180;
/** Voiced runs separated by less than this are one utterance (covers T3 creak). */
export const MERGE_GAP_MS = 120;
```

Find the longest voiced run in the gate's samples, merging gaps shorter than `MERGE_GAP_MS`. If that run is `< MIN_UTTERANCE_MS`, the gate is `unheard`. Otherwise score it.

`MERGE_GAP_MS` matters specifically for Tone 3: creaky voice drops out mid-syllable, and without merging, a legitimate T3 attempt looks like two short runs neither of which clears the floor. `src/dev/report.ts` already does exactly this segmentation — reuse the approach.

**3. Accept an utterance that starts before the gate opens.**

In `Run`, keep a short ring buffer of recent pitch samples (last ~400ms) even when `this.active` is null. When a gate becomes active in `syncActive()`, seed `active.samples` from that buffer — but only with samples belonging to a voiced run that is still ongoing at the moment the gate opens. A player mid-syllable when the gate arrives gets credit for the whole syllable.

Do **not** seed from arbitrary older voicing; that would let stray noise pre-fill a gate.

**Accuracy scoring itself is already correct** — `scoreGate` averages `errChao / tolChao` over voiced samples only. Do not change it.

## A4. Acceptance criteria for Part A

- [ ] All existing tests still pass (`npm run test`). State which snapshots moved and why.
- [ ] New unit tests in `scoring.test.ts`: a 200ms voiced run in a 600ms window scores rather than reporting `unheard`; a 100ms blip still reports `unheard`; two 120ms runs separated by an 80ms gap merge into one 320ms utterance and score.
- [ ] New test in `run.test.ts`: a voiced run beginning 200ms before gate activation is included in that gate's samples.
- [ ] `npm run report` on `fixtures/captures/*.wav` — confirm fit / lag / wiggle / voiced% are unchanged. **Part A must not touch the pitch pipeline.** If those numbers move, something is wrong.
- [ ] Manual: 20 gates on desktop with genuine attempts. Report the `unheard` rate before and after. Target is under 10%.

---

# PART B — turn the prototype into a game

Only start this once Part A is merged and the unheard rate is measured and low.

## B0. The framing that decides every trade-off in Part B

FlappyTone is a **portfolio and distribution asset**, not a revenue bet. That verdict came from real competitive research and it stands. So the test for every candidate change is:

> **Does this make a 15-second screen recording, with sound, more compelling to a stranger scrolling X?**

Trail beauty, gate legibility, the moment of a clean pass, the feel of the dot — yes. Progression systems, unlocks, level select, achievements, more syllables, a shop — no. Nobody sees those in a clip and nobody who plays once reaches them.

If a proposed change does not show up in the clip, it is out of scope.

## B1. Make the player's dot the hero

Currently in `src/render/scene.ts`:

```ts
if (voiced) { ctx.fillStyle = "#60cdff"; ctx.fill(); }
else { ctx.strokeStyle = "rgba(96, 205, 255, 0.45)"; ctx.lineWidth = 2; ctx.stroke(); }
```

So whenever the player is not actively producing pitch, their avatar is a thin ring at 45% opacity. In the recorded session that was most of the time — and meanwhile `drawCueDemo` renders the *demo* dot as solid `rgba(255, 210, 130, …)`.

**The most visually prominent moving object on screen is the computer showing you what to do, not you.** For a game whose entire hook is "your voice is the controller", that is backwards.

Required:

- The player's dot is always the brightest, largest, most alive object on screen. Give it a glow, a soft outer halo, or a subtle idle pulse when unvoiced — it should read as *waiting*, not as *absent*.
- Demote the demo dot to a ghost: dimmer, smaller, clearly secondary.
- Keep the voiced/unvoiced distinction — it carries real information — but express it as a change in intensity, not presence versus near-absence.

## B2. Raise contrast so the tunnel reads instantly

The scene is `#111318` background with corridor walls in near-black hatching. In extracted frames it is genuinely hard to tell which region is passable. On a phone outdoors it would be unreadable.

- Make the wall unmistakably a wall and the corridor unmistakably open. Consider inverting the current emphasis: light corridor, dark wall.
- The dashed ghost centreline should stay visibly *inside* the corridor and read as guidance, not as another obstacle.
- Keep the Chao 1–5 grid but make it recede further than it does now.
- Check the result at phone brightness in daylight, not just on a laptop.

## B3. Fix the pacing

Two separate problems that share a fix.

**Too many gates on screen.** Extracted frames consistently show 2–3 gates plus one entering. `BASE_REST_MS = 900` shrinking to `REST_MS_FLOOR = 600` is too tight given how much screen the gates occupy. Widen the rest interval and reduce visual density so exactly one gate is the obvious current target.

**The listen phase eats the session.** With `cueStyle: "pause"`, the world freezes for the cue plus `CUE_PAUSE_HOLD_MS = 500`, then the gate travels 0.72 × width before it is active. The player spends more time watching than playing.

Close that gap. Either fire the cue later so the gate arrives soon after the demo ends, or shorten the post-demo hold, or let the world resume faster. **The "your turn" moment must be unmistakable and must be immediately followed by the gate** — a call-and-response beat, like a rhythm game. Right now the response window opens a beat and a half after the call.

## B4. Give every gate outcome a felt reaction

`drawOutcomeFlash` exists but caps at 0.5 alpha on a radial gradient over 800ms — in the recording it is invisible. Feedback should be impossible to miss:

- **Perfect** — the dot flares, the corridor lights up along the path just flown, a short rising chime, points fly.
- **Good** — a smaller version of the same.
- **Collision** — screen shake, red flash, the dot recoils, a heart visibly breaks.
- **Couldn't hear that** — friendly and clearly *not* a failure: dot dims, a soft "say it a bit louder" prompt. Must never feel like a punishment. This is the trust-preserving path and it needs to look like one.

Add sound. A voice game with no audio feedback is missing an obvious channel, and the clip will be posted with sound on.

## B5. Make the trail beautiful

The trail is the product — it is the player's own pitch contour drawn live, and it is the single most interesting thing in any clip.

- Draw it as a continuous, smoothly fitted ribbon rather than discrete dots. Fit a curve through recent points; still their data, drawn kindly.
- Taper width and opacity with age.
- Consider colouring by how close to the corridor centre it is at each point — so the trail itself shows where they drifted, without any text.
- Keep it honest. Never idealise or snap it. It must remain what the player actually did.

## B6. Reclaim vertical space on mobile

In the recording, Chrome's URL bar, its bottom nav, and the persistent "Microphone access allowed" chip consume roughly a fifth of the screen. Investigate a web-app manifest and `display: standalone` so an added-to-home-screen install runs without browser chrome, and make the canvas layout resilient to the URL bar collapsing on scroll.

## B7. Explicitly out of scope

Do not build: levels or a level select, unlocks, achievements, daily streaks, accounts, leaderboards, a backend, extra syllables beyond the current set, speech recognition or syllable verification, tone sandhi or connected speech, or monetisation.

Do not touch `src/pitch/`.

---

## Verification protocol — for both parts

**You cannot hear.** Do not claim any audio behaviour works from reading code.

- Any change under `src/game/` or `src/pitch/` requires `npm run test` green plus a before/after `npm run report` comparison. State which of fit / lag / wiggle / voiced% moved, **including the ones that got worse**.
- Use every file in `fixtures/captures/` for regression, but weight conclusions by fixture quality: **`jane_*` is the primary ground truth** (direct-mic native speaker); `pierre_*` is direct-mic but non-native; `chen_*` / `tan_*` carry a speaker-into-mic round-trip confound; the synthetic `fixtures/tone*.wav` prove nothing about real voices.
- `jane_ma3` vs `jane_ma3_natural` is the pair that matters most for the `MERGE_GAP_MS` value in A3 — textbook versus naturally-produced Tone 3 is exactly where creak dropouts appear. Tune the merge gap against those two files, not against a guess.
- For render changes, produce before/after screenshots and describe what changed.
- Part A ends with a measured unheard-rate number, not an impression.
- One vertical slice per commit. Each slice ends runnable and committed.

## Suggested order

1. A2 instrumentation → report the numbers
2. A3 fix → A4 acceptance
3. B1 + B2 (visual hierarchy and contrast — biggest visible gain per hour)
4. B4 (feedback and sound)
5. B3 (pacing)
6. B5 (trail)
7. B6 (mobile chrome) if time remains
