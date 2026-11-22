/**
 * Where the join of each tone pair usually sits, per speech style (brief 49).
 * The table is GENERATED from Jane's clips by `node src/dev/bench39/cut49ship.mjs --emit`
 * (pairCutSpotsData.ts); do not edit it by hand. Pure — no Web Audio.
 *
 * Keys are SPOKEN tones (sandhi applied: 你好 is "23"). A pair without an
 * entry (a neutral tone, too few clips) falls back to the brief 46 finder.
 */
import type { PairCutSpot } from "./syllables.ts";
import type { SpeechStyle } from "./words.ts";
import { PAIR_CUT_SPOTS } from "./pairCutSpotsData.ts";

let override: Record<SpeechStyle, Record<string, PairCutSpot>> | null = null;

/** The spot for this style and spoken tone pair, or null. */
export function pairCutSpot(style: SpeechStyle, tones: readonly number[]): PairCutSpot | null {
  if (tones.length !== 2) return null;
  return (override ?? PAIR_CUT_SPOTS)[style]?.[tones.join("")] ?? null;
}

/** Bench and tests only: read from another table (null = the shipped one). */
export function setPairCutSpots(table: Record<SpeechStyle, Record<string, PairCutSpot>> | null): void {
  override = table;
}
