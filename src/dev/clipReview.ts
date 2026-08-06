/**
 * Flags recorded clips that look wrong, so a bad take is caught before it is
 * committed rather than after it ships.
 *
 * Jane records unsupervised and nobody listens to a hundred WAVs. These checks
 * are the substitute for listening — deliberately shape-level, since the one
 * thing we can measure about a tone recording is whether its contour does what
 * its tone number says it does.
 *
 * Advisory, never fatal. `make-clips` writes the clip anyway and prints the
 * flag; a wrong flag costs a glance, a suppressed clip costs a re-recording.
 * The thresholds are loose on purpose — this catches "she read the wrong line",
 * not "her Tone 2 could be crisper".
 */

import type { ContourPoint } from "./clipCut.ts";

export interface ReviewInput {
  id: string;
  tone: number;
  durationMs: number;
  contour: ContourPoint[];
  pinnedFraction: number;
  /** Median duration of every clip sharing this tone, for the outlier check. */
  cohortMedianMs: number;
}

export type FlagKind = "sparse" | "pinned" | "duration" | "shape";

export interface Flag {
  kind: FlagKind;
  message: string;
}

/** Below this there is not enough contour to judge anything, including shape. */
const MIN_VOICED_FRAMES = 8;
/**
 * Pinned-against-the-edge thresholds.
 *
 * Being pinned is not by itself a fault: a native Tone 4 sits at chao 5 for
 * most of the syllable and ends at the floor, so two thirds of its frames are
 * legitimately at an extreme. What a wrong `f0Center` actually looks like is
 * pinned *and stuck* — the contour clamped against one rail with nowhere to
 * travel. Requiring both is what stops this flagging every correct T1 and T4.
 */
const MAX_PINNED = 0.4;
const SQUASHED_SPAN = 1.5;
/** A clip this far from its tone's cohort is a different utterance, not a variant. */
const DURATION_LOW = 0.55;
const DURATION_HIGH = 1.8;
/** Chao movement that counts as a real rise or fall rather than wobble. */
const MOVE = 0.5;
/** A Tone 1 that travels more than this is not flat. */
const FLAT_SPAN = 1.6;

/** Where in the clip an extreme sits — a rise that peaks at t=0 is not a rise. */
const TURN_MIN_T = 0.25;

function extreme(
  contour: ContourPoint[],
  pick: (a: number, b: number) => boolean,
  fromT = 0,
): { t: number; chao: number } {
  let best = { t: contour[0][0], chao: contour[0][1] };
  let found = false;
  for (const [t, chao] of contour) {
    if (t < fromT) continue;
    if (!found || pick(chao, best.chao)) {
      best = { t, chao };
      found = true;
    }
  }
  return best;
}

/**
 * What each tone's contour must do, stated as loosely as it can be while still
 * catching a mislabelled clip. Measured shapes, not the shapes of the marks —
 * see the superseded polyline table in PRD §6.
 *
 * These read the contour's *turning point*, never its last sample. The clips
 * include the release: Jane's Tone 2 rises 3.0 → 5.0 and then falls back to
 * ~3.0 before the audio ends, so "ends higher than it starts" flags a textbook
 * take. PRD §6 says the release is deliberately not part of the tone, and this
 * is the same fact showing up in the review.
 */
function shapeFlag(tone: number, contour: ContourPoint[]): Flag | null {
  const chao = contour.map((p) => p[1]);
  const first = chao[0];
  const min = Math.min(...chao);
  const max = Math.max(...chao);
  const shape = { kind: "shape" as const };

  switch (tone) {
    case 1:
      return max - min > FLAT_SPAN
        ? { ...shape, message: `Tone 1 should hold level, but this moves ${(max - min).toFixed(1)} chao` }
        : null;
    case 2: {
      const peak = extreme(contour, (a, b) => a > b);
      return peak.chao - first > MOVE && peak.t > TURN_MIN_T
        ? null
        : { ...shape, message: `Tone 2 should rise (${first.toFixed(1)} → peak ${peak.chao.toFixed(1)} at t=${peak.t.toFixed(2)})` };
    }
    case 3: {
      // The citation third dips to the floor and comes back up. A take that
      // only falls is the natural half-third — real Mandarin, wrong for the ˇ
      // corridor this clip would be demonstrating.
      const dip = extreme(contour, (a, b) => a < b);
      const rise = extreme(contour, (a, b) => a > b, dip.t);
      return dip.chao < first - MOVE && rise.chao > dip.chao + MOVE
        ? null
        : { ...shape, message: `Tone 3 should dip and rise (${first.toFixed(1)} → ${dip.chao.toFixed(1)} → ${rise.chao.toFixed(1)})` };
    }
    case 4: {
      const trough = extreme(contour, (a, b) => a < b);
      return first - trough.chao > MOVE && trough.t > TURN_MIN_T
        ? null
        : { ...shape, message: `Tone 4 should fall (${first.toFixed(1)} → trough ${trough.chao.toFixed(1)} at t=${trough.t.toFixed(2)})` };
    }
    default:
      return null;
  }
}

export function reviewClip(input: ReviewInput): Flag[] {
  const flags: Flag[] = [];

  if (input.contour.length < MIN_VOICED_FRAMES) {
    // Everything below reads the contour, so stop here rather than reporting
    // four derived complaints about one missing signal.
    return [
      {
        kind: "sparse",
        message: `only ${input.contour.length} voiced frames — too little pitch to judge`,
      },
    ];
  }

  const chao = input.contour.map((p) => p[1]);
  const span = Math.max(...chao) - Math.min(...chao);
  const squashed = input.pinnedFraction > MAX_PINNED && span < SQUASHED_SPAN;
  if (squashed) {
    flags.push({
      kind: "pinned",
      message: `${Math.round(input.pinnedFraction * 100)}% of the pitch is pinned at an edge and it only travels ${span.toFixed(1)} chao — f0Center is probably wrong for this speaker, so the shape is squashed`,
    });
  }

  const ratio = input.durationMs / input.cohortMedianMs;
  if (input.cohortMedianMs > 0 && (ratio < DURATION_LOW || ratio > DURATION_HIGH)) {
    flags.push({
      kind: "duration",
      message: `${input.durationMs.toFixed(0)}ms against a tone-${input.tone} median of ${input.cohortMedianMs.toFixed(0)}ms`,
    });
  }

  // A squashed contour's shape would be judged against a distortion we have
  // just reported — one cause, one flag.
  if (!squashed) {
    const shape = shapeFlag(input.tone, input.contour);
    if (shape) flags.push(shape);
  }

  return flags;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
