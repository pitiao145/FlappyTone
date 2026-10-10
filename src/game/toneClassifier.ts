/**
 * Tone recognition — pure logic, standalone from scoring.
 * No Web Audio, no React, no canvas.
 *
 * Answers a narrower question than `scoring.ts` does: not "did this attempt
 * clear tone T's gate", but "which of the four tones does this shape most
 * resemble, independent of any target". A recognizer, not a grader — it
 * never sees or cares which tone the player was aiming for.
 *
 * Two stages, because the four tones are not equally far apart:
 *
 * 1. **Family, by shape.** Level (T1: tail flatness), dip-then-rise (T2 or
 *    T3: correlation with their averaged shapes) or fall (T4: correlation).
 *    These three shapes are genuinely different, and correlation against the
 *    averages separates them well.
 * 2. **T2 vs T3, by the dip itself.** Both dip then rise, so shape
 *    correlation alone kept calling close T2s "none" (72% of Jane's real T2
 *    clips named correctly, 28 Sep 2026). What separates them is how far the
 *    voice drops and how low it gets (T2 ~0.5 chao down to ~2.3, T3 ~1.5
 *    down to ~1.6) — the drop alone splits her 99 real T2/T3 clips 96%
 *    correctly, where the turning point's *timing* only manages 83%. See
 *    `t2t3Cue`.
 *
 * Every reference comes from `AVERAGED_TONE_SHAPE` (`src/game/toneAverages.ts`,
 * generated — see `src/dev/make-tone-averages.ts`): the correlation templates
 * and the T2/T3 cue's own anchor points are both read off the averages, so a
 * regenerated file moves them together with no hand-set chao values to keep
 * in sync. Check a change with `npm run classifier-check`.
 */

import type { Contour } from "./contours.ts";
import type { Tone } from "./gates.ts";
import { AVERAGED_TONE_SHAPE } from "./toneAverages.ts";
import { tuning } from "./tuning.ts";
import { classifyToneV2 } from "./toneClassifierV2.ts";

export type ClassifiedTone = Tone | "none";

export interface ToneClassification {
  tone: ClassifiedTone;
  /**
   * How well the shape matches its family (level / dip-rise / fall), 0..1.
   * For a T2 or T3 read this is the family's score, not the T2/T3 decision's
   * — that is `t2t3Cue`.
   */
  confidence: number;
  /**
   * The T2-vs-T3 vote, -1.5..1.5 (-1 = the T2 average, +1 = the T3 average), or
   * null when the shape isn't in the dip-rise family.
   */
  t2t3Cue: number | null;
  /**
   * Whether this read is sure enough to *cost the player* a heart when it
   * disagrees with the target (`isDrasticToneMismatch`). Always true for a
   * level/fall read (unchanged from before the T2/T3 cue existed). A T2/T3
   * read is decisive only when the vote clears `toneMismatchMinT23Cue`, no
   * single cue argues hard for the other tone (`toneMismatchMaxT23Dissent`),
   * and the dip wasn't lost to a voicing gap (`toneMismatchMaxGapMs`).
   */
  decisive: boolean;
}

/** Points sampled across each shape's own progress, for comparison. */
const RESAMPLE_POINTS = 16;

/**
 * Drops the first `trimFraction` of the contour's own span (by time, not
 * sample count) — a small cut (see `toneClassifierOnsetTrimFraction`'s
 * default), meant only to clear a click or brief silence right at the very
 * start, not a real chunk of the tone. A larger shared trim here risked
 * shaving into genuine early signal (T3's dip starts early); the tones that
 * need more protection from a slow onset ramp get their own dedicated
 * window in `classifyTone` instead (T1's tail-only judging window) rather
 * than a bigger blanket cut applied to everything.
 *
 * Falls back to the untrimmed points if trimming would leave fewer than 2
 * (a very short utterance) — better to classify on the full noisy shape than
 * to have nothing left at all.
 */
export function trimOnset(
  points: { tMs: number; chao: number }[],
  trimFraction: number,
): { tMs: number; chao: number }[] {
  if (points.length < 2) return points;
  const startT = points[0].tMs;
  const endT = points[points.length - 1].tMs;
  const cutoff = startT + (endT - startT) * trimFraction;
  const trimmed = points.filter((p) => p.tMs >= cutoff);
  return trimmed.length >= 2 ? trimmed : points;
}

/**
 * Resamples `points` at `n` evenly spaced progress values across their own
 * span — `points[0].tMs` to `points[last].tMs`, *not* assumed to start at 0,
 * since `trimOnset` may have dropped everything before some cutoff —
 * linearly interpolating between the two nearest recorded points.
 * Time-normalized to the contour's *own* duration, not any external clock —
 * a shape said faster or slower resamples to the same `n`-length vector
 * either way, which is what makes correlation against a fixed-duration
 * template meaningful.
 */
export function resample(points: { tMs: number; chao: number }[], n: number): number[] {
  const startMs = points[0].tMs;
  const lastMs = points[points.length - 1].tMs;
  const span = lastMs - startMs;
  if (span <= 0) return new Array(n).fill(points[0].chao);

  const out: number[] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const targetMs = startMs + (k / (n - 1)) * span;
    while (i < points.length - 2 && points[i + 1].tMs < targetMs) i++;
    const a = points[i];
    const b = points[i + 1] ?? a;
    const segSpan = b.tMs - a.tMs;
    const frac = segSpan <= 0 ? 0 : (targetMs - a.tMs) / segSpan;
    out.push(a.chao + (b.chao - a.chao) * frac);
  }
  return out;
}

/**
 * Resamples a fixed, evenly-spaced-over-[0,1] array (`AVERAGED_TONE_SHAPE`'s
 * 61 values) down to `n` points, linearly interpolating by index. Kept
 * separate from `resample` above: this operates on an already time-
 * normalized array with no timestamps, decoupling the classifier's own
 * resolution (`RESAMPLE_POINTS`) from however many samples the baked file
 * happens to store.
 */
export function resampleFixed(values: number[], n: number): number[] {
  const lastIdx = values.length - 1;
  return Array.from({ length: n }, (_, k) => {
    const idx = (k / (n - 1)) * lastIdx;
    const i0 = Math.floor(idx);
    const i1 = Math.min(lastIdx, i0 + 1);
    const frac = idx - i0;
    return values[i0] + (values[i1] - values[i0]) * frac;
  });
}

/** Pearson correlation between two equal-length vectors. Null if either has zero variance. */
export function correlation(a: number[], b: number[]): number | null {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
}

/** Points the T2/T3 cue measures over — finer than the correlation's 16, since it reads a single low point. */
const CUE_POINTS = 40;

interface DropShape {
  /** The highest point before the dip, on a 3-point moving average so one noisy frame can't set it. */
  start: number;
  /** The low point, searched away from the very edges. */
  min: number;
  /** start − min: how far the voice drops before turning. */
  drop: number;
  /** drop / (drop + rise): the drop's share of the whole movement, scale-free. */
  dropShare: number;
  /** Where the low point falls, 0..1 of the contour. */
  lowTime: number;
  /** Share of the contour in the bottom third of its own range. */
  dwell: number;
}

/**
 * A rise this large at the very start is an onset artefact, not part of the
 * tone: neither T2 (35) nor T3 (214) begins by climbing. A scoop up into the
 * first syllable, or a pitch-tracker onset transient, both look like this.
 */
const ONSET_RISE_CHAO = 0.5;
/** …and only within this share of the span. */
const ONSET_RISE_WITHIN = 0.25;

/**
 * The drop before the turning point, measured the same way on a player's
 * contour and on an averaged shape (so the averages can anchor the cue).
 *
 * Runs on the *untrimmed* contour: a real T3 can fall to the floor within
 * its first tenth and hold there (the 25 Aug 2026 Lab case pinned in the
 * tests), so the classifier's shared onset trim would cut away the very drop
 * this measures. The onset is protected differently — a leading rise larger
 * than `ONSET_RISE_CHAO` is skipped, see above.
 *
 * The low point is searched between 5% and 90% of the span; the last 10% can
 * hold a final creak or trail-off that is not the tone's turning point.
 * `start` is the highest point between the onset and the low point, on a
 * 3-point moving average so one noisy frame can't set it.
 */
function dropShape(sample: number[]): DropShape {
  const n = sample.length;
  const edge = Math.max(1, Math.round(n * 0.1));
  let minIdx = Math.round(n * 0.05);
  for (let i = minIdx; i < n - edge; i++) if (sample[i] < sample[minIdx]) minIdx = i;
  const min = sample[minIdx];

  let from = 0;
  let peak = 0;
  while (peak < minIdx && sample[peak + 1] >= sample[peak]) peak++;
  if (peak <= n * ONSET_RISE_WITHIN && sample[peak] - sample[0] > ONSET_RISE_CHAO) {
    from = Math.min(minIdx, peak + 1);
  }
  let start = sample[from];
  for (let i = from; i <= minIdx; i++) {
    const lo = Math.max(from, i - 1);
    const hi = Math.min(minIdx, i + 1);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += sample[j];
    start = Math.max(start, sum / (hi - lo + 1));
  }
  const rise = Math.max(...sample.slice(minIdx)) - min;
  const drop = Math.max(0, start - min);
  const range = Math.max(...sample) - Math.min(...sample);
  return {
    start,
    min,
    drop,
    dropShare: drop / Math.max(1e-6, drop + rise),
    lowTime: minIdx / Math.max(1, n - 1),
    dwell: sample.filter((v) => v <= min + range / 3).length / n,
  };
}

interface CueAnchors {
  drop: [number, number];
  low: [number, number];
  dropShare: [number, number];
  lowTime: [number, number];
  dwell: [number, number];
  /** 1 − corr(T2 average, T3 average): scales the correlation vote to ±1 at each average. */
  shapeSpread: number;
}

const anchorCache = new WeakMap<Record<Tone, number[]>, CueAnchors>();

/**
 * The T2 and T3 averages' own drop measurements — the cue's -1 and +1.
 * Measured through the same resample as a live contour, so an attempt
 * identical to an average votes exactly ±1 on the drop cues.
 */
function cueAnchors(templates: Record<Tone, number[]>): CueAnchors {
  const cached = anchorCache.get(templates);
  if (cached) return cached;
  const d2 = dropShape(resampleFixed(templates[2], CUE_POINTS));
  const d3 = dropShape(resampleFixed(templates[3], CUE_POINTS));
  const r = correlation(
    resampleFixed(templates[2], RESAMPLE_POINTS),
    resampleFixed(templates[3], RESAMPLE_POINTS),
  );
  const anchors: CueAnchors = {
    drop: [d2.drop, d3.drop],
    low: [d2.min, d3.min],
    dropShare: [d2.dropShare, d3.dropShare],
    lowTime: [d2.lowTime, d3.lowTime],
    dwell: [d2.dwell, d3.dwell],
    shapeSpread: Math.max(0.05, 1 - (r ?? 0)),
  };
  anchorCache.set(templates, anchors);
  return anchors;
}

/**
 * How far one vote may go past an average. Capped so a single extreme cue
 * (a very low dip from a miscalibrated board, say) can't outvote the other
 * three on its own — 1.5 held the fewest wrongful wall hits across the
 * stress variants `npm run classifier-check` runs (28 Sep 2026).
 */
const VOTE_CAP = 1.5;

/** Where `value` sits on the line from `t2` (-1) to `t3` (+1), capped at ±VOTE_CAP. */
function vote(value: number, [t2, t3]: [number, number]): number {
  const half = (t3 - t2) / 2;
  if (Math.abs(half) < 1e-6) return 0;
  return Math.max(-VOTE_CAP, Math.min(VOTE_CAP, (value - (t2 + t3) / 2) / half));
}

/**
 * The T2-vs-T3 vote: negative = T2, positive = T3, ±1 = exactly like that
 * tone's average. The mean of four votes, each anchored on the averages, so
 * no two cues have to agree for a read and no single one decides it:
 *
 * - **drop** (chao): how far the voice falls before turning. The strongest
 *   single cue on Jane's word clips (96%), but not on its own: the textbook
 *   214 Tone 3 — and the fallback corridor measured from `jane_ma3` — starts
 *   near chao 2 and only drops ~1, right on the midpoint.
 * - **low point** (chao): how low the dip goes. T3 bottoms out near 1.6, T2
 *   around 2.3. Absolute height, but this is the one height the game
 *   calibrates directly: the board's lower half is anchored on the player's
 *   own measured Tone 3 floor (PRD §5.4). It rescues the 214 shape above.
 * - **drop share**: the drop over the whole movement. Scale-free, so it
 *   steadies a shallow or miscalibrated attempt where the two chao cues
 *   would drift.
 * - **shape**: which averaged shape correlates better — the old evidence,
 *   kept as one voice among four rather than the whole decision.
 *
 * Timing (where the low point falls) was measured and left out: it
 * separates Jane's T2/T3 only 83% of the time and made every combination
 * worse — her turning point moves around more than her drop does.
 */
function t2t3Cue(
  sample: number[],
  c2: number,
  c3: number,
  templates: Record<Tone, number[]>,
): { cue: number; strongestDissent: number } {
  const anchors = cueAnchors(templates);
  const d = dropShape(sample);
  const votes = [
    vote(d.drop, anchors.drop),
    vote(d.min, anchors.low),
    vote(d.dropShare, anchors.dropShare),
    Math.max(-VOTE_CAP, Math.min(VOTE_CAP, (c3 - c2) / anchors.shapeSpread)),
  ];
  if (tuning().toneClassifierLowTimeVote) votes.push(vote(d.lowTime, anchors.lowTime));
  if (tuning().toneClassifierDwellVote) votes.push(vote(d.dwell, anchors.dwell));
  const cue = votes.reduce((s, v) => s + v, 0) / votes.length;
  // How hard the most contrary vote pulls the other way — 0 when all agree.
  const strongestDissent = Math.max(0, ...votes.map((v) => -Math.sign(cue) * v));
  return { cue, strongestDissent };
}

/**
 * The T2-vs-T3 vote for any contour, whatever family it would classify as —
 * the same measurement `classifyTone` uses inside the dip-rise family.
 * Exported for `toneAccuracy.ts`, which scores how T3-like a T3 attempt is
 * (and how T2-like a T2 one) with the cue that actually separates them.
 * Null with fewer than 2 points.
 */
export function t2t3CueOf(
  contour: Contour,
  templates: Record<Tone, number[]> = AVERAGED_TONE_SHAPE.textbook,
): number | null {
  if (contour.points.length < 2) return null;
  const trimmed = trimOnset(contour.points, tuning().toneClassifierOnsetTrimFraction);
  const sample = resample(trimmed, RESAMPLE_POINTS);
  const corr = (tone: Tone): number => {
    const r = correlation(sample, resampleFixed(templates[tone], RESAMPLE_POINTS));
    return r === null ? 0 : Math.min(1, Math.max(0, r));
  };
  return t2t3Cue(resample(contour.points, CUE_POINTS), corr(2), corr(3), templates).cue;
}

/** Longest gap between consecutive voiced points — where creak went unvoiced. */
function longestGapMs(points: { tMs: number }[]): number {
  let gap = 0;
  for (let i = 1; i < points.length; i++) gap = Math.max(gap, points[i].tMs - points[i - 1].tMs);
  return gap;
}

/**
 * Which of the four tones `contour` most resembles, or `"none"` if it
 * doesn't resemble any of them well enough, or is too close a call to say.
 * Null only when there isn't enough signal to say anything at all (fewer than
 * 2 points) — the same "not enough evidence" posture `heardUtterance` takes
 * in `scoring.ts`.
 *
 * The onset trim is deliberately small (`toneClassifierOnsetTrimFraction`,
 * default 5%) — just enough to drop a click at the very start. Tone 1 gets
 * its own window instead: only the last `toneClassifierT1TailFraction` of the
 * sample, where the voice has settled, is judged for flatness.
 *
 * Stage 1 picks the family — level (T1), dip-rise (the better of T2/T3's
 * correlation) or fall (T4) — and the winner must clear
 * `toneClassifierMinConfidence` and beat the runner-up family by
 * `toneClassifierMarginThreshold`. Stage 2, for a dip-rise winner only,
 * names T2 or T3 from `t2t3Cue`, or "none" inside
 * `toneClassifierT23DeadZone`.
 */
export function classifyTone(
  contour: Contour,
  /**
   * The per-tone reference shapes. Always the baked averages in the game; a
   * parameter so `src/dev/classifier-check.ts` can compare the committed
   * averages against freshly computed ones in one run.
   */
  templates: Record<Tone, number[]> = AVERAGED_TONE_SHAPE.textbook,
): ToneClassification | null {
  return tuning().toneClassifierV2 ? classifyToneV2(contour) : classifyToneV1(contour, templates);
}

/** Version 1 (correlation with Jane's averages), kept while v2 is evaluated. */
export function classifyToneV1(
  contour: Contour,
  templates: Record<Tone, number[]> = AVERAGED_TONE_SHAPE.textbook,
): ToneClassification | null {
  if (contour.points.length < 2) return null;

  const trimmed = trimOnset(contour.points, tuning().toneClassifierOnsetTrimFraction);
  const sample = resample(trimmed, RESAMPLE_POINTS);

  const tailStart = Math.floor(
    RESAMPLE_POINTS * (1 - tuning().toneClassifierT1TailFraction),
  );
  const t1Window = sample.slice(tailStart);
  const t1Excursion = Math.max(...t1Window) - Math.min(...t1Window);
  const level =
    1 - Math.min(1, Math.max(0, t1Excursion / tuning().toneClassifierFlatnessScaleChao));

  const corr = (tone: Tone): number => {
    const r = correlation(sample, resampleFixed(templates[tone], RESAMPLE_POINTS));
    return r === null ? 0 : Math.min(1, Math.max(0, r));
  };
  const c2 = corr(2);
  const c3 = corr(3);
  const fall = corr(4);
  const dipRise = Math.max(c2, c3);

  const families = [
    { family: "level" as const, score: level },
    { family: "dipRise" as const, score: dipRise },
    { family: "fall" as const, score: fall },
  ].sort((a, b) => b.score - a.score);
  const [best, runnerUp] = families;

  // Too weak a match to anything, or a near-tie between two families: an
  // ambiguous attempt, not a confident read of the winner.
  if (
    best.score < tuning().toneClassifierMinConfidence ||
    best.score - runnerUp.score < tuning().toneClassifierMarginThreshold
  ) {
    return { tone: "none", confidence: best.score, t2t3Cue: null, decisive: false };
  }
  if (best.family === "level") return { tone: 1, confidence: best.score, t2t3Cue: null, decisive: true };
  if (best.family === "fall") return { tone: 4, confidence: best.score, t2t3Cue: null, decisive: true };

  const { cue, strongestDissent } = t2t3Cue(resample(contour.points, CUE_POINTS), c2, c3, templates);
  if (Math.abs(cue) < tuning().toneClassifierT23DeadZone) {
    return { tone: "none", confidence: best.score, t2t3Cue: cue, decisive: false };
  }
  return {
    tone: cue > 0 ? 3 : 2,
    confidence: best.score,
    t2t3Cue: cue,
    decisive:
      Math.abs(cue) >= tuning().toneMismatchMinT23Cue &&
      strongestDissent < tuning().toneMismatchMaxT23Dissent &&
      longestGapMs(trimmed) < tuning().toneMismatchMaxGapMs,
  };
}
