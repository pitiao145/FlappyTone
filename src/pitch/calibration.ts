/**
 * Pure calibration math module. Zero Web Audio dependencies.
 * These functions take captured RMS/f0 arrays and produce settings.
 */

/**
 * Compute the median of an array of numbers.
 * Throws if the array is empty.
 */
export function median(xs: number[]): number {
  if (xs.length === 0) throw new Error("median of empty array");
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Minimum noise floor to prevent `noiseFloor*3` from collapsing to 0.
 */
export const NOISE_FLOOR_MIN = 1e-4;

/**
 * Compute the noise floor from a capture of quiet RMS frames.
 * Returns the median, floored at NOISE_FLOOR_MIN to ensure voicing gate
 * `rms >= noiseFloor*3` never degrades to 0.
 */
export function computeNoiseFloor(rmsFrames: number[]): number {
  if (rmsFrames.length === 0) return NOISE_FLOOR_MIN;
  return Math.max(NOISE_FLOOR_MIN, median(rmsFrames));
}

/**
 * Compute f0Center from voiced f0 samples (normally from three repetitions
 * of a calibration syllable at normal speaking voice).
 * Returns the median if >= 10 samples, null if sparse capture.
 */
export function computeF0Center(voicedF0s: number[]): number | null {
  if (voicedF0s.length < 10) return null;
  return median(voicedF0s);
}

/**
 * Bounds on the tone space. The PRD's 3–8 was a guess; the floor still holds
 * (below ±3 st the four contours stop being distinguishable) but the ceiling
 * was raised because it excluded real voices — a native speaker measured 6.0
 * and would have been rejected outright by a cap she legitimately approached.
 */
export const RANGE_SEMITONES_MIN = 3;
export const RANGE_SEMITONES_MAX = 10;

/** Nearest-rank percentile of an already-sorted array. */
function percentile(sorted: number[], p: number): number {
  const i = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, i))];
}

/**
 * Choose the tone space from what the speaker actually does with their voice.
 *
 * Half the p10–p90 span, not half the full span: a single octave-error or
 * creak frame at the edge would otherwise stretch the board so far that every
 * real contour flattens into the middle. Measured on fixtures/captures, this
 * reproduces the value a player had already arrived at by hand (3.5) and keeps
 * a wide native speaker at a usable 6.0 where min–max gave 9.5.
 *
 * Returns null when the capture is too sparse to say anything.
 */
export function computeRangeSemitones(voicedSemitones: number[]): number | null {
  if (voicedSemitones.length < 10) return null;
  const sorted = [...voicedSemitones].sort((a, b) => a - b);
  const half = (percentile(sorted, 90) - percentile(sorted, 10)) / 2;
  const rounded = Math.round(half * 2) / 2;
  return Math.min(RANGE_SEMITONES_MAX, Math.max(RANGE_SEMITONES_MIN, rounded));
}

/**
 * Tone space from a deliberate high sweep and a deliberate low sweep, in
 * semitones relative to f0Center.
 *
 * Measuring beats inferring. `computeRangeSemitones` reads the excursion out of
 * whatever the speaker happened to do during a preview, which for a beginner is
 * three flat syllables — so it under-reports a range they have but did not use.
 * Asking them to reach, once in each direction, measures the thing directly.
 *
 * p90 of the high sweep against p10 of the low sweep, for the same reason the
 * preview version trims: one octave-error or creak frame at either extreme
 * would otherwise size the whole board around a measurement artefact.
 *
 * Returns null when either sweep is too sparse to say anything.
 */
export function computeRangeFromExtremes(
  high: number[],
  low: number[],
): number | null {
  if (high.length < 10 || low.length < 10) return null;
  const h = [...high].sort((a, b) => a - b);
  const l = [...low].sort((a, b) => a - b);
  const half = (percentile(h, 90) - percentile(l, 10)) / 2;
  const rounded = Math.round(half * 2) / 2;
  return Math.min(RANGE_SEMITONES_MAX, Math.max(RANGE_SEMITONES_MIN, rounded));
}
