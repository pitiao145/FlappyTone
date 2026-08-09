/**
 * Gate geometry, tolerance, and difficulty ramp — pure game logic.
 * No Web Audio, no React, no canvas. See docs/PRD.md §6.
 */

import { brand } from "../brand.ts";
import { DEFAULT_TUNING, tuning, type Polyline } from "./tuning.ts";
import type { Word } from "./words.ts";

export type Tone = 1 | 2 | 3 | 4;

/**
 * The strings live in `src/brand.ts` so the build-time prerender can reach them
 * without importing the game engine. This alias is the game's name for them —
 * every call site here stays as it was.
 */
export const TONE_INFO: Record<
  Tone,
  { pinyin: string; hanzi: string; cue: string }
> = brand.tones;

/**
 * The shipped gate lengths, as a convenience alias for the tuning defaults.
 *
 * PRD §14 asked "is 600ms the right gate width, or does it need to flex per
 * tone?" — it does. These began as the reference clips' own lengths, printed by
 * `npm run make-ref-clips`, so that the player heard a syllable and then flew a
 * corridor lasting exactly as long: call and response on one clock. T1 and T3
 * have since been shortened from play (see tuning.ts), which means the demo and
 * the gate no longer agree on those two — the sort of disagreement that has
 * caused two separate failures in this project, so it is worth re-cutting the
 * clips rather than leaving it.
 *
 * Invariant to the difficulty ramp: gate width is `scrollSpeed * duration`, so
 * a faster world scrolls past more quickly but never demands a faster tone.
 *
 * Live values come from `gateDurationS()`; this is only the default, and the
 * single source of truth for it is DEFAULT_TUNING.
 */
export const GATE_DURATION_S: Record<Tone, number> = DEFAULT_TUNING.gateDurationS;

/** Live gate length — the Lab can move these; the constant above is the default. */
export function gateDurationS(tone: Tone): number {
  return tuning().gateDurationS[tone];
}

/**
 * A corridor: the centreline to fly and how long flying it takes.
 *
 * Gates are built from words now, and a word carries its own measured contour
 * and its own length, so the shape can no longer be looked up from the tone.
 * Keeping the two together in one object is what holds PRD §6's invariant —
 * a polyline and a duration that came from different places is exactly the
 * disagreement that has broken this twice.
 */
export interface GateShape {
  polyline: Polyline;
  durationS: number;
}

/** The tone's own default corridor, from tuning. The Lab edits these. */
export function shapeForTone(tone: Tone): GateShape {
  const t = tuning();
  return { polyline: t.polylines[tone], durationS: t.gateDurationS[tone] };
}

/**
 * The corridor for a word.
 *
 * ⚠ Tone 3 is deliberately not measured. 22 of Jane's 30 T3 takes are her
 * *natural* T3 — a dip that stays down and never rises — which PRD §6 already
 * records. Building corridors from those would quietly stop teaching the ˇ
 * contour that is the game's whole premise, so a T3 gate flies the citation
 * polyline while still cueing her recording of the word. That is a real
 * disagreement between demo and corridor, and the only one: it closes by
 * re-recording T3 in citation form, at which point this branch deletes.
 */
export function shapeForWord(word: { tone: Tone; polyline: Polyline; durationS: number }): GateShape {
  if (word.tone === 3) return shapeForTone(3);
  return { polyline: word.polyline, durationS: word.durationS };
}

/** Piecewise-linear interpolation of a corridor centreline. t is clamped to [0,1]. */
export function corridorChaoAt(shape: GateShape, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const points = shape.polyline;
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
 * Taps either side of t in the smoothing pass.
 *
 * Each tap is a shifted copy of the cuspy raw function, so a cusp survives at
 * 1/(2·TAPS+1) of its original size — the count is what decides whether a
 * spike is gone or merely smaller. 3 taps left a fifth of it, which still drew
 * as a kink. Cost is paid once per gate (see the edge cache in world.ts), not
 * once per frame.
 */
const SMOOTH_TAPS = 16;
/**
 * Where the cap's knee starts, as a fraction of the cap. Below it the widening
 * is exactly `travel`; above it, it bends over rather than cornering.
 */
const CAP_KNEE_FRAC = 0.75;

/**
 * The raw widening at `t`: how far the centreline travels within the slack
 * window either side.
 *
 * A max over a window is not smooth — it is a tent whose apex is a cusp, and
 * it corners again wherever the window's extremum swaps. That is what drew the
 * spikes on the corridor walls. `corridorToleranceAt` smooths this; nothing
 * else should call it raw.
 */
function travelAt(shape: GateShape, t: number, dtNorm: number): number {
  const here = corridorChaoAt(shape, t);
  let travel = 0;
  for (let i = 1; i <= SLACK_STEPS; i++) {
    const offset = (i / SLACK_STEPS) * dtNorm;
    travel = Math.max(
      travel,
      Math.abs(corridorChaoAt(shape, t + offset) - here),
      Math.abs(corridorChaoAt(shape, t - offset) - here),
    );
  }
  return travel;
}

/**
 * Saturates `x` toward `cap` without a corner at the ceiling.
 *
 * A plain `Math.min(x, cap)` is a second cusp, and it fires exactly where the
 * corridor is steepest — the T4 cliff, where the flare is largest and the
 * spike most visible. Below the knee this is the identity, so nothing changes
 * on the tones that never approach the cap; at the knee the two pieces meet
 * with equal slope, and above it the curve approaches `cap` and never crosses.
 */
function softCap(x: number, cap: number): number {
  const knee = cap * (1 - CAP_KNEE_FRAC);
  const joint = cap - knee;
  if (knee <= 0 || x <= joint) return Math.min(x, cap);
  return cap - knee * Math.exp(-(x - joint) / knee);
}

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
 *
 * The widening is smoothed before it is added, in two places, for one reason:
 * the corridor's *walls* were peaky where its centreline is not. Both `travel`
 * (a max over a window) and the cap (a `min`) are corner-producing, and the
 * renderer draws this function directly, so every corner became a visible
 * spike — reported as "the tunnel edges look peaky", most clearly on the T4
 * cliff and either side of the T2 dip.
 *
 * The blur runs *after* the max, never before, and it is an average — so the
 * result always lies between the smallest and the largest unsmoothed value
 * within the radius. It rounds a peak down and lifts the foot of a moving
 * stretch a little; it cannot invent room the max scan never found, cannot
 * narrow the corridor below `baseTolChao`, and cannot cross the cap. What it
 * does cost is reach: the widening now bleeds `slackSmoothS` further into the
 * flat ground either side of a move. At the shipped 50ms against a 70ms slack
 * window that is small, but it is a real loosening, not a free repaint.
 */
export function corridorToleranceAt(
  shape: GateShape,
  t: number,
  baseTolChao: number,
): number {
  const tun = tuning();
  const dtNorm = tun.timingSlackS / shape.durationS;
  const cap = baseTolChao * tun.maxTimingWidenFactor;
  const radius = tun.slackSmoothS / shape.durationS;

  if (radius <= 0) return baseTolChao + softCap(travelAt(shape, t, dtNorm), cap);

  let sum = 0;
  let weight = 0;
  for (let i = -SMOOTH_TAPS; i <= SMOOTH_TAPS; i++) {
    const frac = i / SMOOTH_TAPS;
    const w = Math.exp(-2 * frac * frac);
    sum += w * softCap(travelAt(shape, t + frac * radius, dtNorm), cap);
    weight += w;
  }
  return baseTolChao + sum / weight;
}

export interface Gate {
  tone: Tone;
  /** The word being cued and labelled. Null in tests that build a bare gate. */
  word: Word | null;
  /** The corridor. Not always the word's own — see `shapeForWord`. */
  shape: GateShape;
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

/**
 * Builds a gate. Pass a word to fly its measured corridor; pass a bare tone to
 * fly the tuning default, which is what the tutorial and a manifest-less build
 * fall back to.
 */
export function makeGate(
  source: Word | Tone,
  xStart: number,
  d: Difficulty,
): Gate {
  const word = typeof source === "number" ? null : source;
  const tone = typeof source === "number" ? source : source.tone;
  const shape = word ? shapeForWord(word) : shapeForTone(tone);
  return {
    tone,
    word,
    shape,
    widthPx: d.scrollSpeed * shape.durationS,
    xStart,
    tolChao: toleranceChao(tone, d.toleranceH),
  };
}
