/**
 * The app's TONEder word pools, per tier and style: every published
 * single-syllable word of the default speaker that this tier's clip ticket
 * may play. Mirrors the clips Worker's rules (`workers/clips/src/routes/clip.ts`):
 * `min_tier`, then the TOCFL level gate (sampler and untagged words always
 * play; otherwise one of the word's levels must be in the tier's union of
 * Beginner and Intermediate levels from `tiers.ts`). Spoken keeps only words
 * with a published natural take.
 *
 * Words come from the live catalog (`fetchCatalog`); the bundled fallback has
 * no natural-take data, so with only the fallback in hand Spoken uses the
 * guest pool (all 76 are known to have both styles; `toneTest.test.ts` checks
 * the 40-word subset against the Worker).
 */
import type { Tier } from "../game/tiers.ts";
import { tierLimits } from "../game/tiers.ts";
import { wordsForTier, type Word } from "../game/words.ts";
import type { TestWord, Tone } from "./toneTest.ts";

/** Mirrors the Worker's `SAMPLER_LIST_IDS`. */
const SAMPLERS = new Set(["sampler-beginner", "sampler-intermediate", "sampler-seo"]);

function tocflLevel(id: string): number | null {
  const m = /^tocfl([123])$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** The Worker's level gate, with the tier's level union read from `tiers.ts`. */
export function levelAllowed(listIds: readonly string[], tier: Tier): boolean {
  const levels = listIds.map(tocflLevel).filter((l): l is number => l !== null);
  if (levels.length === 0 || listIds.some((id) => SAMPLERS.has(id))) return true;
  const t = tierLimits()[tier];
  const union = new Set<number>([...(t.beginner.levels ?? []), ...(t.intermediate.levels ?? [])]);
  return levels.some((l) => union.has(l));
}

function toTestWord(w: Word): TestWord {
  return { id: w.id, hanzi: w.hanzi, pinyin: w.pinyin, tone: w.tone as Tone, english: w.english };
}

/** Every single-syllable word this tier's ticket can play, in this style. */
export function tierPool(
  words: readonly Word[],
  tier: Tier,
  style: "standard" | "spoken",
  speaker = "jane",
): TestWord[] {
  return wordsForTier([...words], tier)
    .filter(
      (w) =>
        w.speakerId === speaker &&
        w.syllables === 1 &&
        w.tone >= 1 &&
        w.tone <= 4 &&
        levelAllowed(w.listIds ?? [], tier) &&
        (style === "standard" || !!w.natural),
    )
    .map(toTestWord);
}

/** A pool needs a few words of every tone for a balanced round. */
export function usablePool(pool: readonly TestWord[]): boolean {
  return ([1, 2, 3, 4] as const).every((t) => pool.filter((w) => w.tone === t).length >= 3);
}
