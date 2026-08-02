/**
 * Gate geometry, tolerance, and difficulty ramp — pure game logic.
 * No Web Audio, no React, no canvas. See docs/PRD.md §6.
 */

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

/** Polylines from the PRD §6, as (t, chao) control points. */
const POLYLINES: Record<Tone, Array<[number, number]>> = {
  1: [
    [0, 5],
    [1, 5],
  ],
  2: [
    [0, 3],
    [1, 5],
  ],
  3: [
    [0, 2],
    [0.4, 1],
    [1, 4],
  ],
  4: [
    [0, 5],
    [1, 1],
  ],
};

/** Piecewise-linear interpolation of a tone's corridor centreline. t is clamped to [0,1]. */
export function corridorChaoAt(tone: Tone, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const points = POLYLINES[tone];
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
 * Converts a corridor tolerance in screen-height fraction to chao units.
 * 0.60H spans 4 chao, so tolChao = baseTolH / 0.60 * 4. Tone 3 gets ×1.3 (PRD §6).
 */
export function toleranceChao(tone: Tone, baseTolH: number): number {
  const tolChao = (baseTolH / 0.6) * 4;
  return tone === 3 ? tolChao * 1.3 : tolChao;
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

const BASE_SCROLL_SPEED = 220;
const BASE_TOLERANCE_H = 0.12;
const BASE_REST_MS = 900;

const SCROLL_SPEED_CAP = BASE_SCROLL_SPEED * 2.2;
const TOLERANCE_FLOOR = 0.07;
const REST_MS_FLOOR = 600;

/** The PRD's base difficulty values (§6). */
export function newDifficulty(): Difficulty {
  return {
    scrollSpeed: BASE_SCROLL_SPEED,
    toleranceH: BASE_TOLERANCE_H,
    restMs: BASE_REST_MS,
  };
}

/**
 * Applies the PRD difficulty ramp: every 5 gates cleared, scrollSpeed *= 1.08
 * (cap 2.2x base), toleranceH *= 0.95 (floor 0.07), restMs *= 0.95 (floor 600ms).
 * Always ramps from the fixed base constants keyed by total gatesCleared, so
 * repeated calls with growing gatesCleared do not compound earlier steps.
 */
export function rampDifficulty(gatesCleared: number): Difficulty {
  const steps = Math.floor(gatesCleared / 5);
  return {
    scrollSpeed: Math.min(
      BASE_SCROLL_SPEED * Math.pow(1.08, steps),
      SCROLL_SPEED_CAP,
    ),
    toleranceH: Math.max(
      BASE_TOLERANCE_H * Math.pow(0.95, steps),
      TOLERANCE_FLOOR,
    ),
    restMs: Math.max(BASE_REST_MS * Math.pow(0.95, steps), REST_MS_FLOOR),
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
    widthPx: d.scrollSpeed * 0.6,
    tolChao: toleranceChao(tone, d.toleranceH),
  };
}
