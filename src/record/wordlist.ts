/**
 * What Jane is asked to say, in order.
 *
 * `id` is the filename stem all the way through: the blob key, the cut clip in
 * `public/ref/`, and the manifest entry the game looks a cue up by. Keep it
 * ASCII and unique — `wordlist.test.ts` enforces both, because a duplicate id
 * would silently overwrite a finished recording rather than fail.
 *
 * Ordering is the order she records in. Group by syllable rather than by tone:
 * saying mā má mǎ mà in a row is a drill she already knows, and the four takes
 * come out of one setting of her voice.
 */

export type Tone = 1 | 2 | 3 | 4;

export interface WordItem {
  /** Filename stem — lowercase letters and digits only. */
  id: string;
  hanzi: string;
  /** With the tone mark, as she should read it. */
  pinyin: string;
  tone: Tone;
}

/**
 * Placeholder list: the four syllables the game already ships, so the booth is
 * testable end to end before the real list exists. Replace wholesale.
 */
export const WORDS: WordItem[] = [
  { id: "ma1", hanzi: "妈", pinyin: "mā", tone: 1 },
  { id: "ma2", hanzi: "麻", pinyin: "má", tone: 2 },
  { id: "ma3", hanzi: "马", pinyin: "mǎ", tone: 3 },
  { id: "ma4", hanzi: "骂", pinyin: "mà", tone: 4 },
];
