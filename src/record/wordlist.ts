/**
 * Types for a word Jane is asked to say. The `WORDS` array that used to live
 * here (the placeholder/shipped list, in recording order) was retired in
 * Task 13 (Sep 2026): the catalog is a Supabase `words` table now, not a flat
 * file, and `npm run import-words` is the live path for adding a word.
 *
 * `Tone`/`WordItem` and the registry helpers in `wordIds.ts` (`assignIds`)
 * stay — `import-words.ts` still uses them to mint an id for a new word
 * without ever moving one that already exists.
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

