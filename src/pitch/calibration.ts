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
