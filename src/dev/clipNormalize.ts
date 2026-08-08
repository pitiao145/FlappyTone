/**
 * Places a measured contour at the Chao level its tone is supposed to occupy.
 *
 * Why this exists. Measuring Jane's 120 takes against her own voice puts her
 * Tone 1 at chao ~3.3, not 5: her T4 onsets reach ~330Hz while her T1 sits at
 * ~215Hz, seven semitones apart, and that reproduces across two sessions
 * (`jane_ma1` levels at 212Hz, `jane_ma4` peaks at 375Hz). So under any honest
 * normalisation of the corpus, a "high level" tone lands mid-board. The shipped
 * T1-at-chao-5 corridor only ever read as high because the old `f0Center` of
 * 168 was itself below her register.
 *
 * The resolution: **her recordings supply the dynamics, the tone marks supply
 * the height.** Timing, plateaus, cliffs, how fast a rise rises — all of that is
 * measured, per clip, and is the thing the old hand-drawn polylines got wrong
 * (PRD §6). Absolute level is not measured; it comes from the Chao values the
 * game is built to teach, or a T1 corridor sits at the speaker's mid pitch and
 * the tone mark, the grid and the cue text all stop agreeing.
 *
 * The map is **one affine per tone, shared by that tone's whole cohort** — not
 * per clip. Per clip would flatten every syllable onto identical endpoints and
 * throw away the real variation between words; per tone keeps the variation and
 * only moves the cohort as a body. What it does discard is variation in
 * absolute level *between* words of the same tone, which is largely intrinsic
 * f0 (high vowels sit higher) rather than anything a learner should copy.
 */

import type { ContourPoint } from "./clipCut.ts";

/** Low and high anchor of a cohort or a target shape, in chao. */
export interface ChaoSpan {
  low: number;
  high: number;
}

/** An affine map on chao: `chao' = a * chao + b`. */
export interface ChaoMap {
  a: number;
  b: number;
}

/** Below this span a tone has no excursion to scale, only a level to move. */
const DEGENERATE_SPAN = 0.2;

/** Nearest-rank percentile of an already-sorted array. */
function percentile(sorted: number[], p: number): number {
  const i = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, i))];
}

/**
 * The cohort's excursion, pooled across every frame of every clip of one tone.
 *
 * Trimmed at p2/p98 rather than min/max for the reason `computeRangeSemitones`
 * trims: one creak or octave-error frame at an extreme would otherwise set the
 * anchor, and every clip of that tone would be squashed to compensate.
 */
export function cohortSpan(contours: ContourPoint[][], trimPercent = 2): ChaoSpan {
  const values = contours.flat().map((p) => p[1]).sort((x, y) => x - y);
  if (values.length === 0) return { low: 0, high: 0 };
  return {
    low: percentile(values, trimPercent),
    high: percentile(values, 100 - trimPercent),
  };
}

/** The Chao levels a tone's canonical corridor occupies. */
export function polylineSpan(polyline: ReadonlyArray<readonly [number, number]>): ChaoSpan {
  const chaos = polyline.map((p) => p[1]);
  return { low: Math.min(...chaos), high: Math.max(...chaos) };
}

/**
 * The map taking a cohort onto its target span.
 *
 * A level tone has no span to stretch — T1's canonical corridor is flat at 5,
 * so there is no ratio to take and scaling by one would be division by nothing.
 * It gets a pure offset: the middle of what she produced moves to the level the
 * tone is defined at, and her own drift within the syllable survives untouched.
 */
export function chaoMapFor(cohort: ChaoSpan, target: ChaoSpan): ChaoMap {
  const cohortSpread = cohort.high - cohort.low;
  const targetSpread = target.high - target.low;
  if (targetSpread < DEGENERATE_SPAN || cohortSpread < DEGENERATE_SPAN) {
    const cohortMid = (cohort.low + cohort.high) / 2;
    const targetMid = (target.low + target.high) / 2;
    return { a: 1, b: targetMid - cohortMid };
  }
  const a = targetSpread / cohortSpread;
  return { a, b: target.low - a * cohort.low };
}

/**
 * Applies the map, clamping into the playable 1–5 band.
 *
 * Clamping happens here and nowhere earlier: the contour is measured against a
 * deliberately wide range so nothing pins during measurement, because a value
 * already flattened against the ceiling would drag the cohort anchor down and
 * squash every clip of that tone.
 */
export function applyChaoMap(contour: ContourPoint[], map: ChaoMap): ContourPoint[] {
  return contour.map(([t, chao]) => [
    t,
    Math.min(5, Math.max(1, map.a * chao + map.b)),
  ]);
}

/** Fraction of points sitting against an edge after mapping — see `clipReview`. */
export function pinnedFractionOf(contour: ContourPoint[]): number {
  if (contour.length === 0) return 0;
  const pinned = contour.filter(([, chao]) => chao <= 1.05 || chao >= 4.95).length;
  return pinned / contour.length;
}
