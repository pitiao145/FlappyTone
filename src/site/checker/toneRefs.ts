/**
 * The tone visualizer's targets (/tools/tone-visualizer): each tone, and two
 * sandhi pairs, in two versions the visitor chooses between and is scored
 * against:
 *
 * - **Real speech**: our native speaker's natural-speed average for that tone
 *   or pair (`AVERAGED_TONE_SHAPE.natural` / `AVERAGED_PAIR_SHAPE.natural`,
 *   the same averages the app's tone accuracy uses), over the median length
 *   of her natural takes.
 * - **Textbook**: the classic Chao tone letters (55, 35, 214, 51) drawn as
 *   lines, stretched over the same length, so only the shape differs.
 *
 * No audio: hearing real words is what the app adds. Pure data + math.
 */

import type { Tone } from "../../game/gates.ts";
import { AVERAGED_PAIR_SHAPE, AVERAGED_TONE_SHAPE } from "../../game/toneAverages.ts";
import type { Polyline } from "../../game/tuning.ts";

export type RefMode = "real" | "textbook";
export type RefId = "1" | "2" | "3" | "4" | "3-3" | "3-4";

export interface ToneRef {
  id: RefId;
  /** Tab label. */
  label: string;
  /** Written tones (what a learner looks up). */
  tones: Tone[];
  /** Example in pinyin + characters (Traditional), for the caption only. */
  example: string;
  /**
   * Median length of our speaker's natural takes for this target, seconds
   * (default speaker, published, 19 Oct 2026). Both versions use it.
   */
  durationS: number;
  real: Polyline;
  textbook: Polyline;
  /** One line on how real speech differs from the textbook line. */
  diff: string;
}

/** A 61-point average as a polyline over normalised time. */
function fromAverage(points: number[]): Polyline {
  return points.map((c, i) => [i / (points.length - 1), c] as [number, number]);
}

/** Chao tone letters for one syllable, over [t0, t1]. */
const LETTERS: Record<Tone, number[]> = {
  1: [5, 5],
  2: [3, 5],
  3: [2, 1, 4],
  4: [5, 1],
};

function letters(tones: Tone[]): Polyline {
  const out: Polyline = [];
  const span = 1 / tones.length;
  // A short pause between syllables, so the spline does not bend one
  // syllable's end into the next one's start.
  const gap = tones.length > 1 ? 0.04 : 0;
  tones.forEach((t, k) => {
    const t0 = k * span + (k > 0 ? gap / 2 : 0);
    const t1 = (k + 1) * span - (k < tones.length - 1 ? gap / 2 : 0);
    const ls = LETTERS[t];
    ls.forEach((c, i) => out.push([t0 + ((t1 - t0) * i) / (ls.length - 1), c]));
  });
  return out;
}

const nat = AVERAGED_TONE_SHAPE.natural;
const natPair = AVERAGED_PAIR_SHAPE.natural;

export const TONE_REFS: readonly ToneRef[] = [
  {
    id: "1",
    label: "First tone",
    tones: [1],
    example: "mā 媽",
    durationS: 0.719,
    real: fromAverage(nat[1]),
    textbook: letters([1]),
    diff: "Real speech holds it level, but a little below the very top of the voice.",
  },
  {
    id: "2",
    label: "Second tone",
    tones: [2],
    example: "má 麻",
    durationS: 0.751,
    real: fromAverage(nat[2]),
    textbook: letters([2]),
    diff: "Real speech dips a little first, rises only in the second half, and stops short of the top.",
  },
  {
    id: "3",
    label: "Third tone",
    tones: [3],
    example: "mǎ 馬",
    durationS: 0.709,
    real: fromAverage(nat[3]),
    textbook: letters([3]),
    diff: "Real speech starts higher, dips in the middle but not to the floor, then climbs back.",
  },
  {
    id: "4",
    label: "Fourth tone",
    tones: [4],
    example: "mà 罵",
    durationS: 0.495,
    real: fromAverage(nat[4]),
    textbook: letters([4]),
    diff: "Real speech peaks just below the top and falls fast, but not all the way to the floor.",
  },
  {
    id: "3-3",
    label: "3 + 3",
    tones: [3, 3],
    example: "nǐ hǎo 你好",
    durationS: 0.986,
    // Spoken as 2 + 3: the third-tone sandhi rule.
    real: fromAverage(natPair["2-3"]),
    textbook: letters([3, 3]),
    diff: "Two third tones in a row: the first one rises like a second tone (ní hǎo).",
  },
  {
    id: "3-4",
    label: "3 + 4",
    tones: [3, 4],
    example: "kě shì 可是",
    durationS: 0.741,
    real: fromAverage(natPair["3-4"]),
    textbook: letters([3, 4]),
    diff: "A third tone before another tone stays low and never rises: a “half third tone”.",
  },
];

export const DEFAULT_REF: RefId = "3";

/** The target for `?tone=`; unknown or missing → Tone 3. */
export function refFor(id: string | null | undefined): ToneRef {
  return TONE_REFS.find((r) => r.id === id) ?? TONE_REFS.find((r) => r.id === DEFAULT_REF)!;
}

/** `?mode=textbook` → textbook; anything else → real speech. */
export function modeFor(v: string | null | undefined): RefMode {
  return v === "textbook" ? "textbook" : "real";
}

export function polylineOf(ref: ToneRef, mode: RefMode): Polyline {
  return mode === "real" ? ref.real : ref.textbook;
}
