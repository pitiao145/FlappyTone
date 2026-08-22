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
 */

import type { Contour } from "./contours.ts";
import { corridorChaoAt, shapeForTone, type Tone } from "./gates.ts";
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
 * A contour whose own excursion is at most this many chao is "flat" —
 * correlation is undefined for zero variance, so a near-flat attempt is
 * classified directly rather than correlated against anything.
 */
const FLAT_EXCURSION_CHAO = 0.3;

/**
 * Resamples `points` at `n` evenly spaced progress values across their own
 * `0 → last tMs` span, linearly interpolating between the two nearest
 * recorded points. Time-normalized to the contour's *own* duration, not any
 * external clock — a shape said faster or slower resamples to the same
 * `n`-length vector either way, which is what makes correlation against a
 * fixed-duration template meaningful.
 */
function resample(points: { tMs: number; chao: number }[], n: number): number[] {
  const lastMs = points[points.length - 1].tMs;
  if (lastMs <= 0) return new Array(n).fill(points[0].chao);

  const out: number[] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const targetMs = (k / (n - 1)) * lastMs;
    while (i < points.length - 2 && points[i + 1].tMs < targetMs) i++;
    const a = points[i];
    const b = points[i + 1] ?? a;
    const span = b.tMs - a.tMs;
    const frac = span <= 0 ? 0 : (targetMs - a.tMs) / span;
    out.push(a.chao + (b.chao - a.chao) * frac);
  }
  return out;
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
 * doesn't resemble any of them well enough. Null only when there isn't
 * enough signal to say anything at all (fewer than 2 points) — the same
 * "not enough evidence" posture `heardUtterance`/`unheardHint` take in
 * `scoring.ts`.
 */
export function classifyTone(contour: Contour): ToneClassification | null {
  if (contour.points.length < 2) return null;

  const sample = resample(contour.points, RESAMPLE_POINTS);
  const excursion = Math.max(...sample) - Math.min(...sample);

  if (excursion <= FLAT_EXCURSION_CHAO) {
    return { tone: 1, confidence: 1 };
  }

  let best: Tone | null = null;
  let bestScore = -Infinity;
  for (const tone of TONES) {
    const shape = shapeForTone(tone);
    const template = Array.from({ length: RESAMPLE_POINTS }, (_, k) =>
      corridorChaoAt(shape, k / (RESAMPLE_POINTS - 1)),
    );
    const score = correlation(sample, template);
    if (score !== null && score > bestScore) {
      bestScore = score;
      best = tone;
    }
  }

  if (best === null) return { tone: "none", confidence: 0 };

  const confidence = Math.min(1, Math.max(0, bestScore));
  if (confidence < tuning().toneClassifierMinConfidence) {
    return { tone: "none", confidence };
  }
  return { tone: best, confidence };
}
