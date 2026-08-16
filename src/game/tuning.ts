/**
 * Live-tunable game constants.
 *
 * Every number the dev Lab can move lives here rather than as a module
 * constant, so a tuning session does not need an edit-save-reload cycle and a
 * run can be re-tuned while it is being flown. The defaults are exactly the
 * values that were previously hard-coded, and production never calls
 * `setTuning`, so nothing changes for a player until a default below is edited.
 *
 * Pure: no Web Audio, no React, no canvas. The modules that used to own these
 * constants still export them, at their default values, so tests and docs keep
 * their names — but runtime code reads `tuning()`.
 */

import type { Tone } from "./gates.ts";

/** A corridor centreline: (t, chao) control points, ascending in t over [0,1]. */
export type Polyline = Array<[number, number]>;

/**
 * Corridor centrelines as (t, chao) control points, measured from a native
 * speaker's citation takes in `fixtures/captures/jane_ma*.wav`.
 *
 * These are now read off the *shipped reference clips* — `npm run
 * make-ref-clips` cuts `public/ref/ma{1-4}.wav` from those same captures and
 * prints the contour over each clip's own timeline, which is the timeline the
 * demo dot sweeps. Example and target therefore agree by construction: the
 * player hears a contour, watches the dot trace that contour, and is scored
 * against it. Before this they were three different things.
 *
 * `t` is normalised over `GATE_DURATION_S[tone]`, which equals the clip length,
 * so a control point at t=0.3 is 30% of the way through what the player heard.
 *
 * Every contour completes before t=1 and then holds its final chao. That tail
 * is load-bearing: a speaker who finishes a rise and sustains the note was
 * otherwise left above a corridor still climbing underneath her. The clips'
 * own trailing release (T2 falls back to ~3.0 after its peak) is deliberately
 * *not* modelled — releasing is not part of the tone, and scoring it would
 * punish holding.
 *
 * Editable from the dev Lab's shapes tab, which is how "some of them look a
 * bit funky" gets answered with a change rather than an argument. Whatever the
 * corridor is, the demo dot sweeps the same function, so example and target
 * cannot drift apart.
 *
 * These replaced the PRD §6 table, which was drawn from the shapes of the tone
 * *marks* rather than from speech. Real tones are not constant-rate ramps: they
 * hold, then move fast. Her T4 sits at the top for ~60% of the syllable and
 * then drops in ~170ms; the PRD's linear 5→1 glide across the whole gate asked
 * her to fall at roughly 17 st/s when she actually falls at ~95 st/s (the same
 * figure the slew clamp in PitchTracker.ts is set from). No tone she produced
 * could fit that corridor, and a run of 22 gates bore it out — she cleared 90%
 * of T1, the only corridor that demands no particular rate, and 8% of the rest.
 *
 * Caveat on the evidence: one speaker, one syllable (`ma`), citation register.
 * That is thin, and it is still a large improvement on a hand-drawn diagram.
 * Widen it with more speakers and syllables before treating these as settled.
 *
 * Fixed at a 2/3/4/3-vertex template per tone, printed by `npm run
 * make-ref-clips` via `templateContour` — the same function every recorded
 * word's own polyline goes through, so the tutorial/fallback shapes and the
 * 120-word inventory are built by one rule. `corridorChaoAt` then interpolates
 * these with a smooth (monotone cubic) spline, not straight segments — see
 * its doc comment in gates.ts.
 */
export const DEFAULT_POLYLINES: Record<Tone, Polyline> = {
  // Flat, and at 4.58 rather than a textbook 5 — that is where she actually
  // holds a high level tone.
  1: [
    [0, 4.584],
    [1, 4.584],
  ],
  // Dips well below its start before climbing, and holds the peak it reaches
  // rather than the release that follows it.
  2: [
    [0, 2.989],
    [0.2788, 1.832],
    [1, 5],
  ],
  // Falls to the floor, then a real sample partway up the rise, then holds
  // the peak — the low dip is the part a two-segment polyline had no room for.
  3: [
    [0, 2.234],
    [0.5465, 1.185],
    [0.7715, 2.751],
    [1, 5],
  ],
  // Reaches a peak early, then falls to the floor and holds it.
  4: [
    [0, 4.7],
    [0.6024, 5],
    [1, 1.213],
  ],
};


export interface Tuning {
  // ---- pacing
  /** Base world scroll speed in px/s before ramp (PRD §6). */
  baseScrollSpeed: number;
  /** Base corridor half-height as a fraction of canvas height. */
  baseToleranceH: number;
  /** Rest interval between gates at the start of a run, in ms. */
  baseRestMs: number;
  /** Floor the difficulty ramp may shrink `baseRestMs` to. */
  restMsFloor: number;
  /**
   * Still beat after the demo trace, before the world resumes.
   *
   * This is the player's preparation window: the dot has stopped, the corridor
   * has not moved, and nothing is being scored yet. Raised from 450ms once the
   * inventory became 120 words — a one-syllable game only ever asked for `ma`,
   * and some of these words need a moment to get the mouth ready for before
   * the tone starts.
   *
   * Deliberately this knob rather than `cueApproachMs`: that one buys the same
   * time by firing the cue further out, which also pushes the corridor further
   * right while the demo is drawn over it. At 700ms the gate's start already
   * sits ~154px ahead of the dot on a 420px canvas, so a long word's trace runs
   * off the edge. The freeze costs nothing on screen.
   */
  cuePauseHoldMs: number;
  /**
   * The bird's fixed horizontal position, as a fraction of canvas width.
   *
   * This is half of the call-and-response beat, and the cheap half. The gap
   * between the demo ending and the corridor arriving is `cueApproachMs` of
   * travel, and buying more of it by firing the cue earlier also pushes the
   * gate rightward on screen until a long word's corridor runs off the edge.
   * Moving the bird left buys the same runway without moving the gate: the
   * corridor is drawn at its real position either way, so the space has to
   * come from somewhere, and the left of the screen is holding a trail that is
   * already clipped.
   *
   * Costs trail: at 165px/s the last 1.5s is 248px against the ~76px to the
   * left of the bird here, so the trace was being cut off long before this
   * moved. What is left is the recent part, which is the part being compared
   * to the corridor.
   */
  birdXFrac: number;
  /**
   * How much travel is left between the end of the freeze
   * and the corridor reaching the bird. This is the call-and-response beat —
   * see spec B3. 0 means the gate arrives the instant the world resumes.
   */
  cueApproachMs: number;

  // ---- judging
  /** Continuous ms outside the corridor before it counts as a wall. */
  collisionSustainMs: number;
  /** How far out of step with the corridor a correct attempt may be. */
  timingSlackS: number;
  /** Cap on timing widening, as a multiple of the gate's base tolerance. */
  maxTimingWidenFactor: number;
  /**
   * Blur radius, in seconds of gate time, over the timing widening.
   *
   * The widening is a max over a window and is therefore cuspy; the renderer
   * draws it, so each cusp was a spike on the corridor wall. Applied after the
   * max, so it can only round a peak, never open the corridor wider than the
   * max found. 0 restores the old, peaky walls exactly.
   */
  slackSmoothS: number;
  /** How far back a gate reaches for an utterance begun before it opened. */
  preGateBufferMs: number;
  /** A voiced run shorter than this is not an attempt. */
  minUtteranceMs: number;
  /** Voiced runs separated by less than this are one utterance. */
  mergeGapMs: number;

  // ---- dot dynamics
  /** Hold the last position for this long after voicing stops. */
  graceMs: number;
  /** The longer grace inside a T3 gate, where creak drops the signal. */
  t3GraceMs: number;
  /** Render easing time constant for the drawn dot. Visual only. */
  easeTauMs: number;
  /** Drift rate toward the rest line once grace has run out. */
  driftChaoPerSec: number;
  /** Seconds of movement kept in the trail. */
  trailSeconds: number;

  /**
   * Per-tone gate length in seconds.
   *
   * These started as the shipped reference clips' own lengths, so that the
   * demo, the corridor and the scorer all ran on one clock. T1 and T3 no
   * longer match their clip (0.55 against an 880ms `ma1.wav`, 1.25 against
   * 1.33s) — tuned down from play, where T1 was the worst-scoring tone
   * precisely because it asked for a note longer than the flat part of one.
   * The demo still sweeps over the *clip's* length, so for T1 the example
   * currently shows a longer hold than the gate scores. See make-ref-clips.
   */
  gateDurationS: Record<Tone, number>;
  /** Per-tone corridor centreline. See DEFAULT_POLYLINES. */
  polylines: Record<Tone, Polyline>;
}

export const DEFAULT_TUNING: Readonly<Tuning> = Object.freeze({
  baseScrollSpeed: 200,
  baseToleranceH: 0.11,
  // These absorb the old default pace's (relaxed, ×2.0) multiplier now that
  // pace is gone (16 Aug 2026 removal) — was 1200/600 before scaling, so
  // removing the multiplier doesn't silently halve breathing room in play.
  baseRestMs: 2400,
  restMsFloor: 1200,
  cuePauseHoldMs: 800,
  birdXFrac: 0.13,
  cueApproachMs: 825,
  collisionSustainMs: 200,
  timingSlackS: 0.11,
  maxTimingWidenFactor: 1.5,
  slackSmoothS: 0.15,
  preGateBufferMs: 400,
  minUtteranceMs: 160,
  mergeGapMs: 150,
  graceMs: 120,
  t3GraceMs: 250,
  easeTauMs: 35,
  driftChaoPerSec: 5.33,
  trailSeconds: 1.0,
  gateDurationS: Object.freeze({ 1: 0.55, 2: 1.07, 3: 1.25, 4: 0.6 }),
  polylines: DEFAULT_POLYLINES,
}) as Readonly<Tuning>;

function clonePolylines(p: Record<Tone, Polyline>): Record<Tone, Polyline> {
  return {
    1: p[1].map((pt) => [...pt] as [number, number]),
    2: p[2].map((pt) => [...pt] as [number, number]),
    3: p[3].map((pt) => [...pt] as [number, number]),
    4: p[4].map((pt) => [...pt] as [number, number]),
  };
}

function clone(t: Readonly<Tuning>): Tuning {
  return {
    ...t,
    gateDurationS: { ...t.gateDurationS },
    polylines: clonePolylines(t.polylines),
  };
}

let current: Tuning = clone(DEFAULT_TUNING);

/** The values in force right now. Read this per use — never cache it. */
export function tuning(): Readonly<Tuning> {
  return current;
}

/** Patches one or more values. Dev only; nothing in the player-facing app calls this. */
export function setTuning(patch: Partial<Tuning>): void {
  current = {
    ...current,
    ...patch,
    gateDurationS: { ...current.gateDurationS, ...(patch.gateDurationS ?? {}) },
    polylines: { ...current.polylines, ...(patch.polylines ?? {}) },
  };
}

export function resetTuning(): void {
  current = clone(DEFAULT_TUNING);
}
