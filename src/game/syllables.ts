/**
 * One way to find the syllables in a stretch of speech (brief 46). Used by
 * Free mode, the Visualiser's tone pairs and the public tone checker. Pure —
 * no Web Audio, no React, no canvas.
 *
 * Input: the voiced frames of one attempt, in time order. A frame that was
 * not voiced is simply absent, so a hole in time is a silence. `rms` is the
 * frame's loudness (`PitchState.rms`); without it only silences can split.
 *
 * Two modes:
 * - Count unknown (Free mode): split at every silence longer than
 *   `mergeGapMs`, drop fragments shorter than `minUtteranceMs`. Words whose
 *   voice never stops read as one syllable.
 * - Count known (a target word of N syllables): split at silences, join
 *   across the shortest silence while there are too many pieces, and while
 *   there are too few, cut the longest piece at its quietest frame (20% in
 *   from each end) — but only at a real dip: quieter than
 *   `syllableDipRatio` × the quieter side's loudest frame. No real dip means
 *   the syllables were not found, and the caller shows "?" (hard rule 8),
 *   never a guessed cut that could read as a wrong tone.
 *
 * Measured on Jane's textbook pairs (brief 46, `split46.mjs`): 85.6% of pairs
 * get every cut within 50 ms of the clip pipeline's own boundary.
 */
import { tuning } from "./tuning.ts";

export interface SyllableFrame {
  /** Time of the frame, ms (any origin). */
  tMs: number;
  /** Frame loudness (RMS). Missing → this frame cannot be a dip. */
  rms?: number;
}

/** A dip is looked for only this far in from each end of a piece. */
const DIP_TRIM_FRAC = 0.2;

function durationMs(piece: readonly SyllableFrame[]): number {
  return piece.length === 0 ? 0 : piece[piece.length - 1].tMs - piece[0].tMs;
}

/** Cuts wherever the voice stopped for longer than `gapMs`. */
export function splitAtSilences<T extends SyllableFrame>(frames: readonly T[], gapMs: number): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  for (const f of frames) {
    const prev = cur.at(-1);
    if (prev && f.tMs - prev.tMs > gapMs) {
      out.push(cur);
      cur = [];
    }
    cur.push(f);
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/**
 * Index of a real loudness dip inside `piece`, or -1. The dip frame itself
 * belongs to neither syllable.
 */
export function realDipAt(piece: readonly SyllableFrame[], ratio: number): number {
  if (piece.length < 3) return -1;
  const len = durationMs(piece);
  const lo = piece[0].tMs + len * DIP_TRIM_FRAC;
  const hi = piece[piece.length - 1].tMs - len * DIP_TRIM_FRAC;
  let at = -1;
  let quietest = Infinity;
  for (let i = 1; i < piece.length - 1; i++) {
    const f = piece[i];
    if (f.tMs < lo || f.tMs > hi || f.rms === undefined) continue;
    if (f.rms < quietest) {
      quietest = f.rms;
      at = i;
    }
  }
  if (at < 0) return -1;
  const peak = (part: readonly SyllableFrame[]) => Math.max(...part.map((f) => f.rms ?? 0));
  const quieterSide = Math.min(peak(piece.slice(0, at)), peak(piece.slice(at + 1)));
  return quietest < ratio * quieterSide ? at : -1;
}

/**
 * The syllables of one attempt. `expected` is the target word's syllable
 * count when there is one. Returns null when a known count was not found.
 */
export function findSyllables<T extends SyllableFrame>(frames: readonly T[], expected?: number): T[][] | null {
  const t = tuning();
  if (expected === undefined) {
    return splitAtSilences(frames, t.mergeGapMs).filter((p) => durationMs(p) >= t.minUtteranceMs);
  }
  if (frames.length === 0 || expected < 1) return null;
  let pieces = splitAtSilences(frames, t.mergeGapMs);
  while (pieces.length > expected) {
    let k = 0;
    let shortest = Infinity;
    for (let i = 0; i + 1 < pieces.length; i++) {
      const gap = pieces[i + 1][0].tMs - pieces[i][pieces[i].length - 1].tMs;
      if (gap < shortest) {
        shortest = gap;
        k = i;
      }
    }
    pieces = [...pieces.slice(0, k), [...pieces[k], ...pieces[k + 1]], ...pieces.slice(k + 2)];
  }
  while (pieces.length < expected) {
    const longest = pieces.reduce((a, p) => (durationMs(p) > durationMs(a) ? p : a));
    const at = realDipAt(longest, t.syllableDipRatio);
    if (at < 0) return null;
    const k = pieces.indexOf(longest);
    pieces = [...pieces.slice(0, k), longest.slice(0, at), longest.slice(at + 1), ...pieces.slice(k + 1)];
  }
  return pieces;
}

// ---- Brief 49: the cut in a two-syllable word, placed by the word's tone pair ----
//
// The target word may only decide WHERE to cut. Each half is then read on its
// own, without the target. When the cut is unsure, both syllables read "?"
// (hard rule 8), never a guessed cut.

/** A pitch event that marks the join for a tone pair (e.g. 3+2: the low point). */
export type PairEvent = "min" | "max" | "fall" | "rise";

/**
 * Where the join of one tone pair usually sits, learned from Jane's clips
 * (`src/dev/bench39/cut49.mjs --emit` writes `pairCutSpots.ts`).
 */
export interface PairCutSpot {
  /** Share of the voiced word (first to last voiced frame) where the join sits. */
  share: number;
  /** The search window is share ± this (a share of the word). */
  halfWidth: number;
  /** The pitch event typical at the join, or null when none lands reliably near it. */
  event: PairEvent | null;
  /** Event time minus the join, ms (median on Jane's clips). */
  offsetMs: number;
}

/** A frame with its pitch on the player's scale (chao), for the pitch event. */
export interface PairFrame extends SyllableFrame {
  chao?: number;
}

/**
 * Drops bits of sound at the edges of an attempt that are not part of the
 * word: a piece (split at silences longer than `pairCutGapMs`) whose loudest
 * frame is under `pairEdgeQuiet` × the attempt's loudest, or one shorter than
 * `pairEdgeShortMs` that sits more than `mergeGapMs` away from the rest and
 * is not loud (under half the attempt's loudest: a short, loud first syllable
 * of natural speech stays).
 * Without rms nothing is dropped.
 */
export function dropEdgeJunk<T extends SyllableFrame>(frames: readonly T[]): T[] {
  const t = tuning();
  if (frames.length === 0 || frames.some((f) => f.rms === undefined)) return [...frames];
  let p = splitAtSilences(frames, t.pairCutGapMs);
  const loudest = (q: readonly T[]) => Math.max(...q.map((f) => f.rms ?? 0));
  const peak = loudest(frames);
  const junk = (q: readonly T[], gap: number) =>
    loudest(q) < t.pairEdgeQuiet * peak ||
    (durationMs(q) < t.pairEdgeShortMs && gap > t.mergeGapMs && loudest(q) < 0.5 * peak);
  while (p.length > 1 && junk(p[0], p[1][0].tMs - p[0][p[0].length - 1].tMs)) p = p.slice(1);
  while (p.length > 1 && junk(p[p.length - 1], p[p.length - 1][0].tMs - p[p.length - 2][p[p.length - 2].length - 1].tMs)) p = p.slice(0, -1);
  return p.flat();
}

/** Drops frames at both ends of one syllable quieter than `share` × its loudest frame. */
export function trimQuietEdges<T extends SyllableFrame>(piece: readonly T[], share: number): T[] {
  if (share <= 0 || piece.some((f) => f.rms === undefined)) return [...piece];
  const peak = Math.max(...piece.map((f) => f.rms ?? 0));
  let a = 0;
  let z = piece.length - 1;
  while (a < z && (piece[a].rms ?? 0) < share * peak) a++;
  while (z > a && (piece[z].rms ?? 0) < share * peak) z--;
  return piece.slice(a, z + 1);
}

/** Time (ms) of `event` among frames a..b (indices), on a 3-frame median of the pitch. Null if none. */
export function pairEventTime(frames: readonly PairFrame[], a: number, b: number, event: PairEvent, minMove: number): number | null {
  const raw = frames.map((f) => f.chao);
  if (raw.some((c) => c === undefined)) return null;
  const c = raw as number[];
  const s = c.map((_, i) => {
    const w = c.slice(Math.max(0, i - 1), i + 2).sort((x, y) => x - y);
    return w[w.length >> 1];
  });
  let at = -1;
  let best = -Infinity;
  for (let i = Math.max(a, 1); i <= Math.min(b, frames.length - 2); i++) {
    const v = event === "min" ? -s[i] : event === "max" ? s[i] : event === "fall" ? s[i - 1] - s[i + 1] : s[i + 1] - s[i - 1];
    if (v > best) {
      best = v;
      at = i;
    }
  }
  if (at < 0) return null;
  if ((event === "fall" || event === "rise") && best < minMove) return null;
  return frames[at].tMs;
}

/**
 * The two syllables of a two-syllable attempt, cut near the spot where this
 * tone pair's join usually sits. In order:
 * 1. silences longer than `mergeGapMs`: the one nearest the spot, but only
 *    within `pairCutFarWidths` window half-widths of it;
 * 2. inside the window (spot ± halfWidth × `pairCutWindowScale`): a silence
 *    longer than `pairCutGapMs`, then a real loudness dip
 *    (`syllableDipRatio`), then the pair's pitch event;
 * 3. nothing found → null (both syllables "?").
 * `frames`: voiced frames in time order, already cleaned by `dropEdgeJunk`.
 */
export function findPairCut<T extends PairFrame>(frames: readonly T[], spot: PairCutSpot): [T[], T[]] | null {
  const t = tuning();
  if (frames.length < 4) return null;
  const t0 = frames[0].tMs;
  const len = durationMs(frames);
  if (len <= 0) return null;
  const w = spot.halfWidth * t.pairCutWindowScale;
  const at = t0 + spot.share * len;
  const split = (k: number, skip = 0): [T[], T[]] | null => {
    const p: [T[], T[]] = [frames.slice(0, k), frames.slice(k + skip)];
    return p[0].length > 0 && p[1].length > 0 ? p : null;
  };

  // 1. long silences
  const pieces = splitAtSilences(frames, t.mergeGapMs);
  if (pieces.length >= 2) {
    let k = 0;
    let bestD = Infinity;
    for (let i = 0; i + 1 < pieces.length; i++) {
      const d = Math.abs((pieces[i][pieces[i].length - 1].tMs + pieces[i + 1][0].tMs) / 2 - at);
      if (d < bestD) {
        bestD = d;
        k = i;
      }
    }
    if (bestD > t.pairCutFarWidths * w * len) return null;
    return split(pieces.slice(0, k + 1).reduce((n, q) => n + q.length, 0));
  }

  // 2. the window
  const a = frames.findIndex((f) => f.tMs >= at - w * len);
  let b = -1;
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i].tMs <= at + w * len) { b = i; break; }
  if (a < 1 || b < 0 || b > frames.length - 2 || b - a < 1) return null;
  let gapAt = -1;
  let gap = t.pairCutGapMs;
  for (let i = a; i <= b + 1; i++) {
    const d = frames[i].tMs - frames[i - 1].tMs;
    if (d > gap) {
      gap = d;
      gapAt = i;
    }
  }
  if (gapAt > 0) return split(gapAt);
  if (frames.every((f) => f.rms !== undefined)) {
    let q = -1;
    let qr = Infinity;
    for (let i = a; i <= b; i++) if ((frames[i].rms as number) < qr) { qr = frames[i].rms as number; q = i; }
    const peak = (part: readonly T[]) => Math.max(...part.map((f) => f.rms ?? 0));
    if (q > 0 && qr < t.syllableDipRatio * Math.min(peak(frames.slice(0, q)), peak(frames.slice(q + 1)))) return split(q, 1);
  }
  if (spot.event) {
    const e = pairEventTime(frames, a, b, spot.event, t.pairEventMinChao);
    if (e !== null) {
      const k = frames.findIndex((f) => f.tMs >= e + spot.offsetMs);
      if (k > 0) return split(k);
    }
  }
  return null;
}
