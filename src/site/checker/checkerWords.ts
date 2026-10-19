/**
 * The public tone checker's own word list (/tools/tone-checker). Outside
 * `TIER_LIMITS.wordsPerTone` on purpose: this page is a free sample for
 * anyone, so the guest visualiser cap (0) does not apply here, and nothing in
 * `tiers.ts` changes. Every word plays for a guest ticket (sampler list or no
 * TOCFL level — checkerWords.test.ts).
 *
 * The measured clip data is copied from src/data/wordsFallback.json (default
 * speaker, textbook) so the page does not ship the whole catalog;
 * checkerWords.test.ts fails if a copy drifts. Pure data: no audio imports.
 */

import type { Tone } from "../../game/gates.ts";
import type { Polyline } from "../../game/tuning.ts";

export interface CheckerWord {
  id: string;
  /** Traditional characters (hard rule 9). */
  hanzi: string;
  /** Written pinyin with tone marks. */
  pinyin: string;
  english: string;
  /** The word's main (first toned) tone. */
  tone: Tone;
  /** Written tone per syllable. */
  tones: Tone[];
  /** chao over normalised tone time, [t, chao]. */
  polyline: Polyline;
  onsetS: number;
  durationS: number;
  clipS: number;
}

export const CHECKER_WORDS: readonly CheckerWord[] = [
  {
    id: "ma1b",
    hanzi: "媽",
    pinyin: "mā",
    english: "mother",
    tone: 1,
    tones: [1],
    polyline: [[0, 4.681], [1, 4.681]],
    onsetS: 0.232,
    durationS: 1.4767,
    clipS: 1.8367,
  },
  {
    id: "shu1",
    hanzi: "書",
    pinyin: "shū",
    english: "book",
    tone: 1,
    tones: [1],
    polyline: [[0, 4.856], [1, 4.856]],
    onsetS: 0.232,
    durationS: 0.9434,
    clipS: 1.3033,
  },
  {
    id: "tian1",
    hanzi: "天",
    pinyin: "tiān",
    english: "sky, day",
    tone: 1,
    tones: [1],
    polyline: [[0, 4.328], [1, 4.328]],
    onsetS: 0.232,
    durationS: 1.1567,
    clipS: 1.5167,
  },
  {
    id: "hua1",
    hanzi: "花",
    pinyin: "huā",
    english: "flower",
    tone: 1,
    tones: [1],
    polyline: [[0, 4.458], [1, 4.458]],
    onsetS: 0.232,
    durationS: 1.1354,
    clipS: 1.4953,
  },
  {
    id: "ba1",
    hanzi: "八",
    pinyin: "bā",
    english: "eight",
    tone: 1,
    tones: [1],
    polyline: [[0, 4.444], [1, 4.444]],
    onsetS: 0.232,
    durationS: 1.178,
    clipS: 1.538,
  },
  {
    id: "ren2",
    hanzi: "人",
    pinyin: "rén",
    english: "person",
    tone: 2,
    tones: [2],
    polyline: [[0, 2.571], [0.3251, 2.178], [1, 5]],
    onsetS: 0.232,
    durationS: 1.05,
    clipS: 1.41,
  },
  {
    id: "lai2",
    hanzi: "來",
    pinyin: "lái",
    english: "to come",
    tone: 2,
    tones: [2],
    polyline: [[0, 2.603], [0.4673, 1.976], [1, 5]],
    onsetS: 0.232,
    durationS: 1.05,
    clipS: 1.41,
  },
  {
    id: "qian2",
    hanzi: "錢",
    pinyin: "qián",
    english: "money",
    tone: 2,
    tones: [2],
    polyline: [[0, 3.415], [0.3982, 2.402], [1, 5]],
    onsetS: 0.254,
    durationS: 1.0714,
    clipS: 1.4527,
  },
  {
    id: "xue2",
    hanzi: "學",
    pinyin: "xué",
    english: "to study",
    tone: 2,
    tones: [2],
    polyline: [[0, 2.656], [0.2696, 2.009], [1, 4.773]],
    onsetS: 0.232,
    durationS: 1.0287,
    clipS: 1.3887,
  },
  {
    id: "ma2",
    hanzi: "麻",
    pinyin: "má",
    english: "hemp",
    tone: 2,
    tones: [2],
    polyline: [[0, 2.07], [0.2696, 1.577], [1, 5]],
    onsetS: 0.232,
    durationS: 1.0287,
    clipS: 1.3887,
  },
  {
    id: "ni3",
    hanzi: "你",
    pinyin: "nǐ",
    english: "you",
    tone: 3,
    tones: [3],
    polyline: [[0, 2.988], [0.6389, 1.659], [0.8268, 3.256], [1, 4.694]],
    onsetS: 0.232,
    durationS: 1.1354,
    clipS: 1.4953,
  },
  {
    id: "hao3",
    hanzi: "好",
    pinyin: "hǎo",
    english: "good",
    tone: 3,
    tones: [3],
    polyline: [[0, 3.445], [0.6274, 1.496], [0.8222, 2.834], [1, 4.541]],
    onsetS: 0.232,
    durationS: 0.986,
    clipS: 1.346,
  },
  {
    id: "wo3",
    hanzi: "我",
    pinyin: "wǒ",
    english: "I, me",
    tone: 3,
    tones: [3],
    polyline: [[0, 3.024], [0.6844, 1.364], [0.8503, 2.938], [1, 4.306]],
    onsetS: 0.232,
    durationS: 1.0287,
    clipS: 1.3887,
  },
  {
    id: "ma3b",
    hanzi: "馬",
    pinyin: "mǎ",
    english: "horse",
    tone: 3,
    tones: [3],
    polyline: [[0, 3.008], [0.7412, 1.705], [0.8683, 2.617], [1, 4.181]],
    onsetS: 0.232,
    durationS: 1.0074,
    clipS: 1.3673,
  },
  {
    id: "wu3",
    hanzi: "五",
    pinyin: "wǔ",
    english: "five",
    tone: 3,
    tones: [3],
    polyline: [[0, 4.162], [0.4355, 1], [0.7258, 1.598], [1, 4.934]],
    onsetS: 0.232,
    durationS: 1.0287,
    clipS: 1.3887,
  },
  {
    id: "shi4",
    hanzi: "是",
    pinyin: "shì",
    english: "to be",
    tone: 4,
    tones: [4],
    polyline: [[0, 4.186], [0.3303, 4.693], [1, 1.478]],
    onsetS: 0.232,
    durationS: 0.5167,
    clipS: 0.8767,
  },
  {
    id: "da4",
    hanzi: "大",
    pinyin: "dà",
    english: "big",
    tone: 4,
    tones: [4],
    polyline: [[0, 4.188], [0.1983, 4.536], [1, 1.82]],
    onsetS: 0.232,
    durationS: 0.538,
    clipS: 0.898,
  },
  {
    id: "ma4b",
    hanzi: "罵",
    pinyin: "mà",
    english: "to scold",
    tone: 4,
    tones: [4],
    polyline: [[0, 3.087], [0.3971, 4.994], [1, 1.724]],
    onsetS: 0.232,
    durationS: 0.6447,
    clipS: 1.0047,
  },
  {
    id: "ba4",
    hanzi: "爸",
    pinyin: "bà",
    english: "dad",
    tone: 4,
    tones: [4],
    polyline: [[0, 4.091], [0.2064, 4.397], [1, 1.258]],
    onsetS: 0.232,
    durationS: 0.5167,
    clipS: 0.8767,
  },
  {
    id: "si4",
    hanzi: "四",
    pinyin: "sì",
    english: "four",
    tone: 4,
    tones: [4],
    polyline: [[0, 4.261], [0.2153, 4.796], [1, 1.582]],
    onsetS: 0.232,
    durationS: 0.4954,
    clipS: 0.8767,
  },
  {
    id: "zhongguo12",
    hanzi: "中國",
    pinyin: "zhōng guó",
    english: "China",
    tone: 1,
    tones: [1,2],
    polyline: [[0, 4.835], [0.3566, 4.872], [0.4658, 2.209], [0.5463, 2.007], [0.7238, 2.23], [1, 4.046]],
    onsetS: 0.232,
    durationS: 1.562,
    clipS: 1.922,
  },
  {
    id: "taiwan21",
    hanzi: "台灣",
    pinyin: "tái wān",
    english: "variant of 臺灣|台湾[Tai2 wan1]",
    tone: 2,
    tones: [2,1],
    polyline: [[0, 2.412], [0.2083, 2], [0.3868, 3.715], [0.433, 3.704], [0.4479, 3.692], [0.5207, 4.235], [1, 4.159]],
    onsetS: 0.232,
    durationS: 1.434,
    clipS: 1.794,
  },
  {
    id: "xihuan31",
    hanzi: "喜歡",
    pinyin: "xǐ huān",
    english: "to like; to be fond of",
    tone: 3,
    tones: [3,1],
    polyline: [[0, 3.341], [0.0779, 3.215], [0.2803, 1.72], [0.4066, 1.72], [0.4221, 1.443], [0.4983, 2.881], [0.5294, 3.846], [1, 3.846]],
    onsetS: 0.232,
    durationS: 1.37,
    clipS: 1.73,
  },
  {
    id: "pengyou23",
    hanzi: "朋友",
    pinyin: "péng yǒu",
    english: "friend; 位",
    tone: 2,
    tones: [2,3],
    polyline: [[0, 2.761], [0.2345, 2.987], [0.3518, 4.853], [0.4267, 4.853], [0.4414, 5], [0.7036, 1.189], [0.8355, 1.389], [1, 3.579]],
    onsetS: 0.318,
    durationS: 1.4554,
    clipS: 1.9007,
  },
];

/** The word preselected when there is no (valid) `?word=`. */
export const DEFAULT_CHECKER_WORD = "ma3b";

/** The word for `?word=<id>`, or the default for a missing/unknown id. */
export function checkerWordFor(id: string | null | undefined): CheckerWord {
  return (
    CHECKER_WORDS.find((w) => w.id === id) ??
    CHECKER_WORDS.find((w) => w.id === DEFAULT_CHECKER_WORD)!
  );
}
