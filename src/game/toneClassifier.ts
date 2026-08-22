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
 * sample count). The first ~10–20% of any utterance is dominated by pitch
 * ramping up from silence/onset consonant to the actual target — mechanical
 * noise, not tonal signal — and it was throwing off both the flatness check
 * and the correlation. Applied once, before everything else downstream
 * (resampling, flatness, correlation) so all of it sees the trimmed shape.
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

/**
 * Which of the four tones `contour` most resembles, or `"none"` if it
 * doesn't resemble any of them well enough, or is too close a call between
 * two of them to say. Null only when there isn't enough signal to say
 * anything at all (fewer than 2 points) — the same "not enough evidence"
 * posture `heardUtterance`/`unheardHint` take in `scoring.ts`.
 *
 * Tone 1 does not get a correlation — its target is level, so there is
 * nothing to correlate a shape *against* — but it competes on equal footing
 * with T2–T4 rather than short-circuiting them: its score is a continuous
 * "how flat is this" confidence (`toneClassifierFlatnessScaleChao`), and the
 * highest score across all four wins. That replaced a binary flat/not-flat
 * gate that, combined with the onset transient inflating the measured
 * excursion, was rejecting genuinely flat T1 attempts outright.
 */
export function classifyTone(contour: Contour): ToneClassification | null {
  if (contour.points.length < 2) return null;

  const trimmed = trimOnset(contour.points, tuning().toneClassifierOnsetTrimFraction);
  const sample = resample(trimmed, RESAMPLE_POINTS);
  const excursion = Math.max(...sample) - Math.min(...sample);

  const scores = new Map<Tone, number>();
  scores.set(
    1,
    1 - Math.min(1, Math.max(0, excursion / tuning().toneClassifierFlatnessScaleChao)),
  );
  for (const tone of [2, 3, 4] as Tone[]) {
    const template = resampleFixed(AVERAGED_TONE_SHAPE[tone], RESAMPLE_POINTS);
    const r = correlation(sample, template);
    if (r !== null) scores.set(tone, Math.min(1, Math.max(0, r)));
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
