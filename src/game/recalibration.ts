/**
 * Post-run "does this still look right?" check. Pure, no React/DOM — same
 * style as scoring.ts.
 */

import type { RangeHalves } from "../pitch/calibration.ts";

/** A gap under 30% is ordinary run-to-run variance, not a miscalibration. */
const MIN_REL_DELTA = 0.3;
/**
 * ...but a small board (e.g. down=2) can clear 30% on well under a semitone,
 * which is not audible or actionable. Both thresholds must hold.
 */
const MIN_ABS_DELTA_ST = 1.0;

/**
 * Compares the range measured from a completed run against the stored
 * calibration halves, and returns the measured range as a suggestion when
 * either half is substantially off — null otherwise (nothing to offer).
 */
export function recalibrationSuggestion(
  current: { rangeSemitones: number; rangeDownSemitones: number },
  measured: RangeHalves,
): RangeHalves | null {
  const offBy = (measuredHalf: number, currentHalf: number) => {
    const delta = Math.abs(measuredHalf - currentHalf);
    return delta >= MIN_ABS_DELTA_ST && delta / currentHalf >= MIN_REL_DELTA;
  };
  if (
    !offBy(measured.up, current.rangeSemitones) &&
    !offBy(measured.down, current.rangeDownSemitones)
  ) {
    return null;
  }
  return measured;
}
