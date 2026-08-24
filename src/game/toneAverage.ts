/**
 * Averaging a tone's recorded clips into one representative polyline — pure
 * logic, no canvas, no DOM.
 *
 * Split out of `src/ui/toneAverageChart.ts` (which still owns the drawing)
 * so it can be imported from Node scripts (`src/dev/make-tone-averages.ts`)
 * without pulling in that file's DOM-typed rendering imports. One
 * measurement, shared everywhere it's used — see CLAUDE.md's "the clip is
 * the take" section for why this codebase treats a duplicated measurement
 * as the thing to avoid.
 */

import type { Word } from "./words.ts";

export const SAMPLES = 60;

/** Piecewise-linear read of a raw polyline at t in [0,1]. */
export function chaoAt(polyline: Word["polyline"], t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < polyline.length - 1; i++) {
    const [t0, c0] = polyline[i];
    const [t1, c1] = polyline[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const frac = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
      return c0 + frac * (c1 - c0);
    }
  }
  return polyline[polyline.length - 1][1];
}

/** Resamples every word's polyline onto a common t grid, then means per-t. */
export function averagePolyline(words: Word[]): number[] {
  const sums = new Array<number>(SAMPLES + 1).fill(0);
  for (const w of words) {
    for (let i = 0; i <= SAMPLES; i++) {
      sums[i] += chaoAt(w.polyline, i / SAMPLES);
    }
  }
  return sums.map((s) => s / words.length);
}
