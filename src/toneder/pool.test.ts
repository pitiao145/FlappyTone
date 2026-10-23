import { describe, expect, it } from "vitest";
import { catalogFromFallback } from "../data/words.ts";
import { hasSimplified } from "../dev/simplified.ts";
import type { Word } from "../game/words.ts";
import { levelAllowed, tierPool, usablePool } from "./pool.ts";
import { TEST_WORDS } from "./toneTest.ts";

const words = catalogFromFallback();

describe("TONEder app pool per tier", () => {
  it("guest gets the 76 guest-playable single-syllable words", () => {
    const g = tierPool(words, "guest", "standard");
    expect(g.length).toBe(76);
    expect(g.some((w) => hasSimplified(w.hanzi))).toBe(false);
    const ids = new Set(g.map((w) => w.id));
    for (const w of TEST_WORDS) expect(ids.has(w.id), w.id).toBe(true);
  });

  it("free and Pro get what their ticket may play (187 and 211 in the bundled catalog)", () => {
    expect(tierPool(words, "free", "standard").length).toBe(187);
    expect(tierPool(words, "pro", "standard").length).toBe(211);
    for (const t of ["guest", "free", "pro"] as const) expect(usablePool(tierPool(words, t, "standard"))).toBe(true);
  });

  it("mirrors the Worker's level gate", () => {
    expect(levelAllowed(["tocfl3"], "free")).toBe(false);
    expect(levelAllowed(["tocfl3"], "pro")).toBe(true);
    expect(levelAllowed(["tocfl1"], "guest")).toBe(false);
    expect(levelAllowed(["tocfl1", "sampler-seo"], "guest")).toBe(true);
    expect(levelAllowed(["core-120"], "guest")).toBe(true);
  });

  it("Spoken keeps only words with a natural take", () => {
    const [a, b] = words.filter((w) => w.syllables === 1);
    const nat = { ...a, natural: a.natural ?? ({} as NonNullable<Word["natural"]>) };
    const none = { ...b, natural: undefined };
    expect(tierPool([nat, none], "pro", "spoken").map((w) => w.id)).toEqual([a.id]);
  });

  it("drops another speaker's words and pro-only words below Pro", () => {
    const w = words.find((x) => x.syllables === 1)!;
    expect(tierPool([{ ...w, speakerId: "other" }], "pro", "standard")).toEqual([]);
    expect(tierPool([{ ...w, minTier: "pro" }], "free", "standard")).toEqual([]);
    expect(tierPool([{ ...w, minTier: "pro" }], "pro", "standard").length).toBe(1);
  });
});
