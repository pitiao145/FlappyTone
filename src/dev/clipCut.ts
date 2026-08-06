/**
 * Cuts one reference clip out of a recording, and measures the contour of what
 * it cut.
 *
 * Extracted from `make-ref-clips.ts` so the four shipped `ma` clips and the
 * whole recorded inventory go through identical code. They must: the demo the
 * player hears, the corridor they are scored against, and the timeline both run
 * on are all derived from this one measurement, and PRD §6 treats their
 * agreement as an invariant. Two separate failures came from those three
 * disagreeing.
 *
 * The cut is made on the *pitch* track, not on amplitude. Trimming at a
 * fraction of peak keeps room tone and breath — measured at 1510–3306ms of
 * audible window against 575–1340ms of actual voicing on these captures, which
 * would freeze the world for up to three seconds while the demo dot crawled
 * through silence. Voicing is what a tone demo is made of.
 */

import { PitchTracker } from "../pitch/PitchTracker.ts";

export const WIN = 2048;
export const HOP = 1024;
/** Silence shorter than this inside an utterance is part of it, not an edge. */
export const MERGE_GAP_MS = 120;
/** Kept either side of the voiced span so the onset is not clipped mid-consonant. */
export const PAD_MS = 45;
/** Click-free edges. */
export const FADE_MS = 15;

/** A point on the clip's own normalised timeline: [t in 0..1, chao 1..5]. */
export type ContourPoint = [number, number];

export interface CutClip {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
  /** Every voiced frame, over the cut clip's timeline. */
  contour: ContourPoint[];
  /** Fraction of voiced frames pinned against chao 1 or 5 — see `pinnedWarning`. */
  pinnedFraction: number;
}

/**
 * Longest voiced run in `samples`, as sample indices, merging short gaps.
 * The same segmentation `longestUtteranceMs()` and the recording booth use.
 */
function longestVoicedRun(
  samples: Float32Array,
  sampleRate: number,
  f0Center: number,
): { start: number; end: number } | null {
  const tracker = new PitchTracker({ sampleRate, f0Center });
  const voiced: number[] = [];
  for (let s = 0; s + WIN <= samples.length; s += HOP) {
    if (tracker.push(samples.subarray(s, s + WIN)).voiced) voiced.push(s + WIN / 2);
  }
  if (voiced.length === 0) return null;

  const gap = (MERGE_GAP_MS / 1000) * sampleRate;
  let bestStart = voiced[0];
  let bestEnd = voiced[0];
  let runStart = voiced[0];
  for (let i = 1; i < voiced.length; i++) {
    if (voiced[i] - voiced[i - 1] > gap) runStart = voiced[i];
    if (voiced[i] - runStart > bestEnd - bestStart) {
      bestStart = runStart;
      bestEnd = voiced[i];
    }
  }
  return { start: bestStart, end: bestEnd };
}

/** Measures the contour of an already-cut clip, on its own timeline. */
export function measureContour(
  samples: Float32Array,
  sampleRate: number,
  f0Center: number,
): { contour: ContourPoint[]; pinnedFraction: number } {
  const tracker = new PitchTracker({ sampleRate, f0Center });
  const contour: ContourPoint[] = [];
  let pinned = 0;
  for (let s = 0; s + WIN <= samples.length; s += HOP) {
    const state = tracker.push(samples.subarray(s, s + WIN));
    if (!state.voiced) continue;
    contour.push([(s + WIN / 2) / samples.length, state.smoothedChao]);
    if (state.chao! <= 1.05 || state.chao! >= 4.95) pinned++;
  }
  return {
    contour,
    pinnedFraction: contour.length ? pinned / contour.length : 0,
  };
}

/**
 * Cuts the clip. Throws when there is no voicing at all — a silent recording
 * is a fact worth surfacing, not a zero-length WAV to write and forget.
 */
export function cutClip(
  samples: Float32Array,
  sampleRate: number,
  f0Center: number,
): CutClip {
  const run = longestVoicedRun(samples, sampleRate, f0Center);
  if (!run) throw new Error("no voiced frames");

  const pad = (PAD_MS / 1000) * sampleRate;
  const a = Math.max(0, Math.round(run.start - pad));
  const b = Math.min(samples.length - 1, Math.round(run.end + pad));
  const cut = samples.slice(a, b + 1);

  const fade = Math.round((FADE_MS / 1000) * sampleRate);
  for (let i = 0; i < fade && i < cut.length; i++) {
    cut[i] *= i / fade;
    cut[cut.length - 1 - i] *= i / fade;
  }

  const { contour, pinnedFraction } = measureContour(cut, sampleRate, f0Center);
  return {
    samples: cut,
    sampleRate,
    durationMs: (cut.length / sampleRate) * 1000,
    contour,
    pinnedFraction,
  };
}

/**
 * Resamples a contour onto `n` evenly spaced points, for the manifest.
 *
 * Returns null where there is no voicing near a point, so trailing silence is
 * never reported as a held pitch — a gate built from an invented plateau would
 * ask the player to sustain a note the speaker never sang.
 */
export function resampleContour(
  contour: ContourPoint[],
  n: number,
  maxDistance = 0.06,
): Array<number | null> {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    let best: ContourPoint | null = null;
    let bestDistance = Infinity;
    for (const p of contour) {
      const d = Math.abs(p[0] - t);
      if (d < bestDistance) {
        bestDistance = d;
        best = p;
      }
    }
    return best && bestDistance < maxDistance ? Number(best[1].toFixed(2)) : null;
  });
}

/** Human-readable decile line, for the console reports. */
export function contourLine(contour: ContourPoint[]): string {
  return resampleContour(contour, 11)
    .map((c, i) => `${(i / 10).toFixed(1)}:${c === null ? "—" : c.toFixed(2)}`)
    .join("  ");
}
