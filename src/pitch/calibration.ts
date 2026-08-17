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

/**
 * The upward half's own floor for *live calibration only* (17 Aug 2026) —
 * deliberately not `RANGE_SEMITONES_MIN`, which stays 3 and stays wired to
 * `computeRangeSemitones` (still used by `dev/clipCut.ts`/`clipNormalize.ts`
 * to measure the shipped reference clips). Changing that shared constant
 * would risk moving corridor polylines that have nothing to do with a
 * player's own calibration. This one only governs `up` in
 * `computeRangeHalves`/`computeRangeHalvesFromExtremes` below.
 *
 * Matches `RANGE_DOWN_SEMITONES_MIN` on the same reasoning `_DOWN` was split
 * out for in the first place: a real measurement (17 Aug 2026, `up` p90 =
 * 2.8 st) showed the shared 3 forcing `up` *larger* than the speaker's own
 * measured reach — the floor meant to protect tone legibility was instead
 * making Tone 1 harder to reach than an unfloored value would have. Legibility
 * at 2 is already the shipped default on the down side; nothing suggests the
 * up side is different.
 *
 * Dropped 2 → 1 (17 Aug 2026): a second real calibration measured a natural,
 * un-hesitant "flat, high ahh" sweep landing at chao ~2.5-3.8 against a 126Hz
 * centre — under 2 semitones for almost the whole sweep, so the floor was
 * still clamping Tone 1's target above what the speaker's own natural high
 * register produces. This is a genuine tone-1-sits-near-baseline case, not a
 * bad reading — see the analysis in the 17 Aug session. 1 is a smaller safety
 * net than 2, not zero: it still stops a near-flat sweep from collapsing the
 * board to a hair-trigger sliver.
 */
export const RANGE_UP_SEMITONES_MIN = 1;

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

/** Round to the nearest quarter-semitone and hold inside the tone-space bounds. */
function clampHalf(half: number, min = RANGE_SEMITONES_MIN): number {
  const rounded = Math.round(half * 4) / 4;
  return Math.min(RANGE_SEMITONES_MAX, Math.max(min, rounded));
}

/**
 * The fraction of a demonstrated reach that the tone space occupies. Split in
 * two (17 Aug 2026) because the two sweeps ask for different things and
 * needed different fixes.
 *
 * `_DOWN`: the low sweep still asks for a maximum reach ("as low as you
 * comfortably can"), which is much wider than the space Mandarin tones live
 * in — so it still needs real claw-back. Unchanged at the original measured
 * value; nothing here was implicated by the Tone 1 undershoot this split was
 * made for, and this side is left alone on purpose.
 *
 * `_UP`: the high sweep's *prompt* changed instead of just its multiplier —
 * it now asks for a natural, sustained "ahh" (the register Tone 1 itself
 * uses) rather than a maximum reach. Jane's own Tone 1 measures at chao 3.3
 * against her own voice — about +0.75 st above her conversational median —
 * which is a moderate lift, not a shout; asking players to reach as high as
 * comfortable and then clawing back 40% of it (the old shared 0.6) was
 * measuring the wrong thing and then correcting for having measured it.
 *
 * `_UP` is 1 (no claw-back) as a starting point: a real measurement (17 Aug
 * 2026, against the new prompt) showed high-sweep p90 at 2.8 st — already
 * inside the space real tones use, not an overshooting reach — so shrinking
 * it further was working against the fix, not for it. `_DOWN` stays a real
 * shrink because the low sweep's prompt is still "as low as you comfortably
 * can", a genuine reach.
 *
 * Both values are still flown, not derived — retune them in the Lab, not
 * here. `_UP` in particular has very little data behind it yet — one real
 * calibration — so treat 1 as a starting point to gather more data from, not
 * a settled number.
 */
export const REACH_TO_TONE_SPACE_UP = 1;
export const REACH_TO_TONE_SPACE_DOWN = 0.6;

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
 * `REACH_TO_TONE_SPACE_UP`/`_DOWN`.
 *
 * `reachUp`/`reachDown` default to the module constants but are accepted as
 * parameters rather than read internally, so a caller (`Calibration.tsx`) can
 * supply a live-tunable value from `game/tuning.ts` without this module
 * importing it — `src/pitch/` stays a pure, dependency-free layer that
 * `src/game/` builds on, never the reverse.
 *
 * Returns null when either sweep is too sparse to say anything.
 */
export function computeRangeHalvesFromExtremes(
  high: number[],
  low: number[],
  reachUp: number = REACH_TO_TONE_SPACE_UP,
  reachDown: number = REACH_TO_TONE_SPACE_DOWN,
): RangeHalves | null {
  if (high.length < 10 || low.length < 10) return null;
  const h = [...high].sort((a, b) => a - b);
  const l = [...low].sort((a, b) => a - b);
  // Scale first, clamp second: the bounds are on the board that gets played,
  // not on the reach that was measured.
  return {
    up: clampHalf(reachUp * percentile(h, 90), RANGE_UP_SEMITONES_MIN),
    down: clampHalf(reachDown * -percentile(l, 10), RANGE_DOWN_SEMITONES_MIN),
  };
}

/**
 * The preview-capture equivalent, for "Fit to what I just did": each half from
 * its own trimmed extreme rather than from half the span. Same trim rationale
 * as `computeRangeSemitones`, which this replaces on the player-facing path.
 *
 * ⚠ Deliberately *not* scaled by `REACH_TO_TONE_SPACE_UP`/`_DOWN`, and that is not an
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
    up: clampHalf(percentile(sorted, 100 - trimPercent), RANGE_UP_SEMITONES_MIN),
    down: clampHalf(-percentile(sorted, trimPercent), RANGE_DOWN_SEMITONES_MIN),
  };
}
