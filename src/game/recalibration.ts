/**
 * Post-run "does this still look right?" check. Pure, no React/DOM — same
 * style as scoring.ts.
 */

import type { RangeHalves } from "../pitch/calibration.ts";

/**
 * A gap under 35% is ordinary run-to-run variance, not a miscalibration.
 *
 * Raised from 30% (20 Aug 2026) alongside the windowed tracking in
 * `RecalTrackingState` below: single-run gameplay pitch is noisier than the
 * calibration sweep, so judging one run at 30% offered a recalibration on
 * most runs, and accepting it just replaced the calibration with another
 * noisy sample — which then got flagged again next run. Averaging several
 * runs before judging (see `averageRangeHalves`) is the main fix; the raised
 * threshold is a second margin on top of that.
 */
const MIN_REL_DELTA = 0.35;
/**
 * ...but a small board (e.g. down=2) can clear the relative threshold on well
 * under a semitone, which is not audible or actionable. Both thresholds must
 * hold.
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

/**
 * Mean of `up` and `down` across a window of per-run measured ranges.
 *
 * The averaging, not just the raised threshold, is what stops the offer from
 * chasing a single noisy run: `App.tsx` collects one `RangeHalves` per real
 * run into a `RecalTrackingState` and only calls `recalibrationSuggestion`
 * once the window is full, against this average rather than against any one
 * run's measurement.
 */
export function averageRangeHalves(samples: RangeHalves[]): RangeHalves | null {
  if (samples.length === 0) return null;
  const sum = samples.reduce(
    (acc, s) => ({ up: acc.up + s.up, down: acc.down + s.down }),
    { up: 0, down: 0 },
  );
  return { up: sum.up / samples.length, down: sum.down / samples.length };
}

/**
 * How many real runs (tutorial excluded — see `App.tsx`'s `onRunOver`) are
 * collected before the average is judged against calibration.
 *
 * Two different sizes on purpose: right after a deliberate visit to the
 * calibration tool, the very first real game is checked (window 1) — an early
 * "we personalised your grid even further" nudge, since the tutorial-seeded
 * grid is already close and one game is enough to refine it. Every cycle after
 * that — whether or not the previous one ended up offering anything — widens to
 * 3, so the check can't re-fire almost every run purely off run-to-run noise.
 */
export const INITIAL_TRACKING_WINDOW = 1;
export const COOLDOWN_TRACKING_WINDOW = 3;

/** Persisted across runs by `settings.ts` (`loadRecalTracking`/`saveRecalTracking`). */
export interface RecalTrackingState {
  windowSize: number;
  samples: RangeHalves[];
}

/**
 * Appends one run's measured range to the tracking window. A `null`
 * measurement (too little voiced audio that run) is dropped rather than
 * counted — a silent or half-finished run shouldn't advance the window, and
 * shouldn't drag the average toward a measurement that isn't one.
 */
export function recordTrackedRun(
  state: RecalTrackingState,
  measured: RangeHalves | null,
): RecalTrackingState {
  if (measured === null) return state;
  return { ...state, samples: [...state.samples, measured] };
}
