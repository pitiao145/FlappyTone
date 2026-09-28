/**
 * Tone accuracy — did the voice make the right tone shape? Pure logic: no Web
 * Audio, no React, no canvas.
 *
 * A separate number from the game score, on purpose (spec A,
 * `docs/SPECS/flappytone-SPEC-tone-accuracy.md`). The score (`scoreGate`)
 * asks "did you fly the tunnel on time" — corridor error on the gate's own
 * clock, where early, late or a wall hit rightly cost points. This asks only
 * "was it the right tone", on the player's own clock: the utterance is cut
 * out and time-normalised, so saying a correct tone 150ms early changes
 * nothing, and a wall hit is still measured. It feeds learning (per-tone and
 * per-combo stats, the visualiser), never points, combo or hearts.
 *
 * The reference is Jane's averaged shape: the tone's average for a single
 * syllable (`AVERAGED_TONE_SHAPE`), the exact combo's average for a pair
 * (`AVERAGED_PAIR_SHAPE`, e.g. every 3+2 word). Parts, each 0..1, mixed by
 * the weights on `tuning()`:
 *
 * - **shape**: correlation with the reference, clamped at 0.
 * - **movement size**: player range ÷ reference range, too big penalised as
 *   much as too small (`min(r, 1/r)`). Scaled by the shape match: the right
 *   amount of the wrong movement earns nothing.
 * - **height**: mean chao distance from the reference.
 * - **T2/T3 cue** (single T2 and T3 targets only): the classifier's
 *   drop/low-point vote, pointed at the target. Their averages correlate
 *   0.73, so shape alone would let a T2 said for a T3 keep most of its score.
 *   Also scaled by the shape match — a T4 fall "drops" plenty.
 *
 * Two special cases. A reference that barely moves (Tone 1, a 1+1 pair) is
 * judged on flatness and height only: a level line has no shape to correlate
 * against. And an attempt that barely moves on a tone that does move scores
 * near 0 whatever its correlation — the correlation of a flat, noisy line is
 * meaningless.
 */

import type { ContourPoint } from "./contours.ts";
import type { Tone } from "./gates.ts";
import {
  correlation,
  resample,
  resampleFixed,
  t2t3CueOf,
  trimOnset,
} from "./toneClassifier.ts";
import { AVERAGED_PAIR_SHAPE, AVERAGED_TONE_SHAPE } from "./toneAverages.ts";
import { toneComboKey } from "./words.ts";
import { tuning } from "./tuning.ts";

/** Points per syllable the utterance and the reference are compared at. */
const POINTS_PER_SYLLABLE = 16;

/**
 * The utterance inside a stretch of voiced points: the longest run, merging
 * gaps shorter than `mergeGapMs` — the same rule `heardUtterance` uses to
 * decide the gate was heard at all, so the two agree on what "the attempt"
 * is. A cough before the tone or a breath after it is a separate run and
 * does not stretch the alignment. Returns the run's points, time-zeroed.
 */
export function longestUtterance(points: ContourPoint[], mergeGapMs: number): ContourPoint[] {
  let best: ContourPoint[] = [];
  let run: ContourPoint[] = [];
  for (const p of points) {
    if (run.length > 0 && p.tMs - run[run.length - 1].tMs > mergeGapMs) run = [];
    run.push(p);
    if (spanOf(run) > spanOf(best) || (spanOf(run) === spanOf(best) && run.length > best.length)) {
      best = run;
    }
  }
  if (best.length === 0) return [];
  const t0 = best[0].tMs;
  return best.map((p) => ({ tMs: p.tMs - t0, chao: p.chao }));
}

function spanOf(points: ContourPoint[]): number {
  return points.length < 2 ? 0 : points[points.length - 1].tMs - points[0].tMs;
}

/** The averaged reference for a target, or null when there is none to judge against. */
export function referenceFor(tones: Tone[]): number[] | null {
  if (tones.length === 1) return AVERAGED_TONE_SHAPE[tones[0]] ?? null;
  if (tones.length !== 2) return null;
  // A neutral syllable has no averaged combo (left out of the generator on
  // purpose), so this also covers "neutral combos are not measured".
  return AVERAGED_PAIR_SHAPE[toneComboKey(tones)] ?? null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const range = (v: number[]) => Math.max(...v) - Math.min(...v);

/** Every part tone accuracy was mixed from — for the Lab readout and for tests. */
export interface ToneAccuracyDetail {
  accuracy: number;
  /** "shape" = the normal mix; "level" = a flat target; "flatAttempt" = a near-flat attempt on a moving tone. */
  mode: "shape" | "level" | "flatAttempt";
  shape: number | null;
  movement: number | null;
  height: number;
  /** Level targets only. */
  flatness: number | null;
  /** Single T2/T3 targets only: the cue pointed at the target, 0..1. */
  t23: number | null;
}

/**
 * How well the utterance made the target tone(s), 0..1, or null when there is
 * nothing honest to say: fewer than 2 points, or no reference (a combo with a
 * neutral syllable, more than two syllables). Whether the gate was heard at
 * all is the caller's call (`heardUtterance`) — an unheard gate gets null
 * there, before this runs.
 *
 * `utterance` is the attempt itself (see `longestUtterance`), in chao, on the
 * player's own clock; only its own span matters.
 */
export function toneAccuracy(utterance: ContourPoint[], tones: Tone[]): number | null {
  return toneAccuracyDetail(utterance, tones)?.accuracy ?? null;
}

/**
 * `toneAccuracy` with its parts. `reference` overrides the baked average —
 * never passed in the game; tests use it to score a recorded clip against an
 * average built without that clip.
 */
export function toneAccuracyDetail(
  utterance: ContourPoint[],
  tones: Tone[],
  reference: number[] | null = referenceFor(tones),
): ToneAccuracyDetail | null {
  if (utterance.length < 2) return null;
  if (!reference) return null;

  const t = tuning();
  const n = POINTS_PER_SYLLABLE * tones.length;
  const trimmed = trimOnset(utterance, t.toneClassifierOnsetTrimFraction);
  const sample = resample(trimmed, n);
  const target = resampleFixed(reference, n);

  const meanDistance = sample.reduce((s, v, i) => s + Math.abs(v - target[i]), 0) / n;
  const height = clamp01(1 - meanDistance / t.toneAccHeightZeroChao);

  const targetRange = range(target);
  const playerRange = range(sample);

  if (targetRange < t.toneAccFlatTargetChao) {
    // A level target: how flat, and at the right height. For a single
    // syllable only the settled tail is judged (the same window the
    // classifier's T1 read uses); a 1+1 pair must hold across the whole word.
    const window =
      tones.length === 1
        ? sample.slice(Math.floor(n * (1 - t.toneClassifierT1TailFraction)))
        : sample;
    const flatness = clamp01(1 - range(window) / t.toneClassifierFlatnessScaleChao);
    const flatWeight = t.toneAccShapeWeight + t.toneAccMovementWeight;
    return {
      accuracy: (flatWeight * flatness + t.toneAccHeightWeight * height) / (flatWeight + t.toneAccHeightWeight),
      mode: "level",
      shape: null,
      movement: null,
      height,
      flatness,
      t23: null,
    };
  }

  if (playerRange < t.toneAccFlatAttemptChao) {
    return {
      accuracy: t.toneAccFlatAttemptMax * (playerRange / t.toneAccFlatAttemptChao),
      mode: "flatAttempt",
      shape: null,
      movement: null,
      height,
      flatness: null,
      t23: null,
    };
  }

  const shape = clamp01(correlation(sample, target) ?? 0);
  const ratio = playerRange / targetRange;
  const movement = Math.min(ratio, 1 / ratio);

  // Movement size and the T2/T3 cue refine a shape match; they are not
  // credit on their own. A T4 fall has the right *amount* of movement for a
  // T3 and a big drop (so the cue says "T3"), and scored 0.56 as a T3 before
  // both were scaled by the shape match (28 Sep 2026).
  let sum =
    t.toneAccShapeWeight * shape + t.toneAccMovementWeight * movement * shape + t.toneAccHeightWeight * height;
  let weights = t.toneAccShapeWeight + t.toneAccMovementWeight + t.toneAccHeightWeight;

  let t23: number | null = null;
  if (tones.length === 1 && (tones[0] === 2 || tones[0] === 3)) {
    const cue = t2t3CueOf({ points: utterance, startedAtMs: 0, endedAtMs: null });
    if (cue !== null) {
      // The cue is -1 at the T2 average and +1 at the T3 average; pointed at
      // the target, that is 0 at the wrong tone's average and 1 at the right
      // one's, 0.5 at the midpoint.
      const toward = tones[0] === 3 ? cue : -cue;
      t23 = clamp01(0.5 + 0.5 * toward);
      sum += t.toneAccT23Weight * t23 * shape;
      weights += t.toneAccT23Weight;
    }
  }
  return { accuracy: sum / weights, mode: "shape", shape, movement, height, flatness: null, t23 };
}
