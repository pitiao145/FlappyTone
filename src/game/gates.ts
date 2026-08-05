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
 */
const POLYLINES: Record<Tone, Array<[number, number]>> = {
  // Flat, and at 4.6 rather than a textbook 5 — that is where she actually
  // holds a high level tone.
  1: [
    [0, 4.6],
    [1, 4.6],
  ],
  // Dips well below its start before climbing. The PRD's straight 3→5 ramp
  // missed the dip entirely, so a correct T2 began by leaving the corridor.
  2: [
    [0, 3.0],
    [0.3, 1.85],
    [0.8, 5.0],
    [1, 5.0],
  ],
  // Falls to the floor, sits there, then rises — the low plateau is the part
  // the PRD's two-segment polyline had no room for.
  3: [
    [0, 2.7],
    [0.5, 1.25],
    [0.62, 1.22],
    [0.9, 5.0],
    [1, 5.0],
  ],
  // A plateau and a cliff, not a slide.
  4: [
    [0, 5.0],
    [0.62, 5.0],
    [0.9, 1.25],
    [1, 1.25],
  ],
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
    widthPx: d.scrollSpeed * GATE_DURATION_S[tone],
    tolChao: toleranceChao(tone, d.toleranceH),
  };
}
