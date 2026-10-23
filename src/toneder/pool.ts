/**
 * The app's TONEder word pool, read from the bundled catalog fallback (the
 * app ships it already): every published single-syllable word a guest
 * ticket can play, in both styles. 76 words today.
 *
 * Free and Pro are meant to get all 211 published words, but the Worker only
 * serves the rest to tickets whose tier the word's lists allow (a membership
 * change, brief 20 "ask first"). Until that lands every tier gets the 76.
 */
import fallback from "../data/wordsFallback.json";
import type { Tier } from "../game/tiers.ts";
import type { TestWord, Tone } from "./toneTest.ts";

interface Row {
  id: string;
  hanzi: string;
  pinyin: string;
  tone: number;
  english?: string;
  syllables: number;
  status: string;
  lists?: string[] | null;
}

/** Mirrors workers/clips/src/routes/clip.ts' sampler lists and level gate. */
const GUEST_SAMPLERS = new Set(["sampler-beginner", "sampler-intermediate", "sampler-seo"]);

export function guestPlayable(lists: readonly string[]): boolean {
  return lists.some((l) => GUEST_SAMPLERS.has(l)) || !lists.some((l) => /^tocfl\d$/.test(l));
}

export function guestPool(rows: readonly Row[]): TestWord[] {
  return rows
    .filter(
      (r) =>
        r.status === "published" &&
        r.syllables === 1 &&
        r.tone >= 1 &&
        r.tone <= 4 &&
        guestPlayable(r.lists ?? []),
    )
    .map((r) => ({
      id: r.id,
      hanzi: r.hanzi,
      pinyin: r.pinyin,
      tone: r.tone as Tone,
      english: r.english ?? "",
    }));
}

let cached: TestWord[] | null = null;

/** The words a tier's rounds draw from. Every tier: the guest pool, until the membership change. */
export function poolForTier(tier: Tier): readonly TestWord[] {
  void tier;
  cached ??= guestPool((fallback as { rows: Row[] }).rows);
  return cached;
}
