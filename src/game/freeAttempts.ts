/**
 * Free-mode attempts and tone-pair reads: one stretch of speech split into
 * syllables by `findSyllables` (syllables.ts) and read one syllable at a
 * time. Pure — no canvas, no React, no Web Audio.
 *
 * Free mode has no target, so only a silence splits syllables there: words
 * whose voice never stops (媽媽, 你好) read as one syllable. A tone pair
 * knows its count and may also split at a real loudness dip.
 */
import type { Contour, TrailPoint } from "./contours.ts";
import { classifyToneV2 } from "./toneClassifierV2.ts";
import type { ToneClassification } from "./toneClassifier.ts";
import { findSyllables, splitAtSilences } from "./syllables.ts";
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
  return splitAtSilences(points.map(asFrame), gapMs).map((piece) => piece.map((f) => f.p));
}

const asFrame = (p: TrailPoint) => ({ tMs: p.atMs, rms: p.rms, p });

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
 * `minUtteranceMs` overall).
 *
 * No `expected` (Free mode): fragments shorter than `minUtteranceMs` are
 * dropped before reading; if every piece is a fragment, the attempt reads as
 * one "?".
 *
 * With `expected` (a target word): when its syllables are not found, every
 * syllable reads "?" (hard rule 8), never a guessed cut. A found syllable
 * shorter than `minUtteranceMs` reads "?" on its own.
 */
export function readAttempt(id: number, points: readonly TrailPoint[], expected?: number): FreeAttempt | null {
  const minMs = tuning().minUtteranceMs;
  if (durationMs(points) < minMs) return null;
  const found = findSyllables(points.map(asFrame), expected);
  let syllables: FreeAttempt["syllables"];
  if (expected === undefined) {
    syllables = found && found.length > 0 ? found.map((f) => classifyToneV2(toContour(f.map((x) => x.p)))) : [null];
  } else if (found === null) {
    syllables = Array.from({ length: expected }, () => null);
  } else {
    syllables = found.map((f) => {
      const piece = f.map((x) => x.p);
      return durationMs(piece) < minMs ? null : classifyToneV2(toContour(piece));
    });
  }
  return { id, points, syllables };
}

/**
 * One finished contour (time-zeroed) read per syllable — tone pairs use this.
 * `expected` is the word's syllable count; omitted, only silences split (the
 * pre-brief-46 behaviour, kept for callers without a target). null for a
 * cough.
 */
export function readContourSyllables(contour: Contour, expected?: number): FreeAttempt["syllables"] | null {
  const points = contour.points.map((p) => (p.rms === undefined ? { atMs: p.tMs, chao: p.chao } : { atMs: p.tMs, chao: p.chao, rms: p.rms }));
  return readAttempt(0, points, expected)?.syllables ?? null;
}
