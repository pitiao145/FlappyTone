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

export interface Tuning {
  // ---- pacing
  /** Base world scroll speed in px/s before pace and ramp (PRD §6). */
  baseScrollSpeed: number;
  /** Base corridor half-height as a fraction of canvas height. */
  baseToleranceH: number;
  /** Rest interval between gates at the start of a run, in ms. */
  baseRestMs: number;
  /** Floor the difficulty ramp may shrink `baseRestMs` to. */
  restMsFloor: number;
  /** "flow" cue style: how long before the gate enters the screen the cue fires. */
  cueLeadMs: number;
  /** "pause" cue style: still beat after the demo trace before the world resumes. */
  cuePauseHoldMs: number;
  /**
   * "pause" cue style: how much travel is left between the end of the freeze
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

  /** Per-tone gate length in seconds — the shipped reference clips' lengths. */
  gateDurationS: Record<Tone, number>;
}

export const DEFAULT_TUNING: Readonly<Tuning> = Object.freeze({
  baseScrollSpeed: 220,
  baseToleranceH: 0.12,
  baseRestMs: 900,
  restMsFloor: 600,
  cueLeadMs: 300,
  cuePauseHoldMs: 500,
  cueApproachMs: 0,
  collisionSustainMs: 120,
  timingSlackS: 0.09,
  maxTimingWidenFactor: 1.5,
  preGateBufferMs: 400,
  minUtteranceMs: 180,
  mergeGapMs: 120,
  graceMs: 120,
  t3GraceMs: 250,
  easeTauMs: 45,
  driftChaoPerSec: 5.33,
  trailSeconds: 1.0,
  gateDurationS: Object.freeze({ 1: 0.88, 2: 1.07, 3: 1.33, 4: 0.6 }),
}) as Readonly<Tuning>;

function clone(t: Readonly<Tuning>): Tuning {
  return { ...t, gateDurationS: { ...t.gateDurationS } };
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
  };
}

export function resetTuning(): void {
  current = clone(DEFAULT_TUNING);
}
