/**
 * Gate geometry, tolerance, and difficulty ramp — pure game logic.
 * No Web Audio, no React, no canvas. See docs/PRD.md §6.
 */

import { tuning } from "./tuning.ts";

export type Tone = 1 | 2 | 3 | 4;

export const TONE_INFO: Record<
  Tone,
  { pinyin: string; hanzi: string; cue: string }
> = {
  1: { pinyin: "mā", hanzi: "妈", cue: "say it flat and high" },
  2: { pinyin: "má", hanzi: "麻", cue: "start mid, slide up" },
  3: { pinyin: "mǎ", hanzi: "马", cue: "dip low, then rise" },
  4: { pinyin: "mà", hanzi: "骂", cue: "drop sharply top to bottom" },
};

/**
 * How long each tone's gate takes to cross, in seconds. PRD §14 asked "is 600ms
 * the right gate width, or does it need to flex per tone?" — it does.
 *
 * **These are the shipped reference clips' own lengths**, printed by
 * `npm run make-ref-clips`. The player hears a syllable, then flies a corridor
 * that lasts exactly as long: call and response with the same clock on both
 * halves. Any other number makes the demo teach a tempo the gate refuses,
 * which is the failure this project has now hit twice.
 *
 * Invariant to the difficulty ramp: gate width is `scrollSpeed * duration`, so
 * a faster world scrolls past more quickly but never demands a faster tone.
 */
export const GATE_DURATION_S: Record<Tone, number> = {
  1: 0.88,
  2: 1.07,
  3: 1.33,
  4: 0.6,
};

/** Live gate length — the Lab can move these; the constant above is the default. */
export function gateDurationS(tone: Tone): number {
  return tuning().gateDurationS[tone];
}

/** Piecewise-linear interpolation of a tone's corridor centreline. t is clamped to [0,1]. */
export function corridorChaoAt(tone: Tone, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const points = tuning().polylines[tone];
  for (let i = 0; i < points.length - 1; i++) {
    const [t0, chao0] = points[i];
    const [t1, chao1] = points[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const frac = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
      return chao0 + frac * (chao1 - chao0);
    }
  }
  return points[points.length - 1][1];
}

/**
 * Per-tone tolerance widening, applied where the *signal* is least reliable —
 * not where the tone is hardest to say.
 *
 * T3 ×1.3 is the PRD §6 creak mitigation. T2 ×1.15 is the same argument from
 * the same cause: NSDF clarity collapses when pitch slews fastest (PRD §5.2),
 * and T2's rise is the longest sustained slew of any tone. It shows up in play
 * as the lowest voiced fraction of the four — 22–50% across six T2 gates
 * against 51–80% on T1 in the same run.
 */
const TOLERANCE_FACTOR: Record<Tone, number> = { 1: 1, 2: 1.15, 3: 1.3, 4: 1 };

/**
 * Converts a corridor tolerance in screen-height fraction to chao units.
 * 0.60H spans 4 chao, so tolChao = baseTolH / 0.60 * 4.
 */
export function toleranceChao(tone: Tone, baseTolH: number): number {
  return (baseTolH / 0.6) * 4 * TOLERANCE_FACTOR[tone];
}

/**
 * How far out of step with the corridor a correct attempt is allowed to be.
 *
 * A single tolerance for the whole gate charges wildly different amounts for
 * the same timing error, because what being late *costs* depends on how fast
 * the corridor is moving underneath you. Measured against the shipped
 * contours, 100ms of timing error is worth:
 *
 * | tone | max slope   | vertical cost | tolerance |
 * |------|-------------|---------------|-----------|
 * | 1    |  0 chao/s   | 0.00          | 0.80      |
 * | 2    |  5.9 chao/s | 0.59          | 0.92      |
 * | 3    | 10.2 chao/s | 1.02          | 1.04      |
 * | 4    | 22.3 chao/s | 2.23          | 0.80      |
 *
 * So a T4 that is 100ms off collides whatever its shape — the error is 2.8×
 * the whole corridor — and a T3 that is 100ms off sits exactly on the wall.
 * Reported in play as "I did the shape right but started slightly early", and
 * unfixable with the wide-tunnel setting, which scales the whole corridor
 * while the problem lives in the steep fifth of it.
 */
export const TIMING_SLACK_S = 0.09;
/**
 * Ceiling on the widening, as a multiple of the gate's base tolerance. The T4
 * cliff falls further inside the slack window than the entire corridor is
 * wide, so without a cap its wall would effectively disappear.
 */
export const MAX_TIMING_WIDEN_FACTOR = 1.5;
/** Offsets sampled either side of t when measuring the corridor's travel. */
const SLACK_STEPS = 6;

/**
 * Corridor half-height at `t`, widened by however far the centreline travels
 * within TIMING_SLACK_S either side.
 *
 * Expressed as the corridor's own movement rather than as slope × slack
 * because that is the quantity being forgiven, and it stays exact at the
 * polyline's vertices and plateaus, where a slope is discontinuous or zero.
 *
 * Flat stretches — all of T1, the T4 plateau, the T3 floor — widen by nothing,
 * so the game stays exactly as strict about *pitch*. Only the moving parts,
 * where no speaker can be sample-accurate, open up. And because the renderer
 * draws the same function, the corridor visibly flares where it forgives:
 * this is something the player can see, not a hidden fudge factor.
 */
export function corridorToleranceAt(
  tone: Tone,
  t: number,
  baseTolChao: number,
): number {
  const dtNorm = tuning().timingSlackS / gateDurationS(tone);
  const here = corridorChaoAt(tone, t);
  let travel = 0;
  for (let i = 1; i <= SLACK_STEPS; i++) {
    const offset = (i / SLACK_STEPS) * dtNorm;
    travel = Math.max(
      travel,
      Math.abs(corridorChaoAt(tone, t + offset) - here),
      Math.abs(corridorChaoAt(tone, t - offset) - here),
    );
  }
  return (
    baseTolChao +
    Math.min(travel, baseTolChao * tuning().maxTimingWidenFactor)
  );
}

export interface Gate {
  tone: Tone;
  xStart: number;
  widthPx: number;
  tolChao: number;
}

export interface Difficulty {
  scrollSpeed: number;
  toleranceH: number;
  restMs: number;
}

const SPEED_CAP_FACTOR = 2.2;
const TOLERANCE_FLOOR = 0.07;

/** The PRD's base difficulty values (§6), as currently tuned. */
export function newDifficulty(): Difficulty {
  const t = tuning();
  return {
    scrollSpeed: t.baseScrollSpeed,
    toleranceH: t.baseToleranceH,
    restMs: t.baseRestMs,
  };
}

/**
 * Player-selectable pacing. "fast" is the PRD §6 baseline; the slower paces
 * scale scroll speed down and stretch the rest interval between gates.
 * Gate duration is unaffected (width is derived from scroll speed), so a
 * syllable is always ~600ms — pace only changes how much breathing room
 * sits between gates and how quickly the world moves.
 */
export type Pace = "relaxed" | "normal" | "fast";

export const PACES: Pace[] = ["relaxed", "normal", "fast"];

const PACE_FACTORS: Record<Pace, { speed: number; rest: number }> = {
  relaxed: { speed: 0.75, rest: 2.0 },
  normal: { speed: 0.9, rest: 1.5 },
  fast: { speed: 1.0, rest: 1.0 },
};

/** Scales a (possibly ramped) difficulty by the chosen pace. */
export function applyPace(d: Difficulty, pace: Pace): Difficulty {
  const f = PACE_FACTORS[pace];
  return {
    scrollSpeed: d.scrollSpeed * f.speed,
    toleranceH: d.toleranceH,
    restMs: d.restMs * f.rest,
  };
}

/**
 * Player-selectable corridor width. Scales the tolerance (tunnel half-height)
 * only — speed and rest are the pace's job. Applied after the ramp, so the
 * ramp's tolerance floor scales proportionally too.
 */
export type CorridorWidth = "narrow" | "normal" | "wide";

export const CORRIDOR_WIDTHS: CorridorWidth[] = ["narrow", "normal", "wide"];

const CORRIDOR_WIDTH_FACTORS: Record<CorridorWidth, number> = {
  narrow: 0.75,
  normal: 1,
  wide: 1.4,
};

export function applyCorridorWidth(
  d: Difficulty,
  width: CorridorWidth,
): Difficulty {
  return { ...d, toleranceH: d.toleranceH * CORRIDOR_WIDTH_FACTORS[width] };
}

/**
 * Applies the PRD difficulty ramp: every 5 gates cleared, scrollSpeed *= 1.08
 * (cap 2.2x base), toleranceH *= 0.95 (floor 0.07), restMs *= 0.95 (floor 600ms).
 * Always ramps from the fixed base constants keyed by total gatesCleared, so
 * repeated calls with growing gatesCleared do not compound earlier steps.
 */
export function rampDifficulty(gatesCleared: number): Difficulty {
  const steps = Math.floor(gatesCleared / 5);
  const t = tuning();
  return {
    scrollSpeed: Math.min(
      t.baseScrollSpeed * Math.pow(1.08, steps),
      t.baseScrollSpeed * SPEED_CAP_FACTOR,
    ),
    toleranceH: Math.max(
      t.baseToleranceH * Math.pow(0.95, steps),
      TOLERANCE_FLOOR,
    ),
    restMs: Math.max(t.baseRestMs * Math.pow(0.95, steps), t.restMsFloor),
  };
}

/**
 * Picks a uniformly random tone, rerolling if it would make three identical
 * tones in a row (i.e. the last two entries of `prev` are already equal to
 * the candidate). `rand` must return a value in [0, 1), e.g. `Math.random`.
 *
 * The reroll is bounded: a `rand` that keeps returning the forbidden tone
 * (a constant, as an injected test stub often is) would otherwise spin
 * forever. After MAX_REROLLS we deterministically step off the forbidden
 * tone instead — a repeat is a cosmetic flaw, a hang is not.
 */
const MAX_REROLLS = 8;

export function nextTone(prev: Tone[], rand: () => number): Tone {
  const lastTwoEqual =
    prev.length >= 2 && prev[prev.length - 1] === prev[prev.length - 2];
  const forbidden = lastTwoEqual ? prev[prev.length - 1] : null;

  let candidate: Tone = (Math.floor(rand() * 4) + 1) as Tone;
  for (let i = 0; i < MAX_REROLLS && candidate === forbidden; i++) {
    candidate = (Math.floor(rand() * 4) + 1) as Tone;
  }
  if (candidate === forbidden) {
    candidate = ((candidate % 4) + 1) as Tone;
  }
  return candidate;
}

/** Builds a gate from a tone, its horizontal start position, and current difficulty. */
export function makeGate(tone: Tone, xStart: number, d: Difficulty): Gate {
  return {
    tone,
    xStart,
    widthPx: d.scrollSpeed * gateDurationS(tone),
    tolChao: toleranceChao(tone, d.toleranceH),
  };
}
