/**
 * Visualiser-only accuracy — deliberately *not* the real game's scoring.
 *
 * `scoring.ts`'s `scoreGate` measures error against a tolerance band that
 * varies per tone and widens near fast/steep vertices (`corridorToleranceAt`)
 * — none of which is drawn on screen, so a player comparing the two lines by
 * eye had no way to reconcile what they saw with the percentage shown. This
 * measures the one thing that *is* drawn: the literal vertical gap, in chao,
 * between the player's traced line and the dashed target line, averaged over
 * the word's own duration.
 *
 * Pure: no Web Audio, no React, no canvas.
 */

import type { Contour } from "./contours.ts";
import { corridorChaoAt, type GateShape } from "./gates.ts";

/**
 * Being this many chao off, on average, reads as 0%. 2 is half the playable
 * 1-5 board — a starting value, not a measured one; retune here if it still
 * feels too harsh or too forgiving once more real attempts are seen.
 */
export const VISUAL_ACCURACY_RANGE_CHAO = 2;

/**
 * Mean |player - target| over an attempt, expressed as a 0-1 closeness
 * against `VISUAL_ACCURACY_RANGE_CHAO`. Null when the attempt has no points
 * inside the word's own duration (nothing to compare).
 *
 * Sampled at the player's own point times rather than a fixed step count:
 * `ContourRecorder` only stores voiced frames roughly evenly in time, so this
 * already approximates the area between the two curves without needing to
 * interpolate the player's line at arbitrary target-side steps.
 */
export function visualAccuracy(contour: Contour, shape: GateShape): number | null {
  const durationMs = shape.durationS * 1000;
  if (durationMs <= 0) return null;

  let sumErr = 0;
  let count = 0;
  for (const p of contour.points) {
    if (p.tMs > durationMs) continue;
    const target = corridorChaoAt(shape, p.tMs / durationMs);
    sumErr += Math.abs(p.chao - target);
    count += 1;
  }
  if (count === 0) return null;

  const meanErr = sumErr / count;
  return Math.min(1, Math.max(0, 1 - meanErr / VISUAL_ACCURACY_RANGE_CHAO));
}
