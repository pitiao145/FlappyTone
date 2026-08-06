/**
 * Assigns ids to a word list without ever moving one that already exists.
 *
 * `id` is the durable identity of a recording: it is the blob key, the cut
 * clip's filename, and the manifest entry the game looks a cue up by. Once Jane
 * has recorded a word, its id must never come to mean a different word.
 *
 * Recomputing ids from list order alone breaks that. With 是/事/市 all `shì`,
 * inserting 试 between the first two turns `shi4b` from 事 into 试 and `shi4c`
 * from 市 into 事 — silently relabelling audio that is already recorded. The
 * list is expected to grow, so this is a matter of when, not whether.
 *
 * So the shipped `wordlist.ts` is treated as a registry rather than an output:
 * a word already in it keeps the id it was given, and only genuinely new words
 * mint one. Pure, so the behaviour is testable without touching the filesystem.
 */

import { idFor } from "./pinyin.ts";

export interface WordInput {
  hanzi: string;
  pinyin: string;
}

export interface AssignedWord extends WordInput {
  id: string;
}

/**
 * A word's identity, independent of its id or its position. Two rows with the
 * same hanzi *and* the same pinyin are the same word; the same hanzi read a
 * different way (行 xíng / háng) is not.
 */
function keyOf(word: WordInput): string {
  return `${word.hanzi.trim()}\t${word.pinyin.normalize("NFC").trim().toLowerCase()}`;
}

/** Suffixes for homophones: b, c, … z, then za, zb, … Never a digit, which would read as a tone. */
function suffixed(base: string, n: number): string {
  if (n === 0) return base;
  let suffix = "";
  let k = n;
  while (k > 0) {
    suffix = String.fromCharCode(97 + (k % 25 || 25)) + suffix;
    k = Math.floor((k - 1) / 25);
  }
  return base + suffix;
}

export interface AssignResult {
  words: AssignedWord[];
  /** Words that kept an id from the existing registry. */
  kept: AssignedWord[];
  /** Words that were minted an id for the first time. */
  added: AssignedWord[];
  /**
   * Registry entries absent from the new list. Not deleted here — they may
   * already have recordings, and dropping them is the caller's decision.
   */
  dropped: AssignedWord[];
}

/**
 * @param existing the current `WORDS`, treated as authoritative for ids
 * @param incoming the freshly imported list, in the order it should be recorded
 */
export function assignIds(existing: AssignedWord[], incoming: WordInput[]): AssignResult {
  const byKey = new Map(existing.map((w) => [keyOf(w), w]));
  // Every id the registry has ever handed out stays reserved, including ids of
  // words dropped from the list — their recordings may still be in storage.
  const taken = new Set(existing.map((w) => w.id));

  const words: AssignedWord[] = [];
  const kept: AssignedWord[] = [];
  const added: AssignedWord[] = [];
  const seen = new Set<string>();

  for (const word of incoming) {
    const key = keyOf(word);
    if (seen.has(key)) continue; // the same word twice in one file is one word
    seen.add(key);

    const previous = byKey.get(key);
    if (previous) {
      const entry = { ...word, id: previous.id };
      words.push(entry);
      kept.push(entry);
      continue;
    }

    const base = idFor(word.pinyin);
    let n = 0;
    while (taken.has(suffixed(base, n))) n++;
    const id = suffixed(base, n);
    taken.add(id);

    const entry = { ...word, id };
    words.push(entry);
    added.push(entry);
  }

  const incomingKeys = new Set(words.map(keyOf));
  const dropped = existing.filter((w) => !incomingKeys.has(keyOf(w)));

  return { words, kept, added, dropped };
}
