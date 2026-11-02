/**
 * The tone visualizer's targets (/tools/tone-visualizer): each tone and all
 * 16 tone pairs, in two versions the visitor chooses between and is scored
 * against — the same two the app calls Spoken and Standard:
 *
 * - **Real speech** (Spoken): our native speaker's natural-speed average for
 *   that tone or pair (`AVERAGED_TONE_SHAPE.natural` /
 *   `AVERAGED_PAIR_SHAPE.natural`, the averages the app's tone accuracy uses).
 * - **Textbook** (Standard): her average at slow, clear speed
 *   (`AVERAGED_*.textbook`), what the app's Standard style plays.
 *
 * Both are drawn over the same length, so only the shape differs. No audio:
 * hearing real words is what the app adds. Pure data + math.
 */

import type { Tone } from "../../game/gates.ts";
import { AVERAGED_PAIR_SHAPE, AVERAGED_TONE_SHAPE } from "../../game/toneAverages.ts";
import type { Polyline } from "../../game/tuning.ts";

export type RefMode = "real" | "textbook";
export type RefId = "1" | "2" | "3" | "4" | `${Tone}-${Tone}`;

export interface ToneRef {
  id: RefId;
  /** Tab label. */
  label: string;
  /** Written tones (what a learner looks up). */
  tones: Tone[];
  /** Example in pinyin + characters (Traditional), for the caption only. */
  example: string;
  /**
   * Length the line is drawn over, seconds. Single tones and 3 + 3 / 3 + 4
   * are the median of our speaker's natural takes (19 Oct 2026); the other
   * pairs use 0.85 s, between those two, until they are measured.
   */
  durationS: number;
  real: Polyline;
  textbook: Polyline;
  /** One line on how real speech differs from the slow, clear line. */
  diff: string;
}

/** A 61-point average as a polyline over normalised time. */
function fromAverage(points: number[]): Polyline {
  return points.map((c, i) => [i / (points.length - 1), c] as [number, number]);
}

const HALF_THIRD = "A third tone before another tone stays low and never rises: a “half third tone”.";

const nat = AVERAGED_TONE_SHAPE.natural;
const std = AVERAGED_TONE_SHAPE.textbook;
const natPair = AVERAGED_PAIR_SHAPE.natural;
const stdPair = AVERAGED_PAIR_SHAPE.textbook;

const SINGLES: readonly ToneRef[] = [
  {
    id: "1",
    label: "First tone",
    tones: [1],
    example: "mā 媽",
    durationS: 0.719,
    real: fromAverage(nat[1]),
    textbook: fromAverage(std[1]),
    diff: "Real speech holds it level, but a little below the very top of the voice.",
  },
  {
    id: "2",
    label: "Second tone",
    tones: [2],
    example: "má 麻",
    durationS: 0.751,
    real: fromAverage(nat[2]),
    textbook: fromAverage(std[2]),
    diff: "Real speech dips a little first, rises only in the second half, and stops short of the top.",
  },
  {
    id: "3",
    label: "Third tone",
    tones: [3],
    example: "mǎ 馬",
    durationS: 0.709,
    real: fromAverage(nat[3]),
    textbook: fromAverage(std[3]),
    diff: "Real speech starts higher, dips in the middle but not to the floor, then climbs back.",
  },
  {
    id: "4",
    label: "Fourth tone",
    tones: [4],
    example: "mà 罵",
    durationS: 0.495,
    real: fromAverage(nat[4]),
    textbook: fromAverage(std[4]),
    diff: "Real speech peaks just below the top and falls fast, but not all the way to the floor.",
  },
];

/** One example per pair, from the catalog's own (Traditional) words. */
const PAIR_INFO: Record<string, { example: string; durationS?: number; diff?: string }> = {
  "1-1": { example: "jīn tiān 今天" },
  "1-2": { example: "zhōng guó 中國" },
  "1-3": { example: "duō shǎo 多少" },
  "1-4": { example: "chū qù 出去" },
  "2-1": { example: "tái wān 台灣" },
  "2-2": { example: "xué xí 學習" },
  "2-3": { example: "péng yǒu 朋友" },
  "2-4": { example: "xué xiào 學校" },
  "3-1": { example: "hǎo chī 好吃", diff: HALF_THIRD },
  "3-2": { example: "měi guó 美國", diff: HALF_THIRD },
  "3-3": {
    example: "nǐ hǎo 你好",
    durationS: 0.986,
    diff: "Two third tones in a row: the first one rises like a second tone (ní hǎo).",
  },
  "3-4": { example: "kě shì 可是", durationS: 0.741, diff: HALF_THIRD },
  "4-1": { example: "shàng bān 上班" },
  "4-2": { example: "wèn tí 問題" },
  "4-3": { example: "xià wǔ 下午" },
  "4-4": { example: "zài jiàn 再見" },
};

const PAIRS: readonly ToneRef[] = Object.entries(PAIR_INFO).map(([id, info]) => {
  const tones = id.split("-").map(Number) as Tone[];
  // 3 + 3 is said as 2 + 3 (the third-tone sandhi rule), in both versions.
  const key = id === "3-3" ? "2-3" : id;
  return {
    id: id as RefId,
    label: `${tones[0]} + ${tones[1]}`,
    tones,
    example: info.example,
    durationS: info.durationS ?? 0.85,
    real: fromAverage(natPair[key]),
    textbook: fromAverage(stdPair[key]),
    diff:
      info.diff ??
      "Each syllable keeps its own tone, but both are shorter and narrower than when said alone.",
  };
});

export const TONE_REFS: readonly ToneRef[] = [...SINGLES, ...PAIRS];

export const DEFAULT_REF: RefId = "3";

/** The target for `?tone=`; unknown or missing → Tone 3. */
export function refFor(id: string | null | undefined): ToneRef {
  return TONE_REFS.find((r) => r.id === id) ?? TONE_REFS.find((r) => r.id === DEFAULT_REF)!;
}

/** `?mode=real` (or `spoken`) → real speech; anything else → Standard. */
export function modeFor(v: string | null | undefined): RefMode {
  return v === "real" || v === "spoken" ? "real" : "textbook";
}

export function polylineOf(ref: ToneRef, mode: RefMode): Polyline {
  return mode === "real" ? ref.real : ref.textbook;
}
