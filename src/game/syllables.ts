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
