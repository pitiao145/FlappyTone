/**
 * The one-ruler clip shape (brief 51 step 4; the rule of brief 43).
 *
 * One take in, one target shape out, placed on the speaker's ONE ruler
 * instead of the old per-tone cohort stretch (`clipNormalize.ts`). This is the
 * shaping code of `src/dev/bench39/make-shapes.mjs`, which built
 * `shapes-v2.json`, moved into a module so `process-clips` and the
 * offline proof (`bench39/ruler-pipeline-check.mjs`) run the very same lines:
 *
 * - per-clip gate: the noise floor is measured from the clip itself
 *   (`clipNoiseFloor`), not the tracker's fixed default;
 * - the cut: `cutClip` at the ruler's measuring centre. A pair is cut by the
 *   pipeline's own syllable finder (`multiSyllableSpan`); brief 49 measured
 *   that its tone-pair cut finder gives no gain here (report 49, step 7);
 * - the ruler: chao 3 = the speaker's middle, chao 5 / chao 1 = its upper and
 *   lower halves (`semitonesToChao`, clamps at 1 and 5);
 * - the fit: knee templates for one syllable (`templateContourKnee`), the
 *   refined pair fit for two or more (`refinedMultiSyllablePolyline`).
 *
 * Dev-only; no Web Audio, no network.
 */
import {
  clipNoiseFloor,
  cutClip,
  templateContourKnee,
  MEASURE_RANGE_SEMITONES,
  type ContourPoint,
} from "./clipCut.ts";
import { refinedMultiSyllablePolyline } from "./clipCutMulti.ts";
import { pinnedFractionOf } from "./clipNormalize.ts";
import { semitonesToChao } from "../pitch/math.ts";
import type { Tone } from "../game/gates.ts";

/** A speaker's one ruler, as brief 43 measured it. */
export interface ClipRuler {
  /** Chao 3, in Hz. */
  middleHz: number;
  /** Semitones from the middle up to chao 5. */
  upSemitones: number;
  /** Semitones from the middle down to chao 1. */
  downSemitones: number;
  /**
   * The centre every clip is cut at (the search band and the per-clip gate
   * depend on it). make-shapes cut at its first-pass middle, so this is kept
   * apart from `middleHz` to reproduce `shapes-v2.json` exactly.
   */
  measuredAtHz: number;
  /** Where the numbers come from. */
  source: string;
}

/**
 * Jane's ruler: the `ruler` head of `src/dev/local/shapes-v2.json` (brief 43,
 * 357 newer textbook clips). `golive-shapes` writes the same numbers into
 * `words.meta.reference`.
 */
export const JANE_RULER: ClipRuler = {
  middleHz: 197.4,
  upSemitones: 5.75,
  downSemitones: 7.25,
  measuredAtHz: 197,
  source: "brief 43, shapes-v2.json ruler (357 newer textbook clips)",
};

const RULERS: Record<string, ClipRuler> = { jane: JANE_RULER };

/** The speaker's ruler, or null when none has been measured (a new voice). */
export function rulerFor(speakerId: string): ClipRuler | null {
  return RULERS[speakerId] ?? null;
}

/** The `meta.reference` a one-ruler clip carries (same shape as `golive-shapes`). */
export function rulerReference(ruler: ClipRuler, session: string) {
  return {
    session,
    f0Center: ruler.middleHz,
    // The mean of the two halves, so process-clips' borrow fallback still
    // reads a valid number (report 48, step 3).
    rangeSemitones: (ruler.upSemitones + ruler.downSemitones) / 2,
    upSemitones: ruler.upSemitones,
    downSemitones: ruler.downSemitones,
  };
}

export interface RulerShape {
  polyline: ContourPoint[];
  /** Every voiced frame on the ruler, [t, chao], rounded as stored. */
  contour: ContourPoint[];
  /** File start → tone start, ms. */
  onsetMs: number;
  /** The tone window, ms. */
  durationMs: number;
  /** The whole take, ms. */
  clipMs: number;
  syllableSpans?: Array<[number, number]>;
  underSegmented?: boolean;
  overSegmented?: boolean;
  pinnedFraction: number;
  /** False when a knee node was dropped (single syllable only). */
  knee: boolean | null;
  /** Nodes the pair fit added. */
  fitNodesAdded: number;
  /** The per-clip gate used. */
  noiseFloor: number;
}

const R = MEASURE_RANGE_SEMITONES;

/** One take on the one ruler. Throws like `cutClip` ("no voiced frames"). */
export function shapeOnRuler(
  samples: Float32Array,
  sampleRate: number,
  ruler: ClipRuler,
  tone: Tone,
  syllables: number,
): RulerShape {
  const at = ruler.measuredAtHz;
  const noiseFloor = clipNoiseFloor(samples, sampleRate, at);
  const c = cutClip(samples, sampleRate, at, R, tone, syllables, { noiseFloor });
  // The cutter's contour is on a wide ±15 st board (chao = 3 + 2·st/15):
  // back to semitones from `at`, then from the ruler's middle.
  const midShift = 12 * Math.log2(ruler.middleHz / at);
  const contour: ContourPoint[] = c.contour.map(([t, chao]) => {
    const st = (chao - 3) * (R / 2) - midShift;
    return [
      Number(t.toFixed(4)),
      Number(semitonesToChao(st, ruler.upSemitones, ruler.downSemitones).toFixed(3)),
    ];
  });
  const spans = c.syllableSpans ?? [[0, 1]];
  let polyline: ContourPoint[];
  let knee: boolean | null = null;
  let fitNodesAdded = 0;
  if (syllables > 1) {
    const fit = refinedMultiSyllablePolyline(contour, spans);
    polyline = fit.polyline;
    fitNodesAdded = fit.added;
  } else {
    const fit = templateContourKnee(tone, contour);
    polyline = fit.polyline;
    knee = fit.knee;
  }
  return {
    polyline,
    contour,
    onsetMs: c.toneStartMs,
    durationMs: c.durationMs,
    clipMs: c.sourceMs,
    syllableSpans: c.syllableSpans,
    underSegmented: c.underSegmented,
    overSegmented: c.overSegmented,
    pinnedFraction: pinnedFractionOf(contour),
    knee,
    fitNodesAdded,
    noiseFloor,
  };
}
