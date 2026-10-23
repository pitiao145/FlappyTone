/**
 * Free-mode attempts: one stretch of speech from `PitchTrail`, split into
 * syllables at its silences and read one syllable at a time. Pure — no
 * canvas, no React, no Web Audio.
 *
 * Only a silence splits syllables, so words whose voice never stops (媽媽,
 * 你好) read as one syllable. That is a known limit, not a bug.
 */
import type { Contour, TrailPoint } from "./contours.ts";
import { classifyToneV2 } from "./toneClassifierV2.ts";
import type { ToneClassification } from "./toneClassifier.ts";
import { tuning } from "./tuning.ts";

export interface FreeAttempt {
  id: number;
  points: readonly TrailPoint[];
  /**
   * One read per syllable, in order. null is "couldn't hear that" (too short
   * to judge) — shown as "?", never as a wrong tone (hard rule 8).
   */
  syllables: (ToneClassification | null)[];
}

/**
 * Cuts an attempt wherever the voice stopped for longer than `gapMs`. The
 * default is the game's own `mergeGapMs`, so a T3 creak dropout stays inside
 * its syllable as it does in play.
 */
export function splitSyllables(
  points: readonly TrailPoint[],
  gapMs: number = tuning().mergeGapMs,
): TrailPoint[][] {
  const out: TrailPoint[][] = [];
  let cur: TrailPoint[] = [];
  for (const p of points) {
    const prev = cur.at(-1);
    if (prev && p.atMs - prev.atMs > gapMs) {
      out.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

function toContour(piece: readonly TrailPoint[]): Contour {
  const t0 = piece[0].atMs;
  return {
    points: piece.map((p) => ({ tMs: p.atMs - t0, chao: p.chao })),
    startedAtMs: t0,
    endedAtMs: piece[piece.length - 1].atMs,
  };
}

function durationMs(piece: readonly TrailPoint[]): number {
  return piece.length === 0 ? 0 : piece[piece.length - 1].atMs - piece[0].atMs;
}

/**
 * Reads one finished attempt, or returns null for a cough (shorter than
 * `minUtteranceMs` overall). Fragments shorter than that are dropped before
 * reading; if every piece is a fragment, the attempt reads as one "?".
 */
export function readAttempt(id: number, points: readonly TrailPoint[]): FreeAttempt | null {
  const minMs = tuning().minUtteranceMs;
  if (durationMs(points) < minMs) return null;
  const pieces = splitSyllables(points).filter((p) => durationMs(p) >= minMs);
  const syllables = pieces.length === 0 ? [null] : pieces.map((p) => classifyToneV2(toContour(p)));
  return { id, points, syllables };
}
