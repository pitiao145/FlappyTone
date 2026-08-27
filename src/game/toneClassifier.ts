/**
 * Tone recognition — pure logic, standalone from scoring.
 * No Web Audio, no React, no canvas.
 *
 * Answers a narrower question than `scoring.ts` does: not "did this attempt
 * clear tone T's gate", but "which of the four tones does this shape most
 * resemble, independent of any target". A recognizer, not a grader — it
 * never sees or cares which tone the player was aiming for.
 *
 * Wired into the Visualiser (`src/ui/Visualiser.tsx`, both the production
 * `/app` tab and the Lab's copy) as an always-shown "Tone" readout next to
 * accuracy. Still not wired into the game itself — `classifyTone` has no
 * dependency on anything Visualiser-specific, so plugging it into scoring
 * later is a matter of calling it from `run.ts`, not a rewrite.
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

interface DipInfo {
  /**
   * Whether a rise is actually visible after the low plateau — false when
   * the low region runs all the way to the sample's last point (still
   * falling/flat, not a dip-then-rise). Deliberately does *not* also
   * require the plateau to start away from the front edge — a real T3 can
   * dip almost immediately after onset and hold from there.
   */
  isInterior: boolean;
  /** How far the low point sits below the sample's own mean. */
  depth: number;
  /**
   * Where the low *plateau* ends — i.e. where a sustained climb actually
   * begins — as a fraction of the sample's own span (0–1). Not the position
   * of the single lowest sample: a real T3 that holds the floor for a
   * while before rising has its bare minimum sitting wherever the flat
   * stretch happens to start (or a tie-break picks the earliest match),
   * which reads as an *early* dip — T2's signature, not T3's. What actually
   * distinguishes them is when the floor ends and the rise starts, so that
   * is what this measures. See `plateauRange`.
   */
  positionFrac: number;
  /**
   * How much of the sample sits within `toneClassifierPlateauBandFrac` of
   * the minimum, as a fraction of the sample length (0–1). A narrow V-shaped
   * dip (T2) scores near 0; a real hold-then-rise T3 scores well above it.
   * A second, independent signal from `positionFrac` — a long hold pushes
   * both the plateau-end position late *and* this fraction high, and
   * `classifyTone` rewards them separately rather than folding one into
   * the other, so a hold that is long but not yet late-ending (or vice
   * versa) still gets partial credit.
   */
  plateauFrac: number;
}

/**
 * Walks outward from `minIdx` while the sample stays within `band` of the
 * minimum value, returning the contiguous low-plateau's start/end indices.
 * For a narrow dip (no real plateau) this collapses to `start === end ===
 * minIdx`, so callers that used to read `minIdx` directly see no change.
 */
function plateauRange(
  sample: number[],
  minIdx: number,
  band: number,
): { start: number; end: number } {
  const minVal = sample[minIdx];
  let start = minIdx;
  while (start > 0 && sample[start - 1] <= minVal + band) start -= 1;
  let end = minIdx;
  while (end < sample.length - 1 && sample[end + 1] <= minVal + band) end += 1;
  return { start, end };
}

/**
 * Finds the sample's lowest point and the low *plateau* around it, and
 * reports whether a rise is actually visible after it, how deep it dips
 * below the sample's own mean, where the plateau ends (see `positionFrac` on
 * `DipInfo`), and how much of the sample it covers (`plateauFrac`) — direct,
 * correlation-independent signals for T2/T3 disambiguation.
 *
 * Correlation alone rewards clean shape-matching, but T2 and T3 are both
 * "dip then rise" — they differ in *where* and *how deep* the dip sits, not
 * just in overall shape, and a correlation contest can miss that. Measured
 * against this project's own averaged templates (`AVERAGED_TONE_SHAPE`,
 * 16-point resample): T2's own dip is 0.94 chao deep at ~31% through, T3's is
 * 0.99 chao deep at ~50% through. Depth alone barely discriminates them —
 * both comfortably clear a naive "0.4-0.5 chao" floor — but *position* does:
 * T2 dips early, T3 dips later, closer to the middle. `classifyTone` gates
 * the bonus on both: deep enough (`toneClassifierDipThresholdChao`, kept
 * conservative since depth alone is weak) *and* late enough
 * (`toneClassifierDipMinPositionFrac`) to look like T3's dip rather than
 * T2's.
 *
 * `toneClassifierPlateauBandFrac` sizes the band as a fraction of the
 * sample's own chao range (max − min), not an absolute chao value, so this
 * stays scale-invariant the same way the correlation scoring already is.
 */
function detectDip(sample: number[]): DipInfo {
  let minIdx = 0;
  let maxVal = sample[0];
  for (let i = 1; i < sample.length; i++) {
    if (sample[i] < sample[minIdx]) minIdx = i;
    if (sample[i] > maxVal) maxVal = sample[i];
  }
  const n = sample.length;
  const range = maxVal - sample[minIdx];
  const band = range * tuning().toneClassifierPlateauBandFrac;
  const { start, end } = plateauRange(sample, minIdx, band);
  // The rise must actually be visible after the plateau — a low region that
  // runs all the way to the last sample is a still-falling (or still-flat)
  // shape, not a dip-then-rise, however long its floor is. Unlike the old
  // argmin-based check, this deliberately does *not* also require the
  // plateau to start away from the front edge: a real T3 can dip almost
  // immediately after onset and hold from there, which used to fail that
  // check outright (see the 25 Aug 2026 session, where every held-floor
  // attempt had its plateau start within the first couple of samples).
  const isInterior = end < n - 1;
  const mean = sample.reduce((s, v) => s + v, 0) / n;
  return {
    isInterior,
    depth: mean - sample[minIdx],
    positionFrac: end / (n - 1),
    plateauFrac: (end - start + 1) / n,
  };
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
 *   `detectDip` finds the sample's own lowest point, and if it sits away
 *   from the edges, dips deep enough below the mean
 *   (`toneClassifierDipThresholdChao`), *and* sits late enough
 *   (`toneClassifierDipMinPositionFrac` — T2 dips early, T3 dips later),
 *   nudges T3's score up (`toneClassifierDipBonus`) — see `detectDip`'s doc
 *   comment for why depth alone isn't a reliable discriminator here and
 *   position is what actually separates the two.
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
  if (t3Score !== undefined && dip.isInterior) {
    let bonus = 0;
    // Depth-gated, as before: `dip.depth` is mean-relative, and only
    // meaningful once there's a real point to be deep *relative to*.
    if (
      dip.depth > tuning().toneClassifierDipThresholdChao &&
      dip.positionFrac >= tuning().toneClassifierDipMinPositionFrac
    ) {
      bonus += tuning().toneClassifierDipBonus;
    }
    // Deliberately its own gate, not also requiring `toneClassifierDipThresholdChao`:
    // a long hold drags the sample's own mean down toward the floor, which
    // shrinks the mean-relative `depth` measurement even though the actual
    // drop from onset to floor is large — so the depth gate above quietly
    // failed on every real held-floor attempt this was built to catch.
    // `plateauFrac` already only fires on a real, sustained low stretch
    // (band-limited to `toneClassifierPlateauBandFrac` of the sample's own
    // range), so it doesn't need a second, redundant depth check. Reported
    // directly against a played-back session (25 Aug 2026): several genuine
    // T3 attempts held the floor for roughly half the sample before a late,
    // steep rise, and read as T2 or "none" even after `positionFrac` moved
    // to the plateau's end — the position fix alone wasn't enough ballast
    // against T2's own correlation pull.
    if (dip.plateauFrac >= tuning().toneClassifierPlateauMinFrac) {
      bonus += tuning().toneClassifierPlateauBonus;
    }
    if (bonus > 0) scores.set(3, Math.min(1, t3Score + bonus));
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
