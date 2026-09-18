/**
 * Flags recorded clips that look wrong, so a bad take is caught before it is
 * committed rather than after it ships.
 *
 * Jane records unsupervised and nobody listens to a hundred WAVs. These checks
 * are the substitute for listening — deliberately shape-level, since the one
 * thing we can measure about a tone recording is whether its contour does what
 * its tone number says it does.
 *
 * Advisory, never fatal. `process-clips` writes the clip anyway and prints the
 * flag; a wrong flag costs a glance, a suppressed clip costs a re-recording.
 * The thresholds are loose on purpose — this catches "she read the wrong line",
 * not "her Tone 2 could be crisper".
 *
 * ## Every comparison here is within one voice
 *
 * The duration check and the pinned check both describe a speaker, not a word.
 * Measured against the wrong cohort they produce complaints that are each
 * individually true and jointly useless: a male take was once flagged "276ms
 * against a tone-2 median of 1050ms" and "f0Center is probably wrong for this
 * speaker", both correct, both because the numbers came from Jane. So
 * `cohortMedianMs` is the caller's promise that the median is THIS speaker's
 * own (`process-clips` computes it from their published `word_clips` rows),
 * and `speaker` is carried only so the report says whose cohort it is.
 */

import type { ContourPoint } from "./clipCut.ts";

export interface ReviewInput {
  id: string;
  tone: number;
  durationMs: number;
  contour: ContourPoint[];
  pinnedFraction: number;
  /**
   * Median duration of every clip sharing this tone AND this speaker, for the
   * outlier check. Cross-speaker medians are the bug this field's contract
   * exists to prevent — see the header.
   */
  cohortMedianMs: number;
  /** Whose cohort the median above came from. Report text only. */
  speaker?: string;
  /**
   * Every tone of the word, in order. Single-syllable words pass `[tone]`, or
   * omit it and get the same thing.
   */
  tones?: number[];
  /** Each syllable's extent on the contour's 0..1 timeline. Multi only. */
  syllableSpans?: Array<[number, number]>;
  /** From `multiSyllableSpan` — see `MultiSpan`. */
  underSegmented?: boolean;
  overSegmented?: boolean;
}

export type FlagKind = "sparse" | "pinned" | "duration" | "shape" | "segmentation";

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

/**
 * What a tone pair's first syllable should do, as the technical reference
 * (`docs/tonepairs/mandarin_tone_pairs_technical_reference.md`) describes it.
 *
 * Flags only, exactly like `shapeFlag`, and for the same reason it reads
 * turning points rather than endpoints. Note what is NOT here: these
 * expectations never reach a corridor. A real speaker produces the
 * sandhi-adjusted shape, not the citation form, so the measured polyline is
 * always the authority — this only catches "she read the wrong line".
 *
 * Deliberately narrow. Only the three cases the reference states as
 * categorical are checked; every other combination passes, because a flag
 * nobody can act on is worse than no flag.
 */
function multiShapeFlag(tones: number[], syllables: ContourPoint[][]): Flag | null {
  const shape = { kind: "shape" as const };
  const net = (c: ContourPoint[]) => c[c.length - 1][1] - c[0][1];
  const combo = tones.join("-");

  if (tones.length !== 2 || syllables.length !== 2) return null;
  const [first, second] = syllables;
  if (first.length < 3 || second.length < 3) return null;

  // 3+3: the first third becomes a rising tone. If it still falls and stays
  // down, the take is two citation thirds, not the word.
  if (combo === "3-3") {
    return net(first) > MOVE
      ? null
      : { ...shape, message: `3+3's first syllable should rise (sandhi), but it moves ${net(first).toFixed(1)} chao` };
  }
  // 3+anything-else: a half-third — it falls and stays down. What marks a
  // citation third instead is the recovery, so that is what is measured:
  // how far the syllable climbs back above its own floor before it ends.
  if (tones[0] === 3) {
    const recovery = first[first.length - 1][1] - Math.min(...first.map((p) => p[1]));
    return recovery <= MOVE
      ? null
      : { ...shape, message: `${combo}'s first syllable should be a half-third (fall, no recovery), but it climbs ${recovery.toFixed(1)} chao back off its floor` };
  }
  // 4+4: both fall, the first one less far.
  if (combo === "4-4") {
    return net(first) < -MOVE && net(second) < -MOVE
      ? null
      : { ...shape, message: `4+4 should fall twice (${net(first).toFixed(1)}, ${net(second).toFixed(1)} chao)` };
  }
  return null;
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
      message: `${Math.round(input.pinnedFraction * 100)}% of the pitch is pinned at an edge and it only travels ${span.toFixed(1)} chao — f0Center is probably wrong for ${input.speaker ?? "this speaker"}, so the shape is squashed`,
    });
  }

  const ratio = input.durationMs / input.cohortMedianMs;
  if (input.cohortMedianMs > 0 && (ratio < DURATION_LOW || ratio > DURATION_HIGH)) {
    flags.push({
      kind: "duration",
      message: `${input.durationMs.toFixed(0)}ms against ${input.speaker ? `${input.speaker}'s` : "a"} tone-${input.tone} median of ${input.cohortMedianMs.toFixed(0)}ms`,
    });
  }

  const tones = input.tones ?? [input.tone];

  if (input.underSegmented) {
    flags.push({
      kind: "segmentation",
      message: `voicing never broke between the ${tones.length} syllables — boundaries taken from the amplitude trough instead`,
    });
  }
  if (input.overSegmented) {
    flags.push({
      kind: "segmentation",
      message: `more voiced runs than the word has syllables — the ${tones.length} longest were kept`,
    });
  }

  // A squashed contour's shape would be judged against a distortion we have
  // just reported — one cause, one flag.
  if (!squashed) {
    const shape =
      tones.length > 1
        ? multiShapeFlag(
            tones,
            (input.syllableSpans ?? []).map(([t0, t1]) =>
              input.contour.filter((p) => p[0] >= t0 && p[0] <= t1),
            ),
          )
        : shapeFlag(input.tone, input.contour);
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
