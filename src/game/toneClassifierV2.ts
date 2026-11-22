/**
 * Tone recognition, version 2 — pure logic, no Web Audio, no React.
 *
 * Same question and same result type as `classifyTone` (v1), answered
 * without correlating against Jane's averaged shapes. Her T2 and T3 averages
 * correlate 0.73 with each other, so "which average does it look like" is a
 * weak question exactly where the game needs a strong one. v2 measures the
 * shape directly, on REAL time (not stretched to a fixed length), using the
 * cues the phonetics literature names for Mandarin tones:
 *
 * - **T1, level:** a flat tail AND a high one. A flat line under chao 3 is
 *   not a Tone 1, however flat (`toneV2T1MinChao`).
 * - **T4, fall:** a large fall from a HIGH early peak (chao 4–5) with no real
 *   rise after it. The same fall from mid board (3–4) is a falling-only T3
 *   (`toneV2T4MinPeakChao`).
 * - **T2 / T3, dip then rise:** separated by six votes, each a fixed
 *   threshold pair (`toneV2T23Anchors`), not an average:
 *   - `turnTime`: when the low point comes (Shen & Lin 1991, Moore &
 *     Jongman 1997: the main perceptual cue). T2 turns early, T3 late.
 *   - `riseShare`: share of the syllable spent rising after the turn. A T2
 *     rises through most of the syllable; a T3 rises only at the end.
 *   - `riseRate`: rise speed, chao per second. A T3's rise is short and
 *     steep; a T2's long and gradual.
 *   - `drop`: how far the voice falls before the turn (ΔF0, the other
 *     literature cue).
 *   - `dropShare`: drop over drop + rise — scale-free, survives a
 *     miscalibrated range.
 *   - `low`: how low the dip goes. The one absolute height, and the one the
 *     game calibrates directly (the board's floor is the player's own T3).
 *
 * Anchors were placed between the medians of Jane's textbook and natural
 * clips (`fixtures/contours/*`) — thresholds, so one unusual clip cannot move
 * them the way it moves an average. Check with
 * `npm run classifier-check -- <contours.json> --v2`.
 */

import type { Contour } from "./contours.ts";
import type { ToneClassification } from "./toneClassifier.ts";
import { tuning } from "./tuning.ts";
import type { SpeechStyle } from "./words.ts";

type VoteKey = "turnTime" | "riseShare" | "riseRate" | "drop" | "dropShare" | "low";
const VOTE_KEYS: VoteKey[] = ["turnTime", "riseShare", "riseRate", "drop", "dropShare", "low"];

/**
 * Every threshold the reader uses, as one set. Two sets exist: the old board
 * (the `toneV2*` fields, shipped) and the one ruler (`toneReaderRuler`, brief
 * 45), picked by `tuning().playerRulerV2`. The ruler set was fitted on half of
 * Jane's clips on her one ruler (brief 43) and checked on the other half.
 */
export interface ToneReaderSettings {
  /** A tail whose mean sits at or under this chao is never a Tone 1. */
  t1MinChao: number;
  /** A flat line shorter than this is a fragment, never a Tone 1. */
  t1MinMs: number;
  /**
   * A T1 read whose tail sits at or under this chao names T1 but is not
   * decisive: a level line under the middle may be a T1 on a grid that sits
   * too high, or a learner's low held T3. Null: no such test (old board).
   */
  t1DecisiveMinChao: number | null;
  /** Tail range (chao) at which a T1's flatness reaches 0. */
  flatnessScaleChao: number;
  /** A whole-contour movement (chao) above this starts to rule out a T1; gone 1 chao later. */
  t1StillChao: number;
  maxWiggle: number;
  /** A T2/T3 read can cost a heart only past this mean vote... */
  minT23Cue: number;
  /** ...and only when no single vote points the other way by this much or more. */
  maxT23Dissent: number;
  /**
   * ...and only when the read survives the grid errors the game is known to
   * have: the line moved up and down by `shiftChao`, and stretched about the
   * middle (chao 3) by each factor in `scales`. Null: no such test (old board).
   */
  t23Stability: { shiftChao: number; scales: number[] } | null;
  /**
   * A T2 read whose low sits at or under this chao is not decisive: the dip
   * ran off the bottom line, so its real depth is unknown (a cut-off T3 dip
   * looks like a T2's). Null: no such test (old board).
   */
  t2FloorChao: number | null;
  /**
   * When true, a T2/T3 read after a skipped onset scoop is not decisive: the
   * drop is then measured from the scoop's own tail, so the drop votes and the
   * turn time rest on the scoop, not the tone. False on the old board, whose
   * absolute \`low\` vote outweighed them.
   */
  t23ScoopNotDecisive: boolean;
  /**
   * How a T4 is told from a falling-only T3: its fall starts at or above
   * `t4MinPeakChao` (an absolute height) AND is at least `t4MinFallChao`
   * deep (a size). Each test is full half a chao past its value; null turns
   * it off. The old board uses the peak only.
   */
  t4MinPeakChao: number | null;
  t4MinFallChao: number | null;
  /**
   * A T4 read whose fall starts at or under this chao names T4 but is not
   * decisive: a fall from around the middle may be a T4 on a grid that sits
   * too high, or a learner's falling-only T3. Null: no such test (old board).
   */
  t4DecisiveMinPeakChao: number | null;
  /** A dip-rise needs a rise bigger than this (chao) before it scores at all; full 1.2 chao later. */
  dipRiseMinChao: number;
  anchors: Record<VoteKey, [number, number]>;
  /** The T2/T3 votes that count (the anchors of the rest are still read by the floor-start test). */
  votes: VoteKey[];
  /** The "judged on depth alone" rule in `t2t3Cue`. It reads the absolute `low`. */
  floorRule: boolean;
  /**
   * Natural style only (brief 49): a fall of at least `minFallChao` that ends
   * on the bottom line (low at or under `maxLowChao`) with no rise back is a
   * low third tone (the everyday half-third), even when the fall is too short
   * for the usual low-fall test. Never decisive. Null: no such rule.
   */
  lowHoldT3: { minFallChao: number; maxLowChao: number } | null;
}

export function readerSettings(): ToneReaderSettings {
  const t = tuning();
  if (t.playerRulerV2) return t.toneReaderRuler;
  return {
    t1MinChao: t.toneV2T1MinChao,
    t1MinMs: t.toneV2T1MinMs,
    t1DecisiveMinChao: null,
    flatnessScaleChao: t.toneClassifierFlatnessScaleChao,
    t1StillChao: 1,
    maxWiggle: t.toneV2MaxWiggle,
    minT23Cue: t.toneV2MinT23Cue,
    maxT23Dissent: t.toneMismatchMaxT23Dissent,
    t23Stability: null,
    t2FloorChao: null,
    t23ScoopNotDecisive: false,
    t4MinPeakChao: t.toneV2T4MinPeakChao,
    t4MinFallChao: null,
    t4DecisiveMinPeakChao: null,
    dipRiseMinChao: 0.4,
    anchors: t.toneV2T23Anchors,
    votes: VOTE_KEYS,
    floorRule: true,
    lowHoldT3: null,
  };
}

/** Real-time resolution the features are read at. */
const POINTS = 40;
/** A leading rise this big within the first quarter is an onset scoop, skipped. */
const ONSET_RISE_CHAO = 0.5;
/** Where the low-point search starts, as a share of the contour. */
const LOW_SEARCH_FROM = 0.12;
/** Frames within this of the low count as still on the floor. */
const TURN_BAND_CHAO = 0.1;

export interface ToneFeatures {
  durMs: number;
  /** The middle of the low stretch, 0..1 of the contour. */
  turnTime: number;
  /** Highest point before the low (onset scoop skipped). */
  start: number;
  low: number;
  drop: number;
  /** Highest point after the low, minus the low. */
  rise: number;
  /** Share of the contour from the turn to 80% of the rise. */
  riseShare: number;
  /** rise × 0.8 / time to reach it, chao per second. */
  riseRate: number;
  dropShare: number;
  /** Mean and max − min of the tail (last `toneClassifierT1TailFraction`). */
  tailMean: number;
  tailExcursion: number;
  /** Peak in the first 60%, minus the lowest point after it. */
  fall: number;
  /** That peak's height: a T4 falls from high (4–5), a falling-only T3 from mid (3–4). */
  fallPeak: number;
  /** Total movement over the range: ~1–2 for a real tone, far more for a zigzag. */
  wiggle: number;
  /** True when a leading onset scoop was skipped before `start` was read. */
  onsetScoop: boolean;
}

function resampleReal(points: { tMs: number; chao: number }[]): number[] {
  const t0 = points[0].tMs;
  const span = points[points.length - 1].tMs - t0;
  const out: number[] = [];
  let i = 0;
  for (let k = 0; k < POINTS; k++) {
    const t = t0 + (k / (POINTS - 1)) * span;
    while (i < points.length - 2 && points[i + 1].tMs < t) i++;
    const a = points[i];
    const b = points[i + 1] ?? a;
    const f = b.tMs === a.tMs ? 0 : (t - a.tMs) / (b.tMs - a.tMs);
    out.push(a.chao + (b.chao - a.chao) * f);
  }
  // 3-point moving average: one noisy frame must not set a peak or a low.
  return out.map((_, k) => {
    let sum = 0;
    let n = 0;
    for (let j = k - 1; j <= k + 1; j++) {
      if (j >= 0 && j < POINTS) {
        sum += out[j];
        n++;
      }
    }
    return sum / n;
  });
}

/** Null with fewer than 2 points or no duration. */
export function toneFeatures(contour: Contour): ToneFeatures | null {
  const pts = contour.points;
  if (pts.length < 2) return null;
  const durMs = pts[pts.length - 1].tMs - pts[0].tMs;
  if (durMs <= 0) return null;
  const s = resampleReal(pts);
  const n = s.length;

  // Low point, away from the very edges: a final creak is not the turn, and
  // a two-frame onset glitch is not the dip (a 好 hǎo whose first frames
  // dipped to 1.0 before the real T3 fall read as a floor-start T2).
  let lowIdx = Math.round(n * LOW_SEARCH_FROM);
  for (let i = lowIdx; i < n - Math.round(n * 0.1); i++) if (s[i] < s[lowIdx]) lowIdx = i;
  const low = s[lowIdx];

  let from = 0;
  let peak = 0;
  while (peak < lowIdx && s[peak + 1] >= s[peak]) peak++;
  if (peak <= n * 0.25 && s[peak] - s[0] > ONSET_RISE_CHAO) from = Math.min(lowIdx, peak + 1);
  const start = Math.max(...s.slice(from, lowIdx + 1));

  const rise = Math.max(...s.slice(lowIdx)) - low;
  const drop = Math.max(0, start - low);
  // The turn is the middle of the floor stretch, not the first frame that
  // touches it: a T3 that falls fast, holds low and rises late turns late.
  // The middle beat both ends on Jane's T2/T3 clips (rise share 96% alone).
  let first = lowIdx;
  while (first > 0 && s[first - 1] <= low + TURN_BAND_CHAO) first--;
  let last = lowIdx;
  while (last < n - 1 && s[last + 1] <= low + TURN_BAND_CHAO) last++;
  const turnIdx = Math.round((first + last) / 2);
  let r80 = turnIdx;
  while (r80 < n - 1 && s[r80] < low + 0.8 * rise) r80++;
  const riseShare = (r80 - turnIdx) / (n - 1);
  const riseRate = (0.8 * rise) / Math.max(0.03, (riseShare * durMs) / 1000);

  const tail = s.slice(Math.floor(n * (1 - tuning().toneClassifierT1TailFraction)));
  const tailMean = tail.reduce((a, b) => a + b, 0) / tail.length;
  const tailExcursion = Math.max(...tail) - Math.min(...tail);

  const early = s.slice(0, Math.ceil(n * 0.6));
  const peakIdx = early.indexOf(Math.max(...early));
  const fall = s[peakIdx] - Math.min(...s.slice(peakIdx));

  return {
    durMs,
    turnTime: turnIdx / (n - 1),
    start,
    low,
    drop,
    rise,
    riseShare,
    riseRate,
    dropShare: drop / Math.max(1e-6, drop + rise),
    tailMean,
    tailExcursion,
    fall,
    fallPeak: s[peakIdx],
    wiggle: s.reduce((a, v, i) => (i ? a + Math.abs(v - s[i - 1]) : 0), 0) /
      Math.max(0.3, Math.max(...s) - Math.min(...s)),
    onsetScoop: from > 0,
  };
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Family scores, 0..1 each. Exported for tests and the check tool. */
export function familyScores(f: ToneFeatures, style: SpeechStyle = "textbook"): {
  level: number;
  dipRise: number;
  fall: number;
  lowFall: number;
} {
  const r = readerSettings();
  const flat = 1 - clamp01(f.tailExcursion / r.flatnessScaleChao);
  // Height: 0 at or under the floor, full half a chao above it.
  const high = clamp01((f.tailMean - r.t1MinChao) / 0.5);
  // A whole-contour movement bigger than a T1 ever has also rules it out.
  const still = 1 - clamp01((Math.max(f.drop, f.rise, f.fall) - r.t1StillChao) / 1);
  // A T1 is a HELD level. A flat line shorter than this is a fragment (only
  // the top of a rise heard, say), never a T1. Falls may be quick — Jane's
  // natural 是 shì is 255ms — so the length rule is for T1 only.
  const held = f.durMs >= r.t1MinMs ? 1 : 0;
  const level = flat * high * still * held;

  // A fall: a big drop from an early peak, little of it won back. Split by
  // where it starts: a T4 falls from high (Jane: median 4.75 textbook, 4.3
  // natural), a falling-only T3 — the "half third" heard in running speech —
  // from mid board (median 3.4). Full T4 at `t4MinChao` + 0.5. On the one
  // ruler the fall must also be deep (`t4MinFallChao`).
  const fallShape = clamp01((f.fall - f.rise - 0.4) / 1.2);
  const past = (v: number, min: number | null) => (min === null ? 1 : clamp01((v - min) / 0.5));
  const highStart = Math.min(past(f.fallPeak, r.t4MinPeakChao), past(f.fall, r.t4MinFallChao));
  const fall = fallShape * highStart;
  let lowFall = fallShape * (1 - highStart);
  // A natural third tone that only goes low: short fall, ends on the floor.
  const lh = r.lowHoldT3;
  if (style === "natural" && lh && f.low <= lh.maxLowChao) {
    lowFall = Math.max(lowFall, clamp01((f.fall - f.rise - lh.minFallChao) / 0.4) * (1 - highStart));
  }

  // Dip-rise: a real rise after the low, at least as big as most of the drop.
  const dipRise = clamp01((f.rise - r.dipRiseMinChao) / 1.2) * clamp01(f.rise / Math.max(0.3, 0.6 * f.drop));

  return { level, dipRise, fall, lowFall };
}

const VOTE_CAP = 1.5;
/** A family winning by this much keeps its full score as confidence. */
const FAMILY_CLEAR_MARGIN = 0.6;
/** A start within this of the low point counts as starting on the floor. */
const FLOOR_START_MAX_FALL = 0.6;
/** Summed T2/T3 evidence of 1 ≈ 82%, 2 ≈ 95%. */
const T23_EVIDENCE_SLOPE = 1.5;

/** Every T2/T3 vote: -1 at the T2 anchor, +1 at the T3 anchor, capped ±1.5. */
export function t2t3Votes(f: ToneFeatures): Record<VoteKey, number> {
  const anchors = readerSettings().anchors;
  const out = {} as Record<VoteKey, number>;
  for (const key of VOTE_KEYS) {
    const [t2, t3] = anchors[key];
    const half = (t3 - t2) / 2;
    out[key] = Math.max(-VOTE_CAP, Math.min(VOTE_CAP, (f[key] - (t2 + t3) / 2) / half));
  }
  return out;
}

/**
 * The T2/T3 vote: the mean of the six votes, then the floor rule.
 *
 * Floor rule: a dip that stays clearly above the T3 floor (`low` vote
 * ≤ -0.5, about chao 2.05+), with no T3-sized drop (`drop` vote < 0.5) and
 * no clearly late turn (`turnTime` vote < 0.6), is judged on depth alone —
 * timing cannot make it a T3. Without it, a mid-turning T2 with a steep rise
 * read T3: Pierre's 9 Oct 2026 attempt and Jane's own line for that word,
 * both pinned in the tests. The late-turn gate keeps shallow natural T3s
 * (很 hen3, 女 nv3: low ~2.2, turn clearly late) reading T3.
 * Weighting depth above timing and merging the two rise votes were both
 * tried and lost natural T3s.
 */
export function t2t3Cue(f: ToneFeatures): { cue: number; votes: number[]; floorStart: boolean } {
  const v = t2t3Votes(f);
  const r = readerSettings();
  // Floor start: a T3 may begin AT its low point and only rise (好 hǎo said
  // low, then up). There is no fall to measure, so the two drop votes are
  // not evidence for T2 — leave them out when the voice starts on a deep
  // floor (`low` vote ≥ 0.8, about chao 1.65 or lower).
  const floorStart = f.start - f.low < FLOOR_START_MAX_FALL && v.low >= 0.8;
  const votes = r.votes
    .filter((k) => !(floorStart && (k === "drop" || k === "dropShare")))
    .map((k) => v[k]);
  let cue = votes.reduce((a, b) => a + b, 0) / votes.length;
  if (r.floorRule && v.low <= -0.5 && v.drop < 0.5 && v.turnTime < 0.6 && cue > 0) cue = (v.low + v.drop) / 2;
  return { cue, votes, floorStart };
}

/**
 * True when the T2/T3 cue keeps its sign on every moved copy of the contour
 * (`ToneReaderSettings.t23Stability`). A read that flips when the grid is a
 * little off rests on the grid, not on the voice: it may name a tone, but it
 * must not cost a heart (hard rule 8).
 */
function t23Stable(contour: Contour, cue: number, r: ToneReaderSettings): boolean {
  const st = r.t23Stability;
  if (!st) return true;
  const moves: ((c: number) => number)[] = [
    (c) => c + st.shiftChao,
    (c) => c - st.shiftChao,
    ...st.scales.map((k) => (c: number) => 3 + (c - 3) * k),
  ];
  for (const move of moves) {
    const points = contour.points.map((p) => ({ tMs: p.tMs, chao: Math.min(5, Math.max(1, move(p.chao))) }));
    const f = toneFeatures({ ...contour, points });
    if (!f) return false;
    const moved = t2t3Cue(f).cue;
    if (Math.sign(moved) !== Math.sign(cue)) return false;
  }
  return true;
}

function longestGapMs(points: { tMs: number }[]): number {
  let gap = 0;
  for (let i = 1; i < points.length; i++) gap = Math.max(gap, points[i].tMs - points[i - 1].tMs);
  return gap;
}

/** `style`: the speech style of the word being read; "natural" turns on the natural-only rules. */
export function classifyToneV2(contour: Contour, style: SpeechStyle = "textbook"): ToneClassification | null {
  const f = toneFeatures(contour);
  if (!f) return null;
  const t = tuning();
  const r = readerSettings();
  const scores = familyScores(f, style);
  const ranked = (
    [
      ["level", scores.level],
      ["dipRise", scores.dipRise],
      ["fall", scores.fall],
      ["lowFall", scores.lowFall],
    ] as const
  )
    .slice()
    .sort((a, b) => b[1] - a[1]);
  const [[family, best], [, runnerUp]] = ranked;

  // Only a shape that matches no family at all is "none". A close call
  // names the leaning tone with a lower percentage instead — and is never
  // decisive, so it cannot cost a heart.
  // Back and forth far more than any tone moves (Jane's and Pierre's real
  // attempts stay under ~2.1×): not a tone shape at all.
  if (best < t.toneClassifierMinConfidence || f.wiggle > r.maxWiggle) {
    return { tone: "none", confidence: best, t2t3Cue: null, decisive: false };
  }
  // Graded, not saturated: a clear winner keeps its score, a near-tie
  // with the runner-up family halves it.
  const familyConfidence = best * (0.5 + 0.5 * clamp01((best - runnerUp) / FAMILY_CLEAR_MARGIN));
  const familyDecisive = best - runnerUp >= t.toneClassifierMarginThreshold;
  if (family === "level") {
    const low = r.t1DecisiveMinChao !== null && f.tailMean <= r.t1DecisiveMinChao;
    return { tone: 1, confidence: familyConfidence, t2t3Cue: null, decisive: familyDecisive && !low };
  }
  if (family === "fall") {
    const fromMiddle = r.t4DecisiveMinPeakChao !== null && f.fallPeak <= r.t4DecisiveMinPeakChao;
    return { tone: 4, confidence: familyConfidence, t2t3Cue: null, decisive: familyDecisive && !fromMiddle };
  }
  // A low fall is named T3 but never decisive: it is the one T3 read made
  // from height alone, so it must not cost a heart on a miscalibrated board.
  if (family === "lowFall") return { tone: 3, confidence: familyConfidence, t2t3Cue: null, decisive: false };

  const { cue, votes, floorStart } = t2t3Cue(f);
  if (cue === 0) return { tone: "none", confidence: familyConfidence * 0.5, t2t3Cue: cue, decisive: false };
  // Confidence from the SUM of the evidence, not the mean: a vote near 0 is
  // "no evidence", not doubt, so it must not dilute one clear vote (a T2 at
  // chao 2.3 whose timing votes sit mid-way read 53% under the mean). The
  // read itself is unchanged — sum and mean share a sign. 50% at 0.
  const evidence = votes.reduce((a, b) => a + b, 0);
  const t23Confidence = 1 / (1 + Math.exp(-T23_EVIDENCE_SLOPE * Math.abs(evidence)));
  const dissent = Math.max(0, ...votes.map((v) => -Math.sign(cue) * v));
  return {
    tone: cue > 0 ? 3 : 2,
    confidence: familyConfidence * t23Confidence,
    t2t3Cue: cue,
    decisive:
      // A floor-start read drops two votes, so it names a tone but never
      // costs a heart (a T2 on a board that reads low can look like one).
      !floorStart &&
      !(cue < 0 && r.t2FloorChao !== null && f.low <= r.t2FloorChao) &&
      !(r.t23ScoopNotDecisive && f.onsetScoop) &&
      familyDecisive &&
      Math.abs(cue) >= r.minT23Cue &&
      dissent < r.maxT23Dissent &&
      longestGapMs(contour.points) < t.toneMismatchMaxGapMs &&
      t23Stable(contour, cue, r),
  };
}
