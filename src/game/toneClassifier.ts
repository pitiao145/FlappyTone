/**
 * Tone recognition — pure logic, standalone from scoring.
 * No Web Audio, no React, no canvas.
 *
 * Answers a narrower question than `scoring.ts` does: not "did this attempt
 * clear tone T's gate", but "which of the four tones does this shape most
 * resemble, independent of any target". A recognizer, not a grader — it
 * never sees or cares which tone the player was aiming for.
 *
 * Currently wired up in the Lab's visualiser tab only (`src/dev/Lab.tsx`),
 * deliberately: see the `shape-analysis-roadmap` memory for why richer
 * shape work gets proven here first. `classifyTone` has no dependency on
 * anything Lab- or Visualiser-specific, so plugging it into the game later
 * is a matter of calling it from `run.ts`, not a rewrite.
 *
 * Templates come from `AVERAGED_TONE_SHAPE` (`src/game/toneAverages.ts`,
 * generated — see `src/dev/make-tone-averages.ts`): each tone's chao value
 * averaged across every one of its recorded words' own measured polyline,
 * not a single citation take. Baked in offline so this stays zero-I/O;
 * rerun the generator and commit the regenerated file when the recording
 * inventory changes.
 */

import type { Contour } from "./contours.ts";
import type { Tone } from "./gates.ts";
import { AVERAGED_TONE_SHAPE } from "./toneAverages.ts";
import { tuning } from "./tuning.ts";

export type ClassifiedTone = Tone | "none";

export interface ToneClassification {
  tone: ClassifiedTone;
  /** The winning correlation, clamped to [0, 1]. */
  confidence: number;
}

const TONES: Tone[] = [1, 2, 3, 4];

/** Points sampled across each shape's own progress, for comparison. */
const RESAMPLE_POINTS = 16;

/**
 * Drops the first `trimFraction` of the contour's own span (by time, not
 * sample count) — a small cut (see `toneClassifierOnsetTrimFraction`'s
 * default), meant only to clear a click or brief silence right at the very
 * start, not a real chunk of the tone. A larger shared trim here risked
 * shaving into genuine early signal (T3's dip starts early); the tones that
 * need more protection from a slow onset ramp get their own dedicated
 * window in `classifyTone` instead (T1's tail-only judging window) rather
 * than a bigger blanket cut applied to everything.
 *
 * Falls back to the untrimmed points if trimming would leave fewer than 2
 * (a very short utterance) — better to classify on the full noisy shape than
 * to have nothing left at all.
 */
function trimOnset(
  points: { tMs: number; chao: number }[],
  trimFraction: number,
): { tMs: number; chao: number }[] {
  if (points.length < 2) return points;
  const startT = points[0].tMs;
  const endT = points[points.length - 1].tMs;
  const cutoff = startT + (endT - startT) * trimFraction;
  const trimmed = points.filter((p) => p.tMs >= cutoff);
  return trimmed.length >= 2 ? trimmed : points;
}

/**
 * Resamples `points` at `n` evenly spaced progress values across their own
 * span — `points[0].tMs` to `points[last].tMs`, *not* assumed to start at 0,
 * since `trimOnset` may have dropped everything before some cutoff —
 * linearly interpolating between the two nearest recorded points.
 * Time-normalized to the contour's *own* duration, not any external clock —
 * a shape said faster or slower resamples to the same `n`-length vector
 * either way, which is what makes correlation against a fixed-duration
 * template meaningful.
 */
function resample(points: { tMs: number; chao: number }[], n: number): number[] {
  const startMs = points[0].tMs;
  const lastMs = points[points.length - 1].tMs;
  const span = lastMs - startMs;
  if (span <= 0) return new Array(n).fill(points[0].chao);

  const out: number[] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const targetMs = startMs + (k / (n - 1)) * span;
    while (i < points.length - 2 && points[i + 1].tMs < targetMs) i++;
    const a = points[i];
    const b = points[i + 1] ?? a;
    const segSpan = b.tMs - a.tMs;
    const frac = segSpan <= 0 ? 0 : (targetMs - a.tMs) / segSpan;
    out.push(a.chao + (b.chao - a.chao) * frac);
  }
  return out;
}

/**
 * Resamples a fixed, evenly-spaced-over-[0,1] array (`AVERAGED_TONE_SHAPE`'s
 * 61 values) down to `n` points, linearly interpolating by index. Kept
 * separate from `resample` above: this operates on an already time-
 * normalized array with no timestamps, decoupling the classifier's own
 * resolution (`RESAMPLE_POINTS`) from however many samples the baked file
 * happens to store.
 */
function resampleFixed(values: number[], n: number): number[] {
  const lastIdx = values.length - 1;
  return Array.from({ length: n }, (_, k) => {
    const idx = (k / (n - 1)) * lastIdx;
    const i0 = Math.floor(idx);
    const i1 = Math.min(lastIdx, i0 + 1);
    const frac = idx - i0;
    return values[i0] + (values[i1] - values[i0]) * frac;
  });
}

/** Pearson correlation between two equal-length vectors. Null if either has zero variance. */
function correlation(a: number[], b: number[]): number | null {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
}

/** How far into the sample a dip must sit to count as "interior" rather than an edge. */
const DIP_INTERIOR_LOW = 0.15;
const DIP_INTERIOR_HIGH = 0.85;

interface DipInfo {
  /** Whether the sample's lowest point sits away from either edge. */
  isInterior: boolean;
  /** How far the low point sits below the sample's own mean. */
  depth: number;
}

/**
 * Finds the sample's lowest point and asks whether it sits in the interior
 * (not right at either edge) and how deep it dips below the sample's own
 * mean — a direct, correlation-independent signal for T2/T3 disambiguation.
 *
 * Correlation alone rewards clean shape-matching, but T2 and T3 are both
 * "dip then rise" — they differ in *where* and *how deep* the dip sits, not
 * just in overall shape, and a correlation contest can miss that. Measured
 * against this project's own averaged templates (`AVERAGED_TONE_SHAPE`,
 * 16-point resample): T2's own dip is 0.94 chao deep at ~31% through, T3's is
 * 0.99 chao deep at ~50% through — close enough that depth alone barely
 * discriminates them; both comfortably clear a naive "0.4-0.5 chao" floor.
 * `toneClassifierDipThresholdChao` defaults well above both, so the bonus
 * below stays a rare nudge rather than a default-on effect until it's been
 * tuned against real attempts in the Lab.
 */
function detectDip(sample: number[]): DipInfo {
  let minIdx = 0;
  for (let i = 1; i < sample.length; i++) {
    if (sample[i] < sample[minIdx]) minIdx = i;
  }
  const n = sample.length;
  const isInterior =
    minIdx > DIP_INTERIOR_LOW * n && minIdx < DIP_INTERIOR_HIGH * n;
  const mean = sample.reduce((s, v) => s + v, 0) / n;
  return { isInterior, depth: mean - sample[minIdx] };
}

/**
 * Which of the four tones `contour` most resembles, or `"none"` if it
 * doesn't resemble any of them well enough, or is too close a call between
 * two of them to say. Null only when there isn't enough signal to say
 * anything at all (fewer than 2 points) — the same "not enough evidence"
 * posture `heardUtterance`/`unheardHint` take in `scoring.ts`.
 *
 * The onset trim here is deliberately small (`toneClassifierOnsetTrimFraction`,
 * default 5%) — just enough to drop a click/silence artifact right at the
 * start, not a real chunk of the tone. A larger shared trim risked shaving
 * into genuine early signal (T3's dip starts early), so the tones that need
 * more protection from the onset get their own dedicated handling instead of
 * a bigger blanket cut:
 *
 * - **Tone 1** doesn't get a correlation — its target is level, so there's
 *   nothing to correlate a shape *against* — but it does get its own
 *   judging window: only the *last* `toneClassifierT1TailFraction` of the
 *   sample (where the voice has actually settled), not the whole shape,
 *   which may still be transitioning early on. Its score is a continuous
 *   "how flat is this tail" confidence, competing against T2–T4's
 *   correlation on equal footing — not a binary gate that short-circuits
 *   everything else.
 * - **T2 vs T3** additionally gets a direct, correlation-independent check:
 *   `detectDip` finds the sample's own lowest point and, if it sits away
 *   from the edges and dips deep enough below the mean
 *   (`toneClassifierDipThresholdChao`), nudges T3's score up
 *   (`toneClassifierDipBonus`) — see `detectDip`'s doc comment for why this
 *   threshold needs real tuning, not just the two tones' correlation shapes
 *   fighting it out.
 */
export function classifyTone(contour: Contour): ToneClassification | null {
  if (contour.points.length < 2) return null;

  const trimmed = trimOnset(contour.points, tuning().toneClassifierOnsetTrimFraction);
  const sample = resample(trimmed, RESAMPLE_POINTS);

  const tailStart = Math.floor(
    RESAMPLE_POINTS * (1 - tuning().toneClassifierT1TailFraction),
  );
  const t1Window = sample.slice(tailStart);
  const t1Excursion = Math.max(...t1Window) - Math.min(...t1Window);

  const scores = new Map<Tone, number>();
  scores.set(
    1,
    1 - Math.min(1, Math.max(0, t1Excursion / tuning().toneClassifierFlatnessScaleChao)),
  );
  for (const tone of [2, 3, 4] as Tone[]) {
    const template = resampleFixed(AVERAGED_TONE_SHAPE[tone], RESAMPLE_POINTS);
    const r = correlation(sample, template);
    if (r !== null) scores.set(tone, Math.min(1, Math.max(0, r)));
  }

  const dip = detectDip(sample);
  const t3Score = scores.get(3);
  if (
    t3Score !== undefined &&
    dip.isInterior &&
    dip.depth > tuning().toneClassifierDipThresholdChao
  ) {
    scores.set(3, Math.min(1, t3Score + tuning().toneClassifierDipBonus));
  }

  let best: Tone | null = null;
  let bestScore = -Infinity;
  let runnerUpScore = -Infinity;
  for (const tone of TONES) {
    const score = scores.get(tone);
    if (score === undefined) continue;
    if (score > bestScore) {
      runnerUpScore = bestScore;
      bestScore = score;
      best = tone;
    } else if (score > runnerUpScore) {
      runnerUpScore = score;
    }
  }

  if (best === null) return { tone: "none", confidence: 0 };

  if (bestScore < tuning().toneClassifierMinConfidence) {
    return { tone: "none", confidence: bestScore };
  }
  // A near-tie between the top two is an ambiguous attempt, not a confident
  // read of the winner — a raw floor on the winner's own score can't catch
  // this on its own.
  if (bestScore - runnerUpScore < tuning().toneClassifierMarginThreshold) {
    return { tone: "none", confidence: bestScore };
  }

  return { tone: best, confidence: bestScore };
}
