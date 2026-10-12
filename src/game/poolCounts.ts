/**
 * "How many words will this choice draw from" — display only.
 *
 * Pure: no React, no Supabase, no Web Audio. Every count here is the `.length`
 * of a pool the game or the visualiser really builds, produced by calling the
 * same functions with the same arguments (`resolvedPool`, `wordsOfTone`,
 * `wordsOfCombo`, `wordsForList`). Nothing re-implements a filter, so a count
 * cannot drift from the pool a `Run` receives.
 *
 * Counts are `null` when there is nothing honest to say (inventory not loaded,
 * or an empty pool): a caller renders no label rather than `0` or `NaN`.
 */

import type { Tone } from "./gates.ts";
import type { Proficiency, Tier, TocflLevel } from "./tiers.ts";
import { tierLimits } from "./tiers.ts";
import {
  multiWords,
  resolvedPool,
  wordsForList,
  wordsInStyle,
  wordsOfCombo,
  wordsOfTone,
  type LevelChoice,
  type SpeechStyle,
  type Word,
} from "./words.ts";

type Inventory = readonly Word[] | null | undefined;

function orNull(n: number): number | null {
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Classic: the pool a `game` run of this proficiency + level draws from. */
export function classicCount(
  words: Inventory,
  tier: Tier,
  proficiency: Proficiency,
  level: LevelChoice | null,
  style: SpeechStyle,
): number | null {
  if (!words) return null;
  return orNull(resolvedPool([...words], tier, "game", proficiency, level, style).length);
}

/** Tone Drill: every word a drill run may draw from, across all tones. */
export function drillCount(words: Inventory, tier: Tier, style: SpeechStyle): number | null {
  if (!words) return null;
  return orNull(resolvedPool([...words], tier, "drill", "beginner", null, style).length);
}

/** Tone Drill, one tone: what a run drilling that tone draws from. */
export function drillToneCount(
  words: Inventory,
  tier: Tier,
  tone: Tone,
  style: SpeechStyle,
): number | null {
  if (!words) return null;
  const pool = resolvedPool([...words], tier, "drill", "beginner", null, style);
  return orNull(wordsOfTone(pool, tone).length);
}

/**
 * Tone pairs: the two-syllable words a `pairs` run (shuffle) draws from. The
 * run's pool also carries the single-syllable words (`capWordsPerCombo` keeps
 * them); only `multiWords` of it are ever drawn, so only those are counted.
 */
export function pairsCount(words: Inventory, tier: Tier, style: SpeechStyle): number | null {
  if (!words) return null;
  const pool = resolvedPool([...words], tier, "pairs", "beginner", null, style);
  return orNull(multiWords(pool).length);
}

/** Tone pairs, one exact combo (`pickMultiWord`'s `wordsOfCombo` over the run pool). */
export function pairsComboCount(
  words: Inventory,
  tier: Tier,
  combo: Tone[],
  style: SpeechStyle,
): number | null {
  if (!words) return null;
  const pool = resolvedPool([...words], tier, "pairs", "beginner", null, style);
  return orNull(wordsOfCombo(pool, combo).length);
}

/**
 * The visualiser's single-syllable list: TOCFL-narrowed (only when the tier has
 * levels), then style-filtered. The visualiser builds it from the RAW inventory,
 * not the tier pool — its own gate is `wordsPerTone`, not `min_tier`.
 */
export function visualiserListWords(
  words: readonly Word[],
  tier: Tier,
  selectedLevels: readonly TocflLevel[],
  style: SpeechStyle,
): Word[] {
  const levels = tierLimits()[tier].beginner.levels;
  return wordsInStyle(
    levels === null
      ? [...words]
      : wordsForList([...words], selectedLevels.length > 0 ? [...selectedLevels] : levels, "beginner"),
    style,
  );
}

/** The visualiser's two-syllable list, in the effective style. */
export function visualiserPairWords(words: readonly Word[], style: SpeechStyle): Word[] {
  return wordsInStyle(multiWords([...words]), style);
}

/** Words the player can practise for one tone — the word rail's length. */
export function visualiserToneCount(
  listWords: readonly Word[],
  tier: Tier,
  tone: Tone,
): number | null {
  return orNull(wordsOfTone([...listWords], tone, tierLimits()[tier].wordsPerTone).length);
}

/** Words the player can practise for one pair — the word rail's length. */
export function visualiserComboCount(
  pairWords: readonly Word[],
  tier: Tier,
  combo: Tone[],
): number | null {
  return orNull(wordsOfCombo([...pairWords], combo, tierLimits()[tier].pairWordsPerCombo).length);
}

/** "(12 words)" / "(1 word)"; empty string for no count. */
export function wordCountLabel(n: number | null): string {
  if (n === null) return "";
  return n === 1 ? "(1 word)" : `(${n} words)`;
}
