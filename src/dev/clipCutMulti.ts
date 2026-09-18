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
import { HOP, MERGE_GAP_MS, WIN } from "./clipCut.ts";

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
