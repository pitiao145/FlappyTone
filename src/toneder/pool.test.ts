import { describe, expect, it } from "vitest";
import { hasSimplified } from "../dev/simplified.ts";
import { poolForTier } from "./pool.ts";
import { TEST_WORDS, TONES } from "./toneTest.ts";

describe("TONEder app pool per tier", () => {
  it("guest gets the 76 guest-playable single-syllable words", () => {
    const g = poolForTier("guest");
    expect(g.length).toBe(76);
    expect(new Set(g.map((w) => w.id)).size).toBe(76);
    expect(g.some((w) => hasSimplified(w.hanzi))).toBe(false);
    for (const t of TONES) expect(g.filter((w) => w.tone === t).length).toBeGreaterThanOrEqual(3);
    for (const w of g) expect(w.english, w.id).not.toBe("");
  });

  it("includes every word of the public page", () => {
    const ids = new Set(poolForTier("guest").map((w) => w.id));
    for (const w of TEST_WORDS) expect(ids.has(w.id), w.id).toBe(true);
  });

  it("free and Pro get the same 76 until the membership change lands", () => {
    expect(poolForTier("free")).toEqual(poolForTier("guest"));
    expect(poolForTier("pro")).toEqual(poolForTier("guest"));
  });
});
