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
 *
 * Raised 1 → 2 (29 Aug 2026): the high input is no longer a near-flat "ahh"
 * sweep. Calibration now measures an actual Tone 1 (see `run.ts` tone-bucketed
 * `measuredRange`), and `up` is anchored off that T1 rather than a reach — so
 * the reason the floor was dropped to 1 (a sweep landing under 2 st) no longer
 * applies. 2 keeps the upper half from becoming a hair-trigger when a speaker's
 * T1 sits very close to baseline.
 */
export const RANGE_UP_SEMITONES_MIN = 2;

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
 * The fraction of a measured tone level that the board's half occupies. Both
 * are 1 (no claw-back) since 29 Aug 2026, and the reason is the same for each:
 * the inputs are no longer *reaches* but *actual tones* from the calibration
 * tutorial. `up` is anchored off the T1 gates, `down` off the T3 gates (see
 * `run.ts` `voicedByTone`), so there is no reach to shrink into a tone space —
 * the measurement already is one.
 *
 * History. These were split in two on 17 Aug 2026, when the down input was
 * still a "reach as low as you comfortably can" sweep that genuinely needed a
 * 0.6 claw-back, while the up input had already moved to a natural "ahh".
 * Removing the sweeps removed the last reach: an actual T3 floor must map to
 * chao 1, so clawing it back to 0.6 would leave the T3 corridor trough below
 * anything the speaker produced — a wall. `_DOWN` therefore joined `_UP` at 1.
 *
 * Both are still flown, not derived — the shipped values live in
 * `DEFAULT_TUNING` (`reachToToneSpaceUp`/`Down`) and are what production passes;
 * retune them in the Lab, not here. These module constants are the pure
 * function's defaults and are kept equal to the shipped tuning values.
 */
export const REACH_TO_TONE_SPACE_UP = 1;
export const REACH_TO_TONE_SPACE_DOWN = 1;

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

// ---------------------------------------------------------------------------
// Brief 44: the player's grid learns slowly in play (one ruler).
//
// The grid is the same rule as Jane's ruler (brief 43): chao 3 = the middle
// (median of the player's voiced tone-syllable frames, creak left out), chao 5
// = p90 of their first-tone frames, chao 1 = p10 of their third-tone frames.
// Calibration gives a first grid; after every *heard* gate the estimate is
// updated and the grid moves a small share of the way toward it.
//
// Pure: semitones in, grid out. All semitones here are relative to one fixed
// reference pitch (`refHz`, the calibrated middle), never to the grid's own
// moving middle, so the histograms do not shift when the grid does.
// ---------------------------------------------------------------------------

/** The player's grid: middle (st from refHz) and the two halves (st). */
export interface PlayerGrid {
  midSt: number;
  up: number;
  down: number;
}

/** How the grid learns. Every number comes from `tuning()` in the game. */
export interface GridLearnParams {
  /** Share of the gap between grid and estimate closed after each heard gate. */
  rate: number;
  /** Most the middle, the up half or the down half may move in one run (st, each). */
  maxStepPerRun: number;
  /** Hard limits for each half (st). */
  halfMin: number;
  halfMax: number;
  /** Frames a pool must have seen before its estimate may move the grid. */
  minFrames: number;
  /** Memory: each older gate fades by (1 - 1/memoryGates) when a new one is added to its pool. */
  memoryGates: number;
  /** Frames this many st under the grid middle are creak and left out. */
  creakSt: number;
  /** Percentiles of the first-tone and third-tone pools (90 and 10: the ruler rule). */
  topPct: number;
  bottomPct: number;
  /** Frames within this many st of the tracker's band edge are clamped and left out. */
  bandEdgeSt: number;
}

/** Histogram bins: GRID_BIN_ST wide, from -GRID_SPAN_ST to +GRID_SPAN_ST around refHz. */
export const GRID_BIN_ST = 0.25;
export const GRID_SPAN_ST = 36;
const GRID_BINS = Math.round((2 * GRID_SPAN_ST) / GRID_BIN_ST) + 1;

/** A weighted histogram of semitones. `frames` counts every frame ever added (no fading). */
export interface GridHist {
  w: number[];
  frames: number;
}

export interface GridLearnState {
  grid: PlayerGrid;
  /** All voiced frames of heard gates (middle). */
  all: GridHist;
  /** Frames of heard single-syllable first-tone gates (top). */
  t1: GridHist;
  /** Frames of heard single-syllable third-tone gates (bottom). */
  t3: GridHist;
  /** How far each value has moved in the current run (absolute st). */
  runMoved: { mid: number; up: number; down: number };
  /** Heard gates learned from, in total. */
  gates: number;
}

/** One resolved gate, as the learner sees it. */
export interface LearnGate {
  /** Voiced frames of the gate, st relative to refHz. */
  semitones: number[];
  /** The gate's tone if it is a single syllable, else null (pairs feed the middle only). */
  tone: 1 | 2 | 3 | 4 | null;
  /** False when the gate was "couldn't hear that" (hard rule 8): it teaches nothing. */
  heard: boolean;
  /** The tracker's band edges (st from refHz); frames at an edge are clamped. Optional. */
  bandLowSt?: number;
  bandHighSt?: number;
}

const emptyHist = (): GridHist => ({ w: new Array<number>(GRID_BINS).fill(0), frames: 0 });

export function newGridLearnState(grid: PlayerGrid): GridLearnState {
  return {
    grid: { ...grid },
    all: emptyHist(),
    t1: emptyHist(),
    t3: emptyHist(),
    runMoved: { mid: 0, up: 0, down: 0 },
    gates: 0,
  };
}

/** A new run starts: the per-run step budget is full again. */
export function startGridRun(s: GridLearnState): GridLearnState {
  return { ...s, runMoved: { mid: 0, up: 0, down: 0 } };
}

function binOf(st: number): number {
  return Math.min(GRID_BINS - 1, Math.max(0, Math.round((st + GRID_SPAN_ST) / GRID_BIN_ST)));
}

/**
 * Fades the old gates, then adds this gate's frames, one weight each. Frames,
 * not gates, are counted: the ruler is the median of frames (brief 43), and a
 * longer word (a pair) holds more of the voice than a short one.
 */
function addGate(h: GridHist, frames: number[], memoryGates: number): GridHist {
  const keep = memoryGates > 1 ? 1 - 1 / memoryGates : 0;
  const w = h.w.map((x) => x * keep);
  for (const s of frames) w[binOf(s)] += 1;
  return { w, frames: h.frames + frames.length };
}

/** Percentile of a histogram, linear inside the bin. Null when empty. */
export function histPercentile(h: GridHist, p: number): number | null {
  let total = 0;
  for (const x of h.w) total += x;
  if (!(total > 0)) return null;
  const target = (p / 100) * total;
  let cum = 0;
  for (let i = 0; i < h.w.length; i++) {
    const next = cum + h.w[i];
    if (h.w[i] > 0 && next >= target) {
      const within = (target - cum) / h.w[i]; // 0..1 across the bin
      return -GRID_SPAN_ST + (i - 0.5 + within) * GRID_BIN_ST;
    }
    cum = next;
  }
  return -GRID_SPAN_ST + (h.w.length - 1) * GRID_BIN_ST;
}

/** What the pools say the ruler is, or null per value while a pool is too small. */
export function gridEstimate(
  s: GridLearnState,
  p: Pick<GridLearnParams, "minFrames" | "topPct" | "bottomPct">,
): { midSt: number | null; topSt: number | null; bottomSt: number | null } {
  return {
    midSt: s.all.frames >= p.minFrames ? histPercentile(s.all, 50) : null,
    topSt: s.t1.frames >= p.minFrames ? histPercentile(s.t1, p.topPct) : null,
    bottomSt: s.t3.frames >= p.minFrames ? histPercentile(s.t3, p.bottomPct) : null,
  };
}

/** Moves `cur` a share of the way to `target`, inside what is left of this run's budget. */
function stepToward(cur: number, target: number, rate: number, used: number, budget: number): [number, number] {
  const want = rate * (target - cur);
  const left = Math.max(0, budget - used);
  const d = Math.sign(want) * Math.min(Math.abs(want), left);
  return [cur + d, used + Math.abs(d)];
}

/**
 * Learn from one resolved gate. An unheard gate returns the state unchanged.
 * A gate that hit a wall is still voice data and is learned from.
 */
export function learnGridFromGate(
  s: GridLearnState,
  gate: LearnGate,
  p: GridLearnParams,
): GridLearnState {
  if (!gate.heard) return s;
  const lo = gate.bandLowSt, hi = gate.bandHighSt;
  const frames = gate.semitones.filter(
    (x) =>
      Number.isFinite(x) &&
      x >= s.grid.midSt - p.creakSt &&
      (lo === undefined || x > lo + p.bandEdgeSt) &&
      (hi === undefined || x < hi - p.bandEdgeSt),
  );
  if (frames.length === 0) return s;

  const all = addGate(s.all, frames, p.memoryGates);
  const t1 = gate.tone === 1 ? addGate(s.t1, frames, p.memoryGates) : s.t1;
  const t3 = gate.tone === 3 ? addGate(s.t3, frames, p.memoryGates) : s.t3;
  const next: GridLearnState = { ...s, all, t1, t3, gates: s.gates + 1 };
  const est = gridEstimate(next, p);

  // The grid is three lines: middle, top (first-tone p90) and bottom
  // (third-tone p10). Top and bottom are anchors of their own: each moves only
  // toward its own pool's estimate, and holds still (in pitch) while its pool
  // is too small, even when the middle moves. The halves follow from the lines.
  const g0 = s.grid;
  let midSt = g0.midSt;
  let topSt = g0.midSt + g0.up;
  let bottomSt = g0.midSt - g0.down;
  let { mid: usedMid, up: usedUp, down: usedDown } = s.runMoved;
  if (est.midSt !== null) [midSt, usedMid] = stepToward(midSt, est.midSt, p.rate, usedMid, p.maxStepPerRun);
  if (est.topSt !== null) [topSt, usedUp] = stepToward(topSt, est.topSt, p.rate, usedUp, p.maxStepPerRun);
  if (est.bottomSt !== null) [bottomSt, usedDown] = stepToward(bottomSt, est.bottomSt, p.rate, usedDown, p.maxStepPerRun);
  const clampHalfTo = (x: number) => Math.min(p.halfMax, Math.max(p.halfMin, x));
  const up = clampHalfTo(topSt - midSt);
  const down = clampHalfTo(midSt - bottomSt);

  return {
    ...next,
    grid: { midSt, up, down },
    runMoved: { mid: usedMid, up: usedUp, down: usedDown },
  };
}

/** True once both anchor pools have enough frames to steer the halves. */
export function gridLearned(s: GridLearnState, minFrames: number): boolean {
  return s.t1.frames >= minFrames && s.t3.frames >= minFrames;
}
