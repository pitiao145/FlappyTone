/**
 * The demo's optional starting word (brief 25): a site page can open Try it
 * now with its own word flown first. Pure, so the SEO word lists are tested
 * against it (`demoSeed.test.ts`).
 */
import { isMulti, isSingle, type Word } from "../../game/words.ts";

/**
 * The word to fly first, or null for the standard pool. Only a word the game
 * can fly (one or two syllables; a neutral tone inside a two-syllable gate is
 * fine) and that is in the bundled catalog (`words`, built from
 * wordsFallback.json, so no fetch is needed).
 */
export function playableSeed(words: readonly Word[], id: string | null | undefined): Word | null {
  if (!id) return null;
  const w = words.find((x) => x.id === id);
  return w && (isSingle(w) || isMulti(w)) ? w : null;
}

/** The round: the seed first, then the drawn words without it, `gates` long. */
export function seededRound(seed: Word | null, drawn: readonly Word[], gates: number): Word[] {
  if (!seed) return drawn.slice(0, gates);
  return [seed, ...drawn.filter((w) => w.id !== seed.id)].slice(0, gates);
}
