/**
 * Measures a multi-syllable recording — the counterpart to `clipCut.ts`'s
 * `longestVoicedRun`/`templateContour`, which are single-syllable by
 * construction and must stay that way.
 *
 * Why a separate file rather than a wider merge gap in `clipCut.ts`:
 * `longestVoicedRun` finds one voiced run and *discards the rest*. That is
 * correct for an isolated syllable (the longest run is the syllable; anything
 * else is a cough or a neighbour) and exactly wrong for a word, where the
 * second syllable is as real as the first and the pause between them is part
 * of the timeline the player flies.
 *
 * Nothing here is tone-role aware. Sandhi means a tone's realised shape
 * depends on what follows it — a 3+2 first syllable never reaches chao 5, a
 * 3+3 first syllable rises like a 2 — so a corridor built from per-tone
 * templates would teach a shape the speaker did not produce. Every node below
 * is measured from this recording's own contour.
 */

import { PitchTracker } from "../pitch/PitchTracker.ts";
import {
  EXTREMUM_TRIM_FRAC,
  HOP,
  MERGE_GAP_MS,
  WIN,
  type ContourPoint,
} from "./clipCut.ts";

/**
 * How long a silence inside one *word* may be before it is an edge rather
 * than the pause between two syllables.
 *
 * `MERGE_GAP_MS` (120) is the intra-syllable figure: it bridges a creak
 * dropout inside one vowel. The gap between syllables is bigger — measured
 * over `fixtures/tonepairs/wav`, `xiao_shi` and `yi_qian` each carry a 235ms
 * unvoiced stretch across the `sh`/`q` onset. 400ms clears those with margin
 * while staying far short of the seconds of room tone that separate one take
 * from the next in a recording session.
 */
export const MULTI_MERGE_GAP_MS = 400;

/** One syllable's voiced extent, as sample indices into the source take. */
export interface SyllableRun {
  start: number;
  end: number;
}

export interface MultiSpan {
  /** First voiced sample of the word. */
  start: number;
  /** Last voiced sample of the word. */
  end: number;
  /** Exactly `syllables` entries, ordered, disjoint, inside the span. */
  runs: SyllableRun[];
  /**
   * Voicing gave fewer runs than the word has syllables, and the boundaries
   * below were completed by splitting at an amplitude trough.
   *
   * Not a failure. Two of the four tone-pair fixtures are in this state for
   * an ordinary reason: `hǎowán` and `měiguó` are sonorant across the
   * boundary, so the speaker never stops phonating. Creak fusing a syllable
   * pair is the other common cause. A review flag, so a cut that leaned on
   * the fallback is visible rather than inferred.
   */
  underSegmented: boolean;
  /** Voicing gave more runs than syllables; the longest `syllables` were kept. */
  overSegmented: boolean;
}

/** Every voiced frame's centre sample, in order. */
function voicedCenters(
  samples: Float32Array,
  sampleRate: number,
  f0Center: number,
): number[] {
  const tracker = new PitchTracker({ sampleRate, f0Center });
  const centers: number[] = [];
  for (let s = 0; s + WIN <= samples.length; s += HOP) {
    if (tracker.push(samples.subarray(s, s + WIN)).voiced) centers.push(s + WIN / 2);
  }
  return centers;
}

/** Splits voiced frames into runs at gaps wider than `gapSamples`. */
function runsFrom(centers: number[], gapSamples: number): SyllableRun[] {
  const runs: SyllableRun[] = [];
  let start = centers[0];
  for (let i = 1; i < centers.length; i++) {
    if (centers[i] - centers[i - 1] > gapSamples) {
      runs.push({ start, end: centers[i - 1] });
      start = centers[i];
    }
  }
  runs.push({ start, end: centers[centers.length - 1] });
  return runs;
}

/**
 * Drops leading/trailing runs cut off from the rest by more than twice the
 * inter-syllable gap — a stray voiced frame from a cough or a neighbouring
 * take. Keeps the longest contiguous cluster, measured by voiced duration
 * rather than run count so one long syllable is not outvoted by two short
 * artefacts.
 */
function largestCluster(runs: SyllableRun[], gapSamples: number): SyllableRun[] {
  const clusters: SyllableRun[][] = [[runs[0]]];
  for (let i = 1; i < runs.length; i++) {
    if (runs[i].start - runs[i - 1].end > gapSamples * 2) clusters.push([]);
    clusters[clusters.length - 1].push(runs[i]);
  }
  const voiced = (c: SyllableRun[]) => c.reduce((sum, r) => sum + (r.end - r.start), 0);
  return clusters.reduce((best, c) => (voiced(c) > voiced(best) ? c : best));
}

function frameRms(samples: Float32Array, center: number): number {
  const start = Math.max(0, Math.round(center - WIN / 2));
  let sum = 0;
  let n = 0;
  for (let i = start; i < start + WIN && i < samples.length; i++) {
    sum += samples[i] * samples[i];
    n++;
  }
  return n === 0 ? 0 : Math.sqrt(sum / n);
}

/** Ignored at each end of a run when hunting for its amplitude trough. */
const SPLIT_TRIM_FRAC = 0.2;

/**
 * Splits a continuously-voiced run at its quietest interior frame.
 *
 * The amplitude trough is the syllable boundary a listener hears when
 * phonation never stops: on `hǎowán` it lands at 1664ms, exactly where the
 * measured contour bottoms out and starts climbing into `wán`; on `měiguó`
 * at 1408ms, inside the weak `g` closure. Returns null when the run is too
 * short to have an interior.
 */
function splitAtTrough(
  samples: Float32Array,
  run: SyllableRun,
): [SyllableRun, SyllableRun] | null {
  const length = run.end - run.start;
  const lo = run.start + length * SPLIT_TRIM_FRAC;
  const hi = run.end - length * SPLIT_TRIM_FRAC;
  let best = -1;
  let bestRms = Infinity;
  for (let c = run.start; c <= run.end; c += HOP) {
    if (c < lo || c > hi) continue;
    const rms = frameRms(samples, c);
    if (rms < bestRms) {
      bestRms = rms;
      best = c;
    }
  }
  if (best < 0 || best - HOP <= run.start || best + HOP >= run.end) return null;
  return [
    { start: run.start, end: best },
    { start: best + HOP, end: run.end },
  ];
}

/**
 * The whole word's voiced span, plus one run per syllable.
 *
 * Returns null when nothing is voiced — a silent take is a fact worth
 * surfacing, same contract as `cutClip`.
 */
export function multiSyllableSpan(
  samples: Float32Array,
  sampleRate: number,
  f0Center: number,
  syllables: number,
): MultiSpan | null {
  const centers = voicedCenters(samples, sampleRate, f0Center);
  if (centers.length === 0) return null;

  const intraGap = (MERGE_GAP_MS / 1000) * sampleRate;
  const interGap = (MULTI_MERGE_GAP_MS / 1000) * sampleRate;
  let runs = largestCluster(runsFrom(centers, intraGap), interGap);
  const span = { start: runs[0].start, end: runs[runs.length - 1].end };

  let overSegmented = false;
  if (runs.length > syllables) {
    overSegmented = true;
    runs = [...runs]
      .sort((a, b) => b.end - b.start - (a.end - a.start))
      .slice(0, syllables)
      .sort((a, b) => a.start - b.start);
  }

  let underSegmented = false;
  while (runs.length < syllables) {
    const longest = runs.reduce((best, r) =>
      r.end - r.start > best.end - best.start ? r : best,
    );
    const split = splitAtTrough(samples, longest);
    if (!split) break;
    underSegmented = true;
    runs = runs.flatMap((r) => (r === longest ? split : [r]));
  }

  return { ...span, runs, underSegmented, overSegmented };
}

/**
 * Below this a bend is measurement wobble, not a node worth a corridor wall.
 *
 * Measured against the straight line from the syllable's start to its end, so
 * it asks "does this extremum take the contour anywhere the line already
 * goes?" — a monotone fall has a min at its end which the line reaches
 * anyway, and giving it a node would only add a redundant vertex (and, via
 * `corridorToleranceAt`, a tolerance bump the shape does not deserve).
 */
export const MIN_EXCURSION_CHAO = 0.15;

/** Straight-line chao between two nodes, at `t`. */
function lineAt(a: ContourPoint, b: ContourPoint, t: number): number {
  const span = b[0] - a[0];
  return span === 0 ? a[1] : a[1] + ((t - a[0]) / span) * (b[1] - a[1]);
}

/** Lowest ("min") or highest ("max") point of a contour slice. */
function extremum(points: ContourPoint[], kind: "min" | "max"): ContourPoint {
  let best = points[0];
  for (const p of points) {
    if (kind === "min" ? p[1] < best[1] : p[1] > best[1]) best = p;
  }
  return best;
}

/**
 * The furthest chao reached after `fromT`, in `kind`'s direction — the
 * "complete the tone, then hold" value `templateContour` uses for a single
 * syllable's final node, applied per syllable here.
 *
 * Same reason as there: pitch often releases once the vowel is done, and PRD
 * §6 is explicit that the release is not part of the tone. A syllable that
 * ended wherever voicing trailed off would ask the player to follow it.
 */
function holdAfter(points: ContourPoint[], fromT: number, kind: "min" | "max"): number {
  const tail = points.filter((p) => p[0] >= fromT);
  return extremum(tail.length > 0 ? tail : points, kind)[1];
}

/** How many measured bends one syllable may keep, between its start and end. */
const INTERIOR_NODES_PER_SYLLABLE = 2;

/**
 * The interior point furthest from the chord `a`–`b`, and how far.
 *
 * Distance from the chord rather than "lowest" or "highest", because those
 * are not the same question and only this one is about shape. `wán` in
 * `hǎowán` holds level for 150ms and then climbs: its interior minimum sits
 * right on the straight line from its start to its end and carries no
 * information, while the plateau that the line misses by 0.56 chao is neither
 * a minimum nor a maximum. Selecting extrema dropped both nodes and drew a
 * ramp through a shape that does not ramp — off-centre by three quarters of
 * the base corridor tolerance, for a player producing the recording exactly.
 *
 * This is still extremum-preserving for the shapes that have one: where a
 * syllable really does turn, the turning point *is* the furthest point from
 * its chord, so a dip or a peak is picked first and by its own value.
 */
function furthestFromChord(
  points: ContourPoint[],
  a: ContourPoint,
  b: ContourPoint,
): { point: ContourPoint; deviation: number } | null {
  let best: ContourPoint | null = null;
  let bestDeviation = 0;
  for (const p of points) {
    const d = Math.abs(p[1] - lineAt(a, b, p[0]));
    if (d > bestDeviation) {
      bestDeviation = d;
      best = p;
    }
  }
  return best ? { point: best, deviation: bestDeviation } : null;
}

/**
 * One syllable's nodes: start, up to two measured bends in time order, and a
 * held end.
 *
 * Deliberately shape-agnostic — no per-tone node template, unlike
 * `templateContour`. Sandhi means the realised shape of a tone depends on
 * what follows it: a 3+2 first syllable never reaches chao 5, and a 3+3 first
 * syllable rises like a Tone 2. A corridor built from the citation template
 * would teach a contour the speaker did not produce, which is the one thing
 * the call-and-response contract cannot survive.
 */
function syllableNodes(
  slice: ContourPoint[],
  startT: number,
  endT: number,
): ContourPoint[] {
  const start: ContourPoint = [startT, slice[0][1]];
  const last: ContourPoint = [endT, slice[slice.length - 1][1]];

  const from = slice[0][0];
  const to = slice[slice.length - 1][0];
  const lo = from + (to - from) * EXTREMUM_TRIM_FRAC;
  const hi = to - (to - from) * EXTREMUM_TRIM_FRAC;
  const interior = slice.filter((p) => p[0] >= lo && p[0] <= hi);

  // Douglas–Peucker, budget `INTERIOR_NODES_PER_SYLLABLE`: split at the point
  // furthest from the current chord, then recheck both halves against their
  // own chords, so a second node lands where the first one left the worst
  // error rather than next to it.
  const bends: ContourPoint[] = [];
  for (let n = 0; n < INTERIOR_NODES_PER_SYLLABLE; n++) {
    const chords = [start, ...bends, last];
    let pick: { point: ContourPoint; deviation: number } | null = null;
    for (let i = 0; i < chords.length - 1; i++) {
      const segment = interior.filter(
        (p) => p[0] > chords[i][0] && p[0] < chords[i + 1][0],
      );
      const candidate = furthestFromChord(segment, chords[i], chords[i + 1]);
      if (candidate && (!pick || candidate.deviation > pick.deviation)) pick = candidate;
    }
    if (!pick || pick.deviation < MIN_EXCURSION_CHAO) break;
    bends.push(pick.point);
    bends.sort((a, b) => a[0] - b[0]);
  }

  // The tone's final direction of travel is set by its last bend: away from a
  // trough is a rise, away from a peak is a fall, read off which side of the
  // chord the bend sits on. With no bend the syllable is monotone and its last
  // measured value is already the end.
  const lastBend = bends[bends.length - 1];
  const end: ContourPoint = lastBend
    ? [
        endT,
        holdAfter(
          slice,
          lastBend[0],
          lastBend[1] < lineAt(start, last, lastBend[0]) ? "max" : "min",
        ),
      ]
    : last;

  return [start, ...bends, end];
}

/**
 * A corridor polyline for a multi-syllable word: each syllable simplified
 * independently, concatenated, with nothing in the gap between them.
 *
 * No node is placed across the inter-syllable pause on purpose. There is no
 * measured pitch there, and the monotone spline already bridges it without
 * overshoot — inventing a value would be the same mistake `resampleContour`
 * exists to avoid, drawn as a wall.
 *
 * `spans` are the syllable boundaries on the contour's own 0..1 timeline.
 * The first syllable's start is pulled out to t=0 and the last syllable's end
 * pushed to t=1, exactly as `templateContour` does: voicing starts after the
 * clip does, and a corridor that simply stopped would have no wall there.
 */
export function multiSyllablePolyline(
  contour: ContourPoint[],
  spans: Array<[number, number]>,
): ContourPoint[] {
  if (contour.length === 0 || spans.length === 0) return [];

  const nodes: ContourPoint[] = [];
  spans.forEach(([t0, t1], i) => {
    const slice = contour.filter((p) => p[0] >= t0 && p[0] <= t1);
    if (slice.length === 0) return;
    nodes.push(
      ...syllableNodes(slice, i === 0 ? 0 : t0, i === spans.length - 1 ? 1 : t1),
    );
  });

  // Strictly increasing t, or the spline's secants divide by zero.
  const ordered = nodes.sort((a, b) => a[0] - b[0]);
  return ordered
    .filter((p, i) => i === 0 || p[0] > ordered[i - 1][0])
    .map((p) => [Number(p[0].toFixed(4)), Number(p[1].toFixed(3))] as ContourPoint);
}
