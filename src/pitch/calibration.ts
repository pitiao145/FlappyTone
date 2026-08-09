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

/**
 * The downward half gets its own, lower floor.
 *
 * The 3 above is a floor on how much pitch space the four contours need to
 * stay distinguishable, and that is a property of the *whole* board, not of
 * each half. Applying it per half was measurement to spare — a player measured
 * on 9 Aug 2026 at +10.9 / −2.7 st (a 4:1 voice, and a 13.6 st board, which is
 * a normal total: Jane's widest excursion across 120 takes is 13.1) had his
 * down half rounded up to 3, which puts chao 1 slightly past the deepest note
 * he has. Chao 1 must be reachable or the T3 corridor floor is a wall.
 *
 * Not lower than this: below ~2 st the downward half is small enough that
 * ordinary pitch wobble swings the dot across the bottom two Chao lines.
 */
export const RANGE_DOWN_SEMITONES_MIN = 2;

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
 *
 * `trimPercent` is 10 for a player, and that is not negotiable there: a preview
 * capture is a few hundred frames of ordinary speech, so a wider trim is one
 * creak frame away from sizing the board around an artefact. Offline corpus
 * measurement is the other case — thousands of frames of deliberate citation
 * tones, where p10 discards a fifth of the excursion the tones are made of, and
 * the artefacts are still rare enough for a p2 trim to catch them.
 */
export function computeRangeSemitones(
  voicedSemitones: number[],
  trimPercent = 10,
): number | null {
  if (voicedSemitones.length < 10) return null;
  const sorted = [...voicedSemitones].sort((a, b) => a - b);
  const half = (percentile(sorted, 100 - trimPercent) - percentile(sorted, trimPercent)) / 2;
  const rounded = Math.round(half * 2) / 2;
  return Math.min(RANGE_SEMITONES_MAX, Math.max(RANGE_SEMITONES_MIN, rounded));
}

/**
 * The two halves of the tone space: semitones from f0Center up to chao 5, and
 * down to chao 1. They are measured separately — see `semitonesToChao`.
 */
export interface RangeHalves {
  up: number;
  down: number;
}

/** Round to the nearest 0.5 and hold inside the tone-space bounds. */
function clampHalf(half: number, min = RANGE_SEMITONES_MIN): number {
  const rounded = Math.round(half * 2) / 2;
  return Math.min(RANGE_SEMITONES_MAX, Math.max(min, rounded));
}

/**
 * The fraction of a demonstrated maximum reach that the tone space occupies.
 *
 * A sweep asks the speaker to go as high and as low as they comfortably can.
 * That is their *reach*, and it is much wider than the space Mandarin tones
 * live in: Jane's own Tone 1 measures at chao 3.3 against her own voice — about
 * +0.75 st above her conversational median — before `clipNormalize` lifts the
 * T1 cohort to canonical chao 5. Handing a player chao 5 = the top of a
 * sustained "ahh" therefore asks them to shout their first tone, which is what
 * the un-scaled board did: a player measured at +10.9 st up could no longer
 * clear a T1 gate he used to clear.
 *
 * So the sweeps bound the board rather than being the board. 0.6 is flown, not
 * derived — retune it in the Lab, not here.
 */
export const REACH_TO_TONE_SPACE = 0.6;

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
 * Two failures are pinned here, and a fix for either one alone re-introduces
 * the other:
 *
 * ⚠ The two sweeps are *not* averaged into one half-width. A speaker reaching
 * +10 st up and −2 st down was handed a symmetric ±6 board, on which their
 * deepest note drew at chao 2.33 and chao 1 needed three times the excursion
 * they had just demonstrated they had. f0Center is not the midpoint between the
 * extremes and was never checked against them.
 *
 * ⚠ Neither half is the raw reach. Un-scaled, the same measurement put chao 5
 * at the ceiling of a comfortable "ahh" (Tone 1 became unreachable) and chao 1
 * at 2.7 st below the speaking voice (an ordinary Tone 2 onset drew on the
 * floor). Both are the same category error — a reach is not a tone space. See
 * `REACH_TO_TONE_SPACE`.
 *
 * Returns null when either sweep is too sparse to say anything.
 */
export function computeRangeHalvesFromExtremes(
  high: number[],
  low: number[],
): RangeHalves | null {
  if (high.length < 10 || low.length < 10) return null;
  const h = [...high].sort((a, b) => a - b);
  const l = [...low].sort((a, b) => a - b);
  // Scale first, clamp second: the bounds are on the board that gets played,
  // not on the reach that was measured.
  return {
    up: clampHalf(REACH_TO_TONE_SPACE * percentile(h, 90)),
    down: clampHalf(
      REACH_TO_TONE_SPACE * -percentile(l, 10),
      RANGE_DOWN_SEMITONES_MIN,
    ),
  };
}

/**
 * The preview-capture equivalent, for "Fit to what I just did": each half from
 * its own trimmed extreme rather than from half the span. Same trim rationale
 * as `computeRangeSemitones`, which this replaces on the player-facing path.
 *
 * ⚠ Deliberately *not* scaled by `REACH_TO_TONE_SPACE`, and that is not an
 * oversight to tidy up. The preview capture is free play — the player producing
 * tones — so it already measures a tone space, where a sweep measures a reach.
 * Keeping the two paths different is what makes them a cross-check: a
 * sweep-derived board and a preview-derived board for the same voice should
 * land close to each other, and a large gap says the factor above is wrong.
 */
export function computeRangeHalves(
  voicedSemitones: number[],
  trimPercent = 10,
): RangeHalves | null {
  if (voicedSemitones.length < 10) return null;
  const sorted = [...voicedSemitones].sort((a, b) => a - b);
  return {
    up: clampHalf(percentile(sorted, 100 - trimPercent)),
    down: clampHalf(-percentile(sorted, trimPercent), RANGE_DOWN_SEMITONES_MIN),
  };
}
