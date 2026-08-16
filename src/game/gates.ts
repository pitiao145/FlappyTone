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
 * The corridor for a word: its own measured polyline and duration, for every
 * tone including 3.
 *
 * T3 used to fly a single synthetic citation polyline instead — 22 of Jane's
 * 30 T3 takes had been measured as a dip that stays down and never rises, so
 * building corridors from those would have quietly stopped teaching the ˇ
 * contour that is the game's whole premise. That measurement was the defect:
 * `clipCut.ts`'s voicing rescue and run-merge gap were too narrow for T3's
 * creaky trough, and the "never rises" reading was the trough's rise being
 * discarded before it was ever measured, not a fact about how she spoke (15
 * Aug 2026 — see `TONE_3_RESCUE`/`TONE_3_MERGE_GAP_MS` in clipCut.ts). With
 * that fixed, all 30 T3 words now measure a real dip-and-rise, so the citation
 * fallback is gone: a word's own recording is the corridor for every tone.
 */
export function shapeForWord(word: { tone: Tone; polyline: Polyline; durationS: number }): GateShape {
  return { polyline: word.polyline, durationS: word.durationS };
}

/**
 * Monotone cubic Hermite tangents (Fritsch–Carlson) for a polyline.
 *
 * Plain Catmull-Rom can overshoot past a vertex's neighbours, which here would
 * mean a corridor briefly leaving [1,5] or the shape between two vertices
 * inverting — Fritsch–Carlson's slope limiting guarantees it never does, at
 * the cost of nothing on a genuinely monotone stretch.
 */
function monotoneTangents(points: Polyline): number[] {
  const n = points.length;
  const secants: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [t0, c0] = points[i];
    const [t1, c1] = points[i + 1];
    secants.push(t1 === t0 ? 0 : (c1 - c0) / (t1 - t0));
  }

  const m: number[] = new Array(n);
  m[0] = secants[0] ?? 0;
  m[n - 1] = secants[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    const d0 = secants[i - 1];
    const d1 = secants[i];
    m[i] = d0 === 0 || d1 === 0 || (d0 < 0) !== (d1 < 0) ? 0 : (d0 + d1) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    const d = secants[i];
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = m[i] / d;
    const beta = m[i + 1] / d;
    const sq = alpha * alpha + beta * beta;
    if (sq > 9) {
      const tau = 3 / Math.sqrt(sq);
      m[i] = tau * alpha * d;
      m[i + 1] = tau * beta * d;
    }
  }
  return m;
}

/**
 * Smooth interpolation through any polyline's vertices: a monotone cubic
 * Hermite spline, C0 at every vertex and C1 (continuous tangent) everywhere
 * else — no sharp corners at a vertex, and no overshoot past a vertex's
 * neighbours. t is clamped to [0,1].
 *
 * Not specific to a corridor centreline — `corridorToleranceAt` runs the
 * tolerance at each vertex through this same evaluator, so a wall gets the
 * identical smoothness guarantee the centreline does, from the same code
 * rather than a second hand-rolled smoothing pass.
 */
function splineAt(points: Polyline, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (points.length < 2) return points[0]?.[1] ?? 0;

  const tangents = monotoneTangents(points);
  for (let i = 0; i < points.length - 1; i++) {
    const [t0, c0] = points[i];
    const [t1, c1] = points[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const dt = t1 === t0 ? 1 : t1 - t0;
      const s = (clamped - t0) / dt;
      const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
      const h10 = s ** 3 - 2 * s ** 2 + s;
      const h01 = -2 * s ** 3 + 3 * s ** 2;
      const h11 = s ** 3 - s ** 2;
      return h00 * c0 + h10 * dt * tangents[i] + h01 * c1 + h11 * dt * tangents[i + 1];
    }
  }
  return points[points.length - 1][1];
}

/**
 * A corridor centreline: a monotone cubic Hermite spline through the
 * polyline's vertices — see `splineAt`. This is the single function
 * rendering (world.ts), collision, and scoring (run.ts) all read, so
 * smoothing it fixes the hitbox and the drawing together.
 *
 * Replaces plain piecewise-linear interpolation: with tone polylines now a
 * fixed 2–4 vertices (see `templateContour`), a straight-segment corridor drew
 * a visible, collidable corner at each one.
 */
export function corridorChaoAt(shape: GateShape, t: number): number {
  return splineAt(shape.polyline, t);
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
/**
 * Ceiling on the widening, as a multiple of the gate's base tolerance. The T4
 * cliff moves further within the slack window than the entire corridor is
 * wide, so without a cap its wall would effectively disappear.
 */
export const MAX_TIMING_WIDEN_FACTOR = 1.5;
/**
 * Where the cap's knee starts, as a fraction of the cap. Below it the widening
 * is exactly the segment's own travel; above it, it bends over rather than
 * cornering.
 */
const CAP_KNEE_FRAC = 0.75;

/**
 * Saturates `x` toward `cap` without a corner at the ceiling.
 *
 * A plain `Math.min(x, cap)` is a corner, and it fires exactly where the
 * corridor is steepest — the T4 cliff, where the widening is largest and a
 * spike would be most visible. Below the knee this is the identity, so
 * nothing changes on the tones that never approach the cap; at the knee the
 * two pieces meet with equal slope, and above it the curve approaches `cap`
 * and never crosses.
 */
function softCap(x: number, cap: number): number {
  const knee = cap * (1 - CAP_KNEE_FRAC);
  const joint = cap - knee;
  if (knee <= 0 || x <= joint) return Math.min(x, cap);
  return cap - knee * Math.exp(-(x - joint) / knee);
}

/**
 * How far segment `i` travels, in chao, over one slack window — treating the
 * segment as a straight line at its own average slope, uncapped.
 */
function segmentWiden(points: Polyline, i: number, dtNorm: number): number {
  const [t0, c0] = points[i];
  const [t1, c1] = points[i + 1];
  const slope = t1 === t0 ? 0 : (c1 - c0) / (t1 - t0);
  return Math.abs(slope) * dtNorm;
}

/**
 * How much extra room vertex `i` gets: the widening of the segment leading
 * *into* it (the one just before it), or — for the first vertex, which has
 * none before it — the segment leading out. This is what gives a steep
 * climb's final vertex the most room of any point on the corridor: its
 * incoming segment is the climb itself.
 */
function vertexWiden(points: Polyline, i: number, dtNorm: number): number {
  const seg = i === 0 ? 0 : i - 1;
  return segmentWiden(points, seg, dtNorm);
}

/**
 * Corridor half-height at `t`: the gate's base tolerance, plus a widening
 * spline through the polyline's own vertices — the same argument as before (a
 * single tolerance for the whole gate charges wildly different amounts for
 * the same timing error, because what being late *costs* depends on how fast
 * the corridor is moving underneath you), just fit through the vertices
 * directly instead of scanned fresh at every t or blended segment-by-segment.
 *
 * Each vertex's own widening — see `vertexWiden` — is exactly the "copy the
 * polyline's points, offset each one, and give the last ones more" shape:
 * the vertex ending a steep climb gets the most room, tapering back toward
 * the base tolerance at flatter vertices. Running that per-vertex profile
 * through `splineAt`, the same evaluator the centreline itself uses, is what
 * keeps the wall smooth without a second hand-rolled smoothing pass — no
 * blending logic to get subtly wrong, no seam where one segment's forgiveness
 * meets the next's. A `travel`-scanned or segment-blended widening both
 * pinch back toward zero at a genuine local min/max (the corridor is
 * momentarily flat right there) and flare either side of it, which is what
 * drew the double-notch "weird offshoot" on T3's floor (16 Aug 2026) — a
 * spline through the vertices' own values has no local window to pinch.
 *
 * Because the renderer draws this same function (see `edgeProfile` in
 * world.ts), the corridor visibly widens where it forgives — this is
 * something the player can see, not a hidden fudge factor.
 */
export function corridorToleranceAt(
  shape: GateShape,
  t: number,
  baseTolChao: number,
): number {
  const points = shape.polyline;
  if (points.length < 2) return baseTolChao;

  const tun = tuning();
  const dtNorm = tun.timingSlackS / shape.durationS;
  const cap = baseTolChao * tun.maxTimingWidenFactor;
  const widenProfile: Polyline = points.map(([tt], i) => [
    tt,
    softCap(vertexWiden(points, i, dtNorm), cap),
  ]);

  return baseTolChao + splineAt(widenProfile, t);
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
 * Player-selectable corridor width. Scales the tolerance (tunnel half-height)
 * only — speed and rest are fixed elsewhere. Applied after the ramp, so the
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
 * Applies the PRD difficulty ramp: every 5 gates cleared, toleranceH *= 0.95
 * (floor 0.07), restMs *= 0.95 (floor `restMsFloor`). scrollSpeed no longer
 * ramps (16 Aug 2026), so a gate's pixel width stays a stable function of the
 * word's own recorded duration throughout a run; difficulty still climbs,
 * just through a tighter corridor and less breathing room instead of a
 * faster world.
 * Always ramps from the fixed base constants keyed by total gatesCleared, so
 * repeated calls with growing gatesCleared do not compound earlier steps.
 */
export function rampDifficulty(gatesCleared: number): Difficulty {
  const steps = Math.floor(gatesCleared / 5);
  const t = tuning();
  return {
    scrollSpeed: t.baseScrollSpeed,
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
 *
 * `widthPx` is `scrollSpeed * shape.durationS` — with `scrollSpeed` now fixed
 * (see `newDifficulty`/`rampDifficulty`), a gate's pixel width is a direct,
 * stable function of the word's own recorded tone length: the corridor's
 * shape on screen approximates the recording's own ASCII contour as closely
 * as this rendering can, rather than being stretched or squeezed by the
 * difficulty ramp.
 */
export function makeGate(source: Word | Tone, xStart: number, d: Difficulty): Gate {
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
