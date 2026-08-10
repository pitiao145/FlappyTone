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

import { computeF0Center, computeRangeSemitones } from "../pitch/calibration.ts";
import { hzToSemitones } from "../pitch/math.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import type { Tone } from "../game/gates.ts";

export const WIN = 2048;
export const HOP = 1024;
/** Silence shorter than this inside an utterance is part of it, not an edge. */
export const MERGE_GAP_MS = 120;
/** Kept either side of the voiced span so the onset is not clipped mid-consonant. */
export const PAD_MS = 45;
/** Click-free edges. */
export const FADE_MS = 15;

/**
 * How far back the cut may reach for a voiceless onset.
 *
 * A Mandarin syllable can begin with up to ~200ms of sound that carries no
 * pitch at all — the burst and aspiration of ch/c/q/zh/sh/t/k/p, or the
 * friction of s/f/x/h. `longestVoicedRun` cannot see any of it, so a cut made
 * on voicing alone starts at the vowel: `chang2` came out as "hang".
 *
 * Measured over the 120 takes of session 2026-08-07-xujzgs, the sound before
 * voicing runs to 171ms at most and 52 clips exceed the 45ms `PAD_MS`. The cap
 * is what stops the walk when a take has no silence to stop it — a preceding
 * cough or a neighbouring word would otherwise be swallowed whole.
 */
export const MAX_ONSET_MS = 200;

/** Sound this many times above the room floor is the word, not the room. */
const ONSET_FLOOR_FACTOR = 3;

/**
 * Deliberately wider than any voice, for offline measurement only.
 *
 * chao clamps at 1 and 5, so measuring against a realistic range destroys the
 * evidence at exactly the extremes that matter: half of Jane's T4 clips read as
 * a flat 5.00 across their whole plateau. A wide range keeps the contour linear
 * in semitones all the way out; `clipNormalize` then places it and clamps once,
 * at the end. Her widest excursion across 120 takes is 13.1 st.
 */
export const MEASURE_RANGE_SEMITONES = 15;

/** A point on the clip's own normalised timeline: [t in 0..1, chao 1..5]. */
export type ContourPoint = [number, number];

export interface CutClip {
  samples: Float32Array;
  sampleRate: number;
  /**
   * The tone window — the voiced part plus its pads. This is what the corridor
   * is measured over and what the gate lasts. Deliberately *not* the length of
   * `samples`, which also carries the consonant in front of it.
   */
  durationMs: number;
  /**
   * Consonant audio in front of the tone window, in ms. The demo plays from
   * sample 0; the corridor starts `onsetMs` later. 0 for a vowel or nasal onset.
   */
  onsetMs: number;
  /**
   * Where the tone window starts, measured from sample 0 of the *source* take.
   *
   * `onsetMs` is the same distance measured from the start of `samples`; these
   * differ by whatever lead-in the cut dropped. `make-clips` ships the take
   * itself rather than `samples`, so it needs the offset into the original.
   */
  toneStartMs: number;
  /** Length of the source take, for the same reason. */
  sourceMs: number;
  /** Every voiced frame, over the tone window's timeline. */
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

function frameRms(samples: Float32Array, start: number, length: number): number {
  let sum = 0;
  for (let i = start; i < start + length && i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / length);
}

/**
 * Walks back from the start of voicing through sound still above the room
 * floor, and returns where the syllable audibly begins.
 *
 * The floor is measured from this take's own lead-in rather than assumed: gain
 * and room differ per session, and a fixed threshold would either swallow room
 * tone in a loud room or clip the aspiration in a quiet one. The 20th
 * percentile rather than the minimum, so one anomalously dead frame cannot
 * drive the floor to zero and make everything look like speech.
 *
 * Self-limiting by construction: on a take with real silence before the vowel
 * (`ba1`) the very first frame back is at the floor and the walk stops at once.
 */
function onsetStart(
  samples: Float32Array,
  sampleRate: number,
  voicedStart: number,
): number {
  const firstFrame = Math.max(0, Math.floor((voicedStart - WIN / 2) / HOP));
  if (firstFrame < 2) return voicedStart;

  const lead: number[] = [];
  for (let f = 0; f < firstFrame; f++) lead.push(frameRms(samples, f * HOP, WIN));
  const sorted = [...lead].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)] * ONSET_FLOOR_FACTOR;

  const limit = Math.max(0, voicedStart - (MAX_ONSET_MS / 1000) * sampleRate);
  let f = firstFrame - 1;
  let steps = 0;
  while (f >= 0 && f * HOP >= limit && lead[f] > floor) {
    f--;
    steps++;
  }
  // Frame-quantized: zero steps must return voicedStart exactly, unchanged —
  // a nasal onset like `m`, voiced throughout, must not gain a false onset
  // from grid rounding. The four `ma` anchors are the check for this.
  return steps === 0 ? voicedStart : Math.max(limit, voicedStart - steps * HOP);
}

/**
 * Measures the contour of an already-cut clip, on its own timeline.
 *
 * `rangeSemitones` is the speaker's own tone space, and it is what stops a
 * contour from being squashed: chao is the excursion measured against the
 * range, so a range narrower than the voice pins the whole syllable against
 * the ceiling and reports a flat line. Six of Jane's T1 clips read as a
 * constant 5.00 for exactly that reason. Omitted, it falls back to the
 * tracker's default — see `measurePitchReference`, which measures it.
 */
export function measureContour(
  samples: Float32Array,
  sampleRate: number,
  f0Center: number,
  rangeSemitones?: number,
): { contour: ContourPoint[]; pinnedFraction: number } {
  const tracker = new PitchTracker({ sampleRate, f0Center, ...(rangeSemitones ? { rangeSemitones } : {}) });
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
  rangeSemitones?: number,
): CutClip {
  const run = longestVoicedRun(samples, sampleRate, f0Center);
  if (!run) throw new Error("no voiced frames");

  const pad = (PAD_MS / 1000) * sampleRate;
  // The tone window, unchanged: this is what the corridor is measured over.
  const a = Math.max(0, Math.round(run.start - pad));
  const b = Math.min(samples.length - 1, Math.round(run.end + pad));
  // The clip window: the same tail, reaching further back for the consonant.
  const onsetA = Math.min(a, Math.round(onsetStart(samples, sampleRate, a)));

  const cut = samples.slice(onsetA, b + 1);
  const fade = Math.round((FADE_MS / 1000) * sampleRate);
  for (let i = 0; i < fade && i < cut.length; i++) {
    cut[i] *= i / fade;
    cut[cut.length - 1 - i] *= i / fade;
  }

  // Measured over the tone window only — a contour normalised over the whole
  // clip would slide every polyline vertex by the onset's length.
  //
  // Faded before measuring, exactly as the pre-onset cutter did. The ramp is a
  // delivery artefact and measuring without it is arguably more correct, but it
  // is not what the shipped polylines were measured from: unfaded, `kai1` gains
  // a voiced frame and `yuan3` loses one, which moves two corridors under
  // players for no reason anyone asked for. Reproducing today's input exactly is
  // what lets this change claim it moved audio and nothing else.
  const tone = samples.slice(a, b + 1);
  for (let i = 0; i < fade && i < tone.length; i++) {
    tone[i] *= i / fade;
    tone[tone.length - 1 - i] *= i / fade;
  }
  const { contour, pinnedFraction } = measureContour(tone, sampleRate, f0Center, rangeSemitones);

  return {
    samples: cut,
    sampleRate,
    durationMs: (tone.length / sampleRate) * 1000,
    onsetMs: ((a - onsetA) / sampleRate) * 1000,
    toneStartMs: (a / sampleRate) * 1000,
    sourceMs: (samples.length / sampleRate) * 1000,
    contour,
    pinnedFraction,
  };
}

/**
 * Trim for the corpus range measurement. A player's 10 would discard a fifth of
 * the excursion citation tones are made of — measured on Jane's 120 takes, p10
 * gives ±4.8 st and clips both the T2 dip and the T4 floor flat; p2 gives ±7.35
 * and still trims the 94Hz creak frames that would otherwise stretch it to ±11.5.
 */
const CORPUS_TRIM_PERCENT = 2;

/** The speaker's voice, as measured from the takes themselves. */
export interface PitchReference {
  f0Center: number;
  rangeSemitones: number;
  /** Voiced frames the measurement is drawn from — sparse means don't trust it. */
  frames: number;
}

/**
 * Measures a recording session's own f0Center and tone space.
 *
 * A number in `speakers.json` is a measurement of one sitting, and pitch drifts
 * between them: Jane's 168 was taken from the four `ma` captures and sat below
 * the register she used a session later, which pinned six T1 clips flat against
 * chao 5. Measuring per session removes the drift, and measuring the range
 * removes the assumption that everyone's excursion is the tracker's default 5.
 *
 * One pass. The tracker's semitones are computed against a centre, but the slew
 * clamp only ever compares consecutive frames, so shifting the centre shifts
 * every value by the same constant — the recentred semitones can be derived
 * from the f0s directly rather than tracked a second time.
 *
 * Returns null when the session is too sparse for `computeF0Center` /
 * `computeRangeSemitones` to say anything, in which case the caller should keep
 * whatever it had.
 */
export function measurePitchReference(
  recordings: Array<{ samples: Float32Array; sampleRate: number }>,
  seedF0Center: number,
): PitchReference | null {
  const f0s: number[] = [];
  for (const { samples, sampleRate } of recordings) {
    const tracker = new PitchTracker({ sampleRate, f0Center: seedF0Center });
    for (let s = 0; s + WIN <= samples.length; s += HOP) {
      const state = tracker.push(samples.subarray(s, s + WIN));
      if (state.voiced && state.f0) f0s.push(state.f0);
    }
  }

  const f0Center = computeF0Center(f0s);
  if (f0Center === null) return null;
  const rangeSemitones = computeRangeSemitones(
    f0s.map((f0) => hzToSemitones(f0, f0Center)),
    CORPUS_TRIM_PERCENT,
  );
  if (rangeSemitones === null) return null;
  return { f0Center, rangeSemitones, frames: f0s.length };
}

/**
 * How much of a contour's edges to ignore when hunting for its real dip or
 * peak.
 *
 * Voicing starts mid-consonant and creak often takes the last frames, so the
 * loudest excursion near either edge is frequently onset/offset noise, not the
 * tone. Trimmed the same way `computeRangeSemitones` trims a speaker's range:
 * an artefact at the very edge should not get to define the shape.
 */
export const EXTREMUM_TRIM_FRAC = 0.08;

/**
 * Reduces a measured contour to a corridor polyline with a *fixed* node count
 * and role per tone, rather than however many Douglas–Peucker bends survive a
 * threshold. Words of the same tone used to come out with different vertex
 * counts and different shapes — some picked up extra bends from measurement
 * wobble — so the tunnels didn't read as one consistent shape per tone. Fixing
 * the template (what each node *means*) while still measuring each node's
 * value and time from that word's own contour keeps natural per-word timing
 * without the noise:
 *
 * | Tone | Nodes | Roles |
 * |---|---|---|
 * | 1 | 2 | start, end — both forced to the same value (flat) |
 * | 2 | 3 | start, interior min, end |
 * | 3 | 4 | start, interior min, mid-rise (real sample nearest halfway between the min and the end), end |
 * | 4 | 3 | start, interior max, end |
 *
 * `start` extends outward to t=0 exactly as the old simplifier did — voicing
 * starts after the clip does, and a corridor that simply stopped would have no
 * wall there.
 *
 * `end` does *not* just take the last measured frame: a syllable's pitch often
 * releases after the tone completes (T2 here falls back from its peak toward
 * ~3 once the vowel is done), and PRD §6 is explicit that the release is not
 * part of the tone and must not be modelled. So `end` holds at the furthest
 * point reached in the tone's direction of travel *after* its interior
 * extremum — the peak for a rising tone, the floor for a falling one — rather
 * than wherever voicing happens to trail off.
 */
export function templateContour(tone: Tone, contour: ContourPoint[]): ContourPoint[] {
  if (contour.length === 0) return [];

  const start: ContourPoint = [0, contour[0][1]];

  if (tone === 1) {
    const level = trimmedMean(contour);
    const flat: ContourPoint[] = [[0, level], [1, level]];
    return flat.map(round2);
  }

  if (tone === 2) {
    const min = trimmedExtremum(contour, "min");
    const end = holdValue(contour, min[0], "max");
    return [start, min, end].map(round2);
  }

  if (tone === 4) {
    const max = trimmedExtremum(contour, "max");
    const end = holdValue(contour, max[0], "min");
    return [start, max, end].map(round2);
  }

  // Tone 3: start, min, a real sample near the temporal midpoint of the rise, end.
  const min = trimmedExtremum(contour, "min");
  const midT = (min[0] + 1) / 2;
  const midRise = nearestSample(contour, midT);
  const end = holdValue(contour, midRise[0], "max");
  return [start, min, midRise, end].map(round2);
}

/**
 * The furthest chao reached (min or max) from `fromT` to the end of the
 * contour, held at t=1 — the "complete, then hold" value for a tone's final
 * node. See `templateContour`.
 */
function holdValue(contour: ContourPoint[], fromT: number, kind: "min" | "max"): ContourPoint {
  const tail = contour.filter((p) => p[0] >= fromT);
  const pool = tail.length > 0 ? tail : contour;
  let best = pool[0];
  for (const p of pool) {
    if (kind === "min" ? p[1] < best[1] : p[1] > best[1]) best = p;
  }
  return [1, best[1]];
}

/** The interior of a contour, excluding the first/last EXTREMUM_TRIM_FRAC. */
function trimmedInterior(contour: ContourPoint[]): ContourPoint[] {
  if (contour.length < 3) return contour;
  const lo = EXTREMUM_TRIM_FRAC;
  const hi = 1 - EXTREMUM_TRIM_FRAC;
  const trimmed = contour.filter((p) => p[0] >= lo && p[0] <= hi);
  return trimmed.length > 0 ? trimmed : contour;
}

/** Mean chao over the trimmed interior — the level a "flat" tone should hold. */
function trimmedMean(contour: ContourPoint[]): number {
  const interior = trimmedInterior(contour);
  return interior.reduce((sum, p) => sum + p[1], 0) / interior.length;
}

/**
 * The interior point of lowest ("min") or highest ("max") chao.
 *
 * Real measured contours essentially never tie exactly, so a tie-break rule
 * only matters on paper; this keeps the first occurrence, same as before.
 */
function trimmedExtremum(contour: ContourPoint[], kind: "min" | "max"): ContourPoint {
  const interior = trimmedInterior(contour);
  let best = interior[0];
  for (const p of interior) {
    if (kind === "min" ? p[1] < best[1] : p[1] > best[1]) best = p;
  }
  return best;
}

/** The measured point whose time is closest to `t`. */
function nearestSample(contour: ContourPoint[], t: number): ContourPoint {
  let best = contour[0];
  let bestDist = Math.abs(best[0] - t);
  for (const p of contour) {
    const d = Math.abs(p[0] - t);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

function round2(p: ContourPoint): ContourPoint {
  return [Number(p[0].toFixed(4)), Number(p[1].toFixed(3))];
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
